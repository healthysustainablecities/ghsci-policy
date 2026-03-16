import { defineFunction } from "@aws-amplify/backend";

export const triggerProcessing = defineFunction({
  name: 'trigger-processing',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'data', // Place in data stack to avoid circular dependency with storage
  environment: {
    PROCESS_LAMBDA_ARN: '',
  },
});
