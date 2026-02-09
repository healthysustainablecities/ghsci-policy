import { defineFunction } from "@aws-amplify/backend";

export const processReportFunctionHandler = defineFunction({
  name: 'process-policy-report',
  entry: './handler.py',
  timeoutSeconds: 300,
  environment: {
    // These will be overridden in backend.ts with actual values
    STORAGE_BUCKET: '',
    POLICY_REPORT_TABLE: '',
  },
});