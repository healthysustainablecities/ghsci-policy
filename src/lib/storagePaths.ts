import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Resolve the caller's Cognito Identity ID. Storage paths are keyed by this
 * (private/{identityId}/...) so that IAM enforces per-user access — see
 * amplify/storage/resource.ts.
 */
export const getIdentityId = async (): Promise<string> => {
  const { identityId } = await fetchAuthSession();
  if (!identityId) {
    throw new Error('Could not determine identity ID — are you signed in?');
  }
  return identityId;
};

/**
 * Build the per-user S3 path for a file, e.g.
 *   userStoragePath('checklist.xlsx')      → private/{identityId}/checklist.xlsx
 *   userStoragePath('images/photo.jpg')    → private/{identityId}/images/photo.jpg
 */
export const userStoragePath = async (suffix: string): Promise<string> =>
  `private/${await getIdentityId()}/${suffix}`;
