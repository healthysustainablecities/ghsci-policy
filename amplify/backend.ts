import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { EventType } from 'aws-cdk-lib/aws-s3';
import * as path from "node:path";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { fileURLToPath } from "node:url";
import * as iam from 'aws-cdk-lib/aws-iam';
import { defineFunction } from "@aws-amplify/backend";
import { CfnOutput, DockerImage, Duration } from "aws-cdk-lib";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Bucket } from "aws-cdk-lib/aws-s3";

const backend = defineBackend({
  auth,
  data,
  storage,
});

const customResourceStack = backend.createStack('GHSCIPolicyStack');

// Add S3 permissions using wildcard to avoid circular dependency
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
    resources: ['arn:aws:s3:::*amplify*policy*storage*/public/*'],
  })
);

const processReportFunctionHandler = new lambda.Function(customResourceStack, 'process-policy-report', {
      handler: "handler.handler",
      runtime: Runtime.PYTHON_3_13,
      timeout: Duration.seconds(300),
      code: Code.fromAsset('amplify/functions/process-policy-report', {
        bundling: {
          image: DockerImage.fromRegistry("python:3.13-slim"),
          command: [
            '/bin/sh', '-c',
            'pip install -r requirements.txt -t /asset-output && cp *.py /asset-output/'
          ],
          user: 'root',
        },
      }),
      environment: {
        STORAGE_BUCKET: backend.storage.resources.bucket.bucketName,
        POLICY_REPORT_TABLE: backend.data.resources.tables['PolicyReport'].tableName,
      },
    }
);

processReportFunctionHandler.addPermission('AllowAuthenticatedUserInvoke', {
  principal: new iam.ServicePrincipal('lambda.amazonaws.com'),
  action: 'lambda:InvokeFunction',
  sourceArn: backend.auth.resources.authenticatedUserIamRole.roleArn,
})

// Set up S3 event notification to trigger Lambda on .xlsx uploads
processReportFunctionHandler.addEventSource(
  new S3EventSource( 
    backend.storage.resources.bucket as Bucket, {
    events: [EventType.OBJECT_CREATED],
    filters: [{ suffix: '.xlsx' }],
  })
);