# Per-user S3 isolation — migration and rollout plan

## What changed (Tier 2)

Previously every authenticated user had `read`/`write`/`delete` on `public/*`,
so any signed-in user could list, read, overwrite, or delete any other user's
files. Folder-by-username (`public/{username}/...`) was a naming convention
only — nothing enforced it.

Storage access is now enforced by IAM using the caller's **Cognito Identity
ID** (Amplify `{entity_id}` paths):

| Content            | Old key                              | New key                                    |
|--------------------|--------------------------------------|--------------------------------------------|
| Checklist uploads  | `public/{username}/{file}.xlsx`      | `private/{identityId}/{file}.xlsx`          |
| Form submissions   | `public/{username}/form-{ts}.xlsx`   | `private/{identityId}/form-{ts}.xlsx`       |
| Incomplete forms   | `public/{username}/incomplete-*.json`| `private/{identityId}/incomplete-*.json`    |
| Report images      | `public/{username}/images/{file}`    | `private/{identityId}/images/{file}`        |
| Generated PDFs     | `public/reports/{file}.pdf` (shared!)| `private/{identityId}/reports/{file}.pdf`   |

Enforcement points:

- `amplify/storage/resource.ts` — `private/{entity_id}/*` grants
  `read`/`write`/`delete` to the owning identity only (`allow.entity('identity')`).
  Admins get `read` (Amplify only permits `read` for non-entity rules on
  `{entity_id}` paths).
- `amplify/backend.ts` — the extra wildcard policy on the authenticated role is
  scoped with the `${cognito-identity.amazonaws.com:sub}` IAM policy variable,
  which IAM resolves per-request to the caller's own identity ID.
- The Python Lambda (`process-policy-report`) keeps bucket-wide
  `grantReadWrite` and now writes PDFs next to the source file
  (`get_user_report_prefix()` in `handler.py`), so it works for both new
  `private/...` and legacy `public/...` keys. The EventBridge rule matches any
  `.xlsx` object creation, so new paths still trigger processing.

## Transition period (current state)

Legacy objects under `public/*` remain in place. During transition,
authenticated users have **read-only** access to `public/*`:

- **Viewing/downloading old reports works** — stored `fileKey`/`pdfUrl`/`pdfUrls`
  record values are absolute S3 keys, and `getUrl({ path })` only needs read.
- **Regenerating an old report works** — the Lambda reads the legacy xlsx and
  writes new PDFs to `public/{username}/reports/...` (derived from the source
  key), which users can read.
- **Deleting an old report** removes the DynamoDB record, but the client-side
  S3 `remove()` calls on `public/...` keys now fail (they are caught and
  logged; the UI flow is unaffected). Orphaned legacy objects are cleaned up
  in the final admin sweep below. If full legacy delete is preferred during
  transition, add `'delete'` to the `public/*` authenticated rule in
  `amplify/storage/resource.ts` — the trade-off is that cross-user deletion
  remains possible until the rule is removed.
- **Cross-user overwrite/delete of legacy files is blocked immediately**, and
  no new objects can be created under `public/*` by regular users. Cross-user
  *read* of legacy files remains possible until the transition ends.

## Migration options for existing data

### Option A (recommended): natural expiry + admin sweep

Suitable if the number of active legacy reports is small.

1. Deploy this change. New uploads and regenerations of new reports are
   isolated immediately.
2. Announce a transition window (e.g. 1–3 months): "older reports remain
   viewable; regenerate or re-upload to move them to your private space."
   Re-uploading the xlsx (downloadable from each report card) creates a fully
   private copy.
3. At the end of the window, an admin:
   - Exports the `PolicyReport` table and lists remaining records with
     `fileKey` beginning `public/`.
   - Contacts affected users, or leaves records in place read-only.
   - Deletes unreferenced objects under `public/` (compare S3 listing with
     the `fileKey`/`pdfUrl`/`pdfUrls`/`reportConfig.reporting.images[*].s3Key`
     values still present in the table).
4. Remove the `public/*` rules from `amplify/storage/resource.ts` and the
   transitional `s3:GetObject` statement from `amplify/backend.ts`.

### Option B: scripted migration (rewrite keys)

Suitable if legacy reports must be preserved verbatim for all users.

The blocker is the username → identityId mapping: an Identity Pool identity ID
is created lazily on first authenticated session and is not directly listable
by username. Two practical mappings:

- **Lazy client-side migration**: on sign-in, for each of the user's own
  records (records are `allow.owner()`-scoped) whose `fileKey` starts with
  `public/`, the app copies each object to the equivalent
  `private/{identityId}/...` key (download via read access + re-upload), then
  updates `fileKey`, `pdfUrl`, `pdfUrls`, and any
  `reportConfig.reporting.images[*].s3Key` in the record. Requires only the
  access rules already in place. Old objects are left for the admin sweep
  (users cannot delete them).
- **Admin-side migration**: capture the identityId server-side (e.g. a
  one-time Lambda the client calls when signed in, recording
  `username → identityId` in DynamoDB), then run an admin script with bucket
  access that copies `public/{username}/*` → `private/{identityId}/*`, rewrites
  the record keys, and deletes the originals.

After either variant completes for all records, do step 4 of Option A.

## Rollout checklist

1. Merge and deploy the Amplify backend + frontend together (the frontend
   writes `private/...` paths that only the new access rules allow).
2. Smoke test in a sandbox: upload xlsx → record `fileKey` is
   `private/{identityId}/...` → processing triggers → PDF lands in
   `private/{identityId}/reports/` → view/download PDF → upload settings
   image → regenerate → delete report (record and S3 objects removed).
3. Cross-user test with two accounts: user B cannot `getUrl`/`remove` user A's
   `private/...` keys (AccessDenied), and can still read but not write/delete
   `public/...` legacy keys.
4. Verify legacy reports of an existing account still view/download/regenerate.
5. Schedule the end-of-transition tasks (admin sweep + rule removal).

## Notes

- `handler.py` / `ghsci.py` are shared with
  `healthysustainablecities/global-indicators`; the only change there is the
  new additive helper `get_user_report_prefix()` plus using it at the four PDF
  upload sites — no existing function signatures changed, and behaviour for
  keys without a folder component falls back to the previous
  `public/reports/` prefix.
- The unused legacy `cleanup-policy-files` function still references
  `uploads/{userId}` and `public/` keys; it is not registered in
  `backend.ts` and is unaffected.
