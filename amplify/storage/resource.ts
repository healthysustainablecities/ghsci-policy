import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'policyReportsStorage',
  access: (allow) => ({
    // Per-user isolated storage, enforced by IAM via the Cognito Identity ID.
    // Uploads:   private/{identityId}/{file}.xlsx
    // Images:    private/{identityId}/images/{file}
    // Reports:   private/{identityId}/reports/{file}.pdf (written by the Lambda)
    // Amplify only permits 'read' for non-entity rules on {entity_id} paths,
    // so Admins get read here; admin write/delete happens via the console/CLI.
    'private/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.groups(['Admins']).to(['read'])
    ],
    // Legacy area (transitional): objects created before per-user isolation
    // live under public/{username}/... and public/reports/... Read-only access
    // keeps existing reports viewable and regenerable until they are migrated
    // or expire; write/delete is intentionally revoked so users can no longer
    // modify or remove each other's files.
    'public/*': [
      allow.authenticated.to(['read']),
      allow.groups(['Admins']).to(['read', 'write', 'delete'])
    ]
  })
});
