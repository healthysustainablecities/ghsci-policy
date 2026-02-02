import { defineFunction } from '@aws-amplify/backend';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';

export const processReport = defineFunction({
  name: 'process-policy-report',
  entry: './handler.ts'
});