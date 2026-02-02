import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { createProcessPolicyReportFunction } from './functions/process-policy-report/resource';
import { createCleanupPolicyFilesFunction } from './functions/cleanup-policy-files/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { S3EventSource, DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { EventType } from 'aws-cdk-lib/aws-s3';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';

const backend = defineBackend({
  auth,
  data,
  storage,
});

const policyReportTable = backend.data.resources.tables["PolicyReport"];
const storageBucket = backend.storage.resources.bucket;

const functionsStack = backend.createStack('FunctionsStack');

const processPolicyReportFunction = createProcessPolicyReportFunction(
  functionsStack,
  policyReportTable.tableName,
  storageBucket.bucketName
);

const cleanupFunction = createCleanupPolicyFilesFunction(
  functionsStack,
  storageBucket.bucketName
);

// Grant permissions using explicit policies
processPolicyReportFunction.addToRolePolicy(new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan'],
  resources: [policyReportTable.tableArn]
}));

processPolicyReportFunction.addToRolePolicy(new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
  resources: [`${storageBucket.bucketArn}/*`]
}));

cleanupFunction.addToRolePolicy(new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ['s3:DeleteObject'],
  resources: [`${storageBucket.bucketArn}/*`]
}));
