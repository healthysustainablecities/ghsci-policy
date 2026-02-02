import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'policyReportsStorage',
  access: (allow) => ({
    'public/uploads/*': [
      allow.authenticated.to(['read', 'write', 'delete'])
    ],
    'public/reports/*': [
      allow.authenticated.to(['read', 'write', 'delete'])
    ]
  })
});