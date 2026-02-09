import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defineFunction } from "@aws-amplify/backend";
import { DockerImage, Duration } from "aws-cdk-lib";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";

const functionDir = path.dirname(fileURLToPath(import.meta.url));

export const processReportFunctionHandler = defineFunction(
  (scope) =>
    new Function(scope, 'process-policy-report', {
      handler: "handler.handler",
      runtime: Runtime.PYTHON_3_13,
      timeout: Duration.seconds(300),
      code: Code.fromAsset(functionDir, {
        bundling: {
          image: DockerImage.fromRegistry("python:3.13-slim"),
          command: [
            '/bin/sh', '-c',
            'pip install -r requirements.txt -t /asset-output && cp *.py /asset-output/'
          ],
          user: 'root',
        },
      }),
    }),
    {
      resourceGroupName: "auth"
    }
);