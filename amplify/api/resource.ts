import { defineBackend } from '@aws-amplify/backend';
import { Stack } from 'aws-cdk-lib';
import { RestApi, LambdaIntegration, Cors, CognitoUserPoolsAuthorizer, RequestValidator, Model, JsonSchemaType } from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';

export function createRestApi(backend: any, processFn: any, cleanupFn: any, userPoolId: string) {
  const apiStack = backend.createStack('RestApiStack');
  
  const api = new RestApi(apiStack, 'PolicyReportRestApi', {
    restApiName: 'PolicyReportApi',
    description: 'REST API for Policy Report processing',
    defaultCorsPreflightOptions: {
      allowOrigins: ['http://localhost:5173', 'https://*.amplifyapp.com'],
      allowMethods: ['POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization']
    }
  });

  // Add Cognito authorizer
  const userPool = UserPool.fromUserPoolId(apiStack, 'ImportedUserPool', userPoolId);
  const authorizer = new CognitoUserPoolsAuthorizer(apiStack, 'ApiAuthorizer', {
    cognitoUserPools: [userPool]
  });

  // Request validation
  const requestValidator = new RequestValidator(apiStack, 'RequestValidator', {
    restApi: api,
    validateRequestBody: true,
    validateRequestParameters: true
  });

  // Request models
  const processModel = new Model(apiStack, 'ProcessModel', {
    restApi: api,
    contentType: 'application/json',
    schema: {
      type: JsonSchemaType.OBJECT,
      properties: {
        fileName: { type: JsonSchemaType.STRING, maxLength: 255 }
      },
      required: ['fileName']
    }
  });

  const cleanupModel = new Model(apiStack, 'CleanupModel', {
    restApi: api,
    contentType: 'application/json',
    schema: {
      type: JsonSchemaType.OBJECT,
      properties: {
        fileName: { type: JsonSchemaType.STRING, maxLength: 255 },
        pdfUrl: { type: JsonSchemaType.STRING, maxLength: 500 }
      },
      required: ['fileName']
    }
  });

  // Add secured endpoints
  api.root.addResource('process').addMethod('POST', new LambdaIntegration(processFn), {
    authorizer,
    requestValidator,
    requestModels: { 'application/json': processModel }
  });
  
  api.root.addResource('cleanup').addMethod('POST', new LambdaIntegration(cleanupFn), {
    authorizer,
    requestValidator,
    requestModels: { 'application/json': cleanupModel }
  });

  // Add to backend outputs
  backend.addOutput({
    custom: {
      API: {
        REST: {
          PolicyReportApi: {
            endpoint: api.url,
            region: apiStack.region
          }
        }
      }
    }
  });

  return api;
}