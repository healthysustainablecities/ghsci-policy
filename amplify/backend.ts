import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { EventType } from 'aws-cdk-lib/aws-s3';
import * as aws_s3_notifications from 'aws-cdk-lib/aws-s3-notifications';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';

const backend = defineBackend({
  auth,
  data,
  storage,
});

// Get storage stack to add Lambda there
const storageStack = backend.storage.resources.bucket.stack;

// Create Python Lambda in storage stack to avoid circular dependency
const processReportFunctionHandler = new Function(storageStack, 'ProcessPolicyReport', {
  runtime: Runtime.PYTHON_3_13,
  handler: 'handler.handler',
  code: Code.fromAsset('amplify/functions/process-policy-report'),
  timeout: Duration.seconds(300),
  memorySize: 1024, // Increase memory for pandas/fpdf processing
  environment: {
    STORAGE_BUCKET: backend.storage.resources.bucket.bucketName,
    POLICY_REPORT_TABLE: backend.data.resources.tables['PolicyReport'].tableName,
  },
});

// Add S3 permissions using wildcard to avoid circular dependency
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
    resources: [
      'arn:aws:s3:::*amplify*policy*storage*/public/*'
    ],
  })
);

// Grant Lambda permissions to access S3 bucket
const s3Bucket = backend.storage.resources.bucket;
s3Bucket.grantReadWrite(processReportFunctionHandler);

// Grant Lambda permissions to update DynamoDB table
backend.data.resources.tables['PolicyReport'].grantReadWriteData(
  processReportFunctionHandler
);

// Set up S3 event notification from the bucket side (not Lambda side) to avoid circular dependency
s3Bucket.addEventNotification(
  EventType.OBJECT_CREATED,
  new aws_s3_notifications.LambdaDestination(processReportFunctionHandler),
  { suffix: '.xlsx' }
);

// Output Lambda function name for easy CloudWatch debugging
backend.addOutput({
  custom: {
    ProcessPolicyReportLambda: {
      functionName: processReportFunctionHandler.functionName,
      functionArn: processReportFunctionHandler.functionArn,
    }
  }
});