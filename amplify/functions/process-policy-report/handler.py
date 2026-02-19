import sys
import os

# Add lib directory to path for local dependencies
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))

import boto3
import json
import pandas as pd
from urllib.parse import unquote_plus
from datetime import datetime
from ghsci import generate_online_policy_report

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

def handler(event, context):
    """
    Lambda function to process policy report uploads
    """
    print(f"Processing event: {json.dumps(event, indent=2)}")

    # 1. Extract bucket and key from the S3 event
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = unquote_plus(event['Records'][0]['s3']['object']['key'])

    try:
        process_report(bucket, key)
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Processing completed successfully'})
        }
    except Exception as e:
        print(f"Error processing policy report: {str(e)}")
        # Update status to FAILED
        try:
            update_report_status(key, 'FAILED', error_message=str(e))
        except Exception as update_error:
            print(f"Failed to update status: {str(update_error)}")

        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to process policy report',
                'details': str(e)
            })
        }

def get_table():
    """Get DynamoDB table reference"""
    table_name = os.environ.get('POLICY_REPORT_TABLE')
    if not table_name:
        raise ValueError("POLICY_REPORT_TABLE environment variable not set")
    return dynamodb.Table(table_name)

def update_report_status(file_key, status, pdf_url=None, error_message=None):
    """Update the PolicyReport record in DynamoDB"""
    try:
        table = get_table()
        
        print(f"S3 fileKey: {file_key}")
        print(f"Searching database for: {file_key}")

        # Find the record by matching the full file key
        response = table.scan(
            FilterExpression='fileKey = :fk',
            ExpressionAttributeValues={':fk': file_key}
        )
        
        print(f"Scan response: {response}")

        if not response.get('Items'):
            print(f"No record found for fileKey: {file_key}")
            return

        item = response['Items'][0]
        record_id = item['id']
        
        print(f"Found record: {record_id}")

        # Build update expression
        update_expr = 'SET #status = :status, updatedAt = :updatedAt'
        expr_names = {'#status': 'status'}
        
        # Format datetime for AWS Amplify (ISO 8601 with milliseconds and Z)
        now = datetime.utcnow()
        aws_datetime = now.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'  # Trim to milliseconds and add Z
        
        expr_values = {
            ':status': status,
            ':updatedAt': aws_datetime
        }

        if status == 'PROCESSING':
            update_expr += ', processedAt = :processedAt'
            expr_values[':processedAt'] = aws_datetime
        elif status == 'COMPLETED':
            update_expr += ', completedAt = :completedAt'
            expr_values[':completedAt'] = aws_datetime
            if pdf_url:
                update_expr += ', pdfUrl = :pdfUrl'
                expr_values[':pdfUrl'] = pdf_url
        elif status == 'FAILED':
            if error_message:
                update_expr += ', errorMessage = :errorMessage'
                expr_values[':errorMessage'] = error_message

        # Update the record
        print(f"Updating with expression: {update_expr}")
        print(f"Values: {expr_values}")
        
        update_response = table.update_item(
            Key={'id': record_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ReturnValues='ALL_NEW'
        )
        
        print(f"Update response: {update_response}")
        print(f"Successfully updated record {record_id} to status {status}")
        
    except Exception as e:
        print(f"Error updating status: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise

def process_report(bucket, key):
    """
    Download file from S3, process and upload report
    """
    
    print(f"Starting to process: {key}")

    # Update status to PROCESSING
    update_report_status(key, 'PROCESSING')

    # 2. Parse the S3 key - format is public/{uuid}-{filename}.xlsx
    try:
        parts = key.split('/')
        print(f"Key parts: {parts}")
        print(f"Number of parts: {len(parts)}")
        
        # Get the filename (last part of the path)
        filename = parts[-1]  # uuid-filename.xlsx
        file_basename = os.path.splitext(filename)[0]  # uuid-filename (without .xlsx)
        
        print(f"Filename: {filename}")
        print(f"Basename: {file_basename}")
    except Exception as e:
        raise ValueError(f"Failed to parse key: {e}") 

    # 3. Define local and remote paths
    checklist_file_path = f'/tmp/{filename}'
    output_pdf_name = f'{file_basename}.pdf'
    pdf_local_path = f'/tmp/{output_pdf_name}'
    # Full S3 key with public/ prefix for both upload and database storage
    s3_upload_key = f'public/reports/{output_pdf_name}'
    
    print(f"Will upload PDF to: {s3_upload_key}")
    print(f"Processing file: {key} from bucket: {bucket}")

    # 1. Download the Excel file from S3
    s3_client.download_file(bucket, key, checklist_file_path)

    # 2. Generate report

    pdf = generate_online_policy_report(checklist_file_path, bucket)
    
    pdf.output(pdf_local_path)

    # 3. Upload PDF back to S3
    s3_client.upload_file(
        pdf_local_path, 
        bucket, 
        s3_upload_key
    )

    # 5. Update database record with COMPLETED status (store full S3 path)
    update_report_status(key, 'COMPLETED', pdf_url=s3_upload_key)

    print(f"File {key} processed successfully, PDF uploaded to {s3_upload_key}")
