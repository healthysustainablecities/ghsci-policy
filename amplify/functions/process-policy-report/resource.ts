import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export const createProcessPolicyReportFunction = (scope: Construct, tableName: string, bucketName: string) => {
  return new Function(scope, 'ProcessPolicyReport', {
    runtime: Runtime.PYTHON_3_11,
    handler: 'handler.handler',
    code: Code.fromAsset('./amplify/functions/process-policy-report'),
    timeout: Duration.minutes(5),
    memorySize: 1024,
    environment: {
      POLICY_REPORT_TABLE: tableName,
      STORAGE_BUCKET: bucketName
    }
  });
};