import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient({});

export const handler = async (event: any) => {
  console.log('Trigger processing event:', JSON.stringify(event, null, 2));

  const { fileKey, reportConfig, bucket, formData, syntheticKey } = event.arguments;

  // Form submission path
  if (formData) {
    const effectiveBucket = bucket || process.env.STORAGE_BUCKET;
    if (!effectiveBucket) {
      return { success: false, message: 'Missing required parameter: bucket' };
    }
    const processLambdaArn = process.env.PROCESS_LAMBDA_ARN;
    if (!processLambdaArn) {
      return { success: false, message: 'PROCESS_LAMBDA_ARN environment variable not set' };
    }

    const formPayload = {
      formData: typeof formData === 'string' ? JSON.parse(formData) : formData,
      bucket: effectiveBucket,
      syntheticKey: syntheticKey || '',
      reportConfig: reportConfig || null,
    };

    try {
      const command = new InvokeCommand({
        FunctionName: processLambdaArn,
        InvocationType: 'Event',
        Payload: JSON.stringify(formPayload),
      });
      const response = await lambdaClient.send(command);
      if (response.StatusCode && response.StatusCode >= 300) {
        throw new Error(`Lambda invocation failed with status ${response.StatusCode}`);
      }
      return { success: true, message: 'Form processing started successfully' };
    } catch (error) {
      console.error('Failed to trigger form processing:', error);
      return { success: false, message: `Failed to trigger form processing: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  // Standard xlsx upload path
  if (!fileKey || !bucket) {
    const errorMsg = 'Missing required parameters: fileKey and bucket';
    console.error(errorMsg);
    return {
      success: false,
      message: errorMsg
    };
  }

  const processLambdaArn = process.env.PROCESS_LAMBDA_ARN;
  if (!processLambdaArn) {
    const errorMsg = 'PROCESS_LAMBDA_ARN environment variable not set';
    console.error(errorMsg);
    return {
      success: false,
      message: errorMsg
    };
  }

  try {
    // Construct S3 event payload to invoke the processing Lambda
    const s3Event = {
      Records: [{
        eventSource: 'aws:s3',
        eventName: 'ObjectCreated:Put',
        s3: {
          bucket: {
            name: bucket
          },
          object: {
            key: fileKey
          }
        }
      }],
      reportConfig: reportConfig // Pass custom config
    };

    console.log('Invoking process Lambda:', processLambdaArn);
    console.log('Payload:', JSON.stringify(s3Event, null, 2));

    // Invoke the process-policy-report Lambda
    const command = new InvokeCommand({
      FunctionName: processLambdaArn,
      InvocationType: 'Event', // Async invocation
      Payload: JSON.stringify(s3Event)
    });

    const response = await lambdaClient.send(command);
    console.log('Lambda invocation response:', JSON.stringify(response, null, 2));

    // Check for invocation errors
    if (response.StatusCode && response.StatusCode >= 300) {
      throw new Error(`Lambda invocation failed with status ${response.StatusCode}`);
    }

    if (response.FunctionError) {
      throw new Error(`Lambda function error: ${response.FunctionError}`);
    }

    console.log('Processing triggered successfully');
    return {
      success: true,
      message: 'Processing started successfully'
    };
  } catch (error) {
    console.error('Failed to trigger processing:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return {
      success: false,
      message: `Failed to trigger processing: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};
