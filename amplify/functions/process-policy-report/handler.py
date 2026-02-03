import boto3
import json
import pandas as pd
import os
from urllib.parse import unquote_plus

from fpdf import FPDF

s3_client = boto3.client('s3')

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
    except Exception as e:
        print(f"Error processing policy report: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to process policy report',
                'details': str(e)
            })
        }

def process_report(bucket, key):
    """
    Download file from S3, process and upload report
    """
    
    # 2. Parse the pattern: uploads/{user_id}/{object_key}
    try:
        parts = key.split('/')
        user_id = parts[1]  # user_id is now at index 1
        filename = parts[-1]
        file_basename = os.path.splitext(filename)[0]
    except Exception as e:
        raise ValueError(f"Invalid key pattern: {e}") 

    # 3. Define local and remote paths
    download_path = f'/tmp/{filename}'
    output_pdf_name = f'{file_basename}.pdf'
    pdf_local_path = f'/tmp/{output_pdf_name}'
    upload_key = f'reports/{user_id}/{output_pdf_name}'
    print(f"Processing file: {bucket} from bucket: {key}")
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
    pdf.output(output_pdf_name)
    # 4. Upload PDF back to S3
    s3_client.upload_file(
        pdf_local_path, 
        bucket, 
        upload_key
    )
    # 5. Update database record
    # update_database_record(key)

    print(f"File {key} processed successfully")

    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': f'Policy report processed successfully: {output_pdf_name}'
        })
    }
