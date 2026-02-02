import { defineFunction } from '@aws-amplify/backend';

export const processReport = defineFunction({
  name: 'process-policy-report',
  entry: './handler.py',
  runtime: 20,
  environment: {
    STORAGE_BUCKET_NAME: process.env.STORAGE_BUCKET_NAME || '',
    GRAPHQL_ENDPOINT: process.env.GRAPHQL_ENDPOINT || ''
  },
  timeoutSeconds: 300
});