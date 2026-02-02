import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'policyReportsStorage',
  access: (allow) => ({
    'private/uploads/*': [
      allow.entity('identity').to(['read', 'write', 'delete', 'list'])
    ],
    'private/reports/*': [
      allow.entity('identity').to(['read', 'write', 'delete', 'list'])
    ]
  })
});