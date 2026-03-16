import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { triggerProcessing } from './functions/trigger-processing/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

const backend = defineBackend({
  auth,
  data,
  storage,
  triggerProcessing,
});

// Place Python Lambda in data stack so all data-related resources are co-located,
// avoiding a circular dependency between storage and data stacks.
const dataStack = backend.data.stack;

const processReportFunctionHandler = new Function(dataStack, 'ProcessPolicyReport', {
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

// Add Bedrock permissions for AI conversations
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'bedrock:InvokeModel',
      'bedrock:InvokeModelWithResponseStream',
    ],
    resources: [
      'arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-6-*',
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

// Configure trigger-processing function
backend.triggerProcessing.addEnvironment('PROCESS_LAMBDA_ARN', processReportFunctionHandler.functionArn);
backend.triggerProcessing.addEnvironment('STORAGE_BUCKET', backend.storage.resources.bucket.bucketName);

// Grant trigger function permission to invoke process Lambda
backend.triggerProcessing.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['lambda:InvokeFunction'],
    resources: [processReportFunctionHandler.functionArn],
  })
);

// Enable EventBridge notifications on the S3 bucket (no Lambda ARN in storage stack,
// which avoids a circular stack dependency). The rule targeting the Lambda lives in
// the data stack which already depends on storage.
s3Bucket.enableEventBridgeNotification();

const xlsxUploadRule = new events.Rule(dataStack, 'XlsxUploadRule', {
  eventPattern: {
    source: ['aws.s3'],
    detailType: ['Object Created'],
    detail: {
      bucket: { name: [s3Bucket.bucketName] },
      object: { key: [{ suffix: '.xlsx' }] },
    },
  },
});
xlsxUploadRule.addTarget(new targets.LambdaFunction(processReportFunctionHandler));

// Output Lambda function name for easy CloudWatch debugging
backend.addOutput({
  custom: {
    ProcessPolicyReportLambda: {
      functionName: processReportFunctionHandler.functionName,
      functionArn: processReportFunctionHandler.functionArn,
    }
  }
});