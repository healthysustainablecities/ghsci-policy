import json
import boto3
import os
from urllib.parse import unquote_plus

def handler(event, context):
    """
    Lambda function to process policy report uploads
    """
    print(f"Processing event: {json.dumps(event, indent=2)}")
    
    try:
        # Extract S3 event information
        for record in event.get('Records', []):
            if record.get('eventSource') == 'aws:s3':
                bucket_name = record['s3']['bucket']['name']
                object_key = unquote_plus(record['s3']['object']['key'])
                
                print(f"Processing file: {object_key} from bucket: {bucket_name}")
                
                # Here you would implement the actual processing logic:
                # 1. Download the Excel file from S3
                # 2. Process it to extract policy data
                # 3. Generate PDF report
                # 4. Upload PDF back to S3
                # 5. Update database record
                
                # For now, just log the processing
                print(f"File {object_key} processed successfully")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Policy report processed successfully'
            })
        }
        
    except Exception as e:
        print(f"Error processing policy report: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to process policy report',
                'details': str(e)
            })
        }