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

// Roles end users can assume. Cognito assigns members of a group that group's
// IAM role INSTEAD of the default authenticated role (it does not inherit its
// policies), so every user-facing grant must be attached to both.
const endUserRoles = [
  backend.auth.resources.authenticatedUserIamRole,
  backend.auth.resources.groups['Admins'].role,
];

for (const role of endUserRoles) {
  // Add S3 permissions using wildcard to avoid circular dependency.
  // Full access is scoped to the caller's own identity prefix via the
  // ${cognito-identity.amazonaws.com:sub} IAM policy variable (the literal
  // string is intentional — IAM resolves it per-request to the identity ID).
  role.addToPrincipalPolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
      resources: [
        'arn:aws:s3:::*amplify*policy*storage*/private/${cognito-identity.amazonaws.com:sub}/*'
      ],
    })
  );

  // Transitional: read-only access to legacy pre-isolation objects
  // (public/{username}/... and public/reports/...) so existing reports keep
  // working. Remove once legacy data is migrated (see STORAGE_MIGRATION.md).
  role.addToPrincipalPolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: [
        'arn:aws:s3:::*amplify*policy*storage*/public/*'
      ],
    })
  );

  // Add Bedrock permissions for AI conversations
  role.addToPrincipalPolicy(
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
}

// Grant Lambda permissions to access S3 bucket
const s3Bucket = backend.storage.resources.bucket;
s3Bucket.grantReadWrite(processReportFunctionHandler);

// Grant Lambda permissions to update DynamoDB table
const policyReportTable = backend.data.resources.tables['PolicyReport'];
policyReportTable.grantReadWriteData(processReportFunctionHandler);

// Explicitly allow querying the fileKey GSI and discovering it via DescribeTable
// (grantReadWriteData on ITable does not always cover secondary indexes)
processReportFunctionHandler.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['dynamodb:Query', 'dynamodb:DescribeTable'],
    resources: [
      policyReportTable.tableArn,
      `${policyReportTable.tableArn}/index/*`,
    ],
  })
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