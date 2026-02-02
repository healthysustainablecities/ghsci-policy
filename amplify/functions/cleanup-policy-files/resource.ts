import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export const createCleanupPolicyFilesFunction = (scope: Construct, bucketName: string) => {
  return new Function(scope, 'CleanupPolicyFiles', {
    runtime: Runtime.PYTHON_3_11,
    handler: 'handler.handler',
    code: Code.fromAsset('./amplify/functions/cleanup-policy-files'),
    timeout: Duration.minutes(1),
    memorySize: 256,
    environment: {
      STORAGE_BUCKET: bucketName
    }
  });
};