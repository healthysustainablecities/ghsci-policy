import { defineFunction } from "@aws-amplify/backend";

export const triggerProcessing = defineFunction({
  name: 'trigger-processing',
  entry: './handler.ts',
  timeoutSeconds: 30,
  environment: {
    PROCESS_LAMBDA_ARN: '',
  },
});
