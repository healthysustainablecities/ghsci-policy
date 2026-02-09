import boto3
import json
import pandas as pd
import os
from urllib.parse import unquote_plus
from datetime import datetime
from fpdf import FPDF

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
    table = get_table()
    
    # Query to find the record by fileKey
    response = table.scan(
        FilterExpression='fileKey = :fk',
        ExpressionAttributeValues={':fk': file_key}
    )
    
    if not response.get('Items'):
        print(f"No record found for fileKey: {file_key}")
        return
    
    item = response['Items'][0]
    record_id = item['id']
    
    # Build update expression
    update_expr = 'SET #status = :status'
    expr_names = {'#status': 'status'}
    expr_values = {':status': status}
    
    if status == 'PROCESSING':
        update_expr += ', processedAt = :processedAt'
        expr_values[':processedAt'] = datetime.utcnow().isoformat()
    elif status == 'COMPLETED':
        update_expr += ', completedAt = :completedAt'
        expr_values[':completedAt'] = datetime.utcnow().isoformat()
        if pdf_url:
            update_expr += ', pdfUrl = :pdfUrl'
            expr_values[':pdfUrl'] = pdf_url
    elif status == 'FAILED':
        if error_message:
            update_expr += ', errorMessage = :errorMessage'
            expr_values[':errorMessage'] = error_message
    
    # Update the record
    table.update_item(
        Key={'id': record_id},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values
    )
    print(f"Updated record {record_id} to status {status}")

def process_report(bucket, key):
    """
    Download file from S3, process and upload report
    """
    
    # Update status to PROCESSING
    update_report_status(key, 'PROCESSING')
    
    # 2. Parse the pattern: public/{user_id}/{object_key}
    try:
        parts = key.split('/')
        user_id = parts[1]  # user_id is at index 1
        filename = parts[-1]
        file_basename = os.path.splitext(filename)[0]
    except Exception as e:
        raise ValueError(f"Invalid key pattern: {e}") 

    # 3. Define local and remote paths
    download_path = f'/tmp/{filename}'
    output_pdf_name = f'{file_basename}.pdf'
    pdf_local_path = f'/tmp/{output_pdf_name}'
    upload_key = f'public/{user_id}/reports/{output_pdf_name}'
    
    print(f"Processing file: {key} from bucket: {bucket}")
    
    # 1. Download the Excel file from S3
    s3_client.download_file(bucket, key, download_path)
    
    # 2. Process it to extract policy data
    df = pd.read_excel(download_path, sheet_name='Policy Checklist')
    
    # 3. Generate PDF report
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    pdf.cell(200, 10, txt="Policy Report", ln=True)
    for _, row in df.iterrows():
        pdf.cell(200, 10, txt=str(row.to_dict()), ln=True)
    pdf.output(pdf_local_path)
    
    # 4. Upload PDF back to S3
    s3_client.upload_file(
        pdf_local_path, 
        bucket, 
        upload_key
    )
    
    # 5. Update database record with COMPLETED status
    update_report_status(key, 'COMPLETED', pdf_url=upload_key)

    print(f"File {key} processed successfully, PDF uploaded to {upload_key}")
