import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { processReportFunctionHandler } from './functions/process-policy-report/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { EventType } from 'aws-cdk-lib/aws-s3';

const backend = defineBackend({
  auth,
  data,
  storage,
  processReportFunctionHandler,
});

// Add S3 permissions using wildcard to avoid circular dependency
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
    resources: ['arn:aws:s3:::*amplify*policy*storage*/public/*'],
  })
);

// Grant Lambda permissions to access S3 bucket
const s3Bucket = backend.storage.resources.bucket;
s3Bucket.grantReadWrite(backend.processReportFunctionHandler.resources.lambda);

// Grant Lambda permissions to update DynamoDB table
backend.data.resources.tables['PolicyReport'].grantReadWriteData(
  backend.processReportFunctionHandler.resources.lambda
);

// Add environment variables to Lambda
backend.processReportFunctionHandler.resources.lambda.addEnvironment(
  'STORAGE_BUCKET',
  s3Bucket.bucketName
);
backend.processReportFunctionHandler.resources.lambda.addEnvironment(
  'POLICY_REPORT_TABLE',
  backend.data.resources.tables['PolicyReport'].tableName
);

// Set up S3 event notification to trigger Lambda on .xlsx uploads
backend.processReportFunctionHandler.resources.lambda.addEventSource(
  new S3EventSource(s3Bucket, {
    events: [EventType.OBJECT_CREATED],
    filters: [{ suffix: '.xlsx' }],
  })
);