import json
import boto3
import os

def handler(event, context):
    print(f"Event: {json.dumps(event)}")
    
    s3 = boto3.client('s3')
    bucket_name = os.environ.get('STORAGE_BUCKET')
    
    if not bucket_name:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Missing bucket name'})
        }
    
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        user_id = body.get('userId')
        file_name = body.get('fileName')
        pdf_url = body.get('pdfUrl')
        clean_up_policy_files(s3, user_id, bucket_name, file_name, pdf_url)
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({'message': 'Cleanup completed'})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }

def clean_up_policy_files(s3, user_id, bucket_name, file_name, pdf_url):
    """
    Remove files that are no longer required
    
    :param s3: Description
    :param bucket_name: Description
    :param file_name: Description
    :param pdf_url: Description
    """
    if file_name:
        # Delete Excel file
        excel_key = f"uploads/{user_id}/{file_name}"
        try:
            s3.delete_object(Bucket=bucket_name, Key=excel_key)
            print(f"Deleted Excel file: {excel_key}")
        except Exception as e:
            print(f"Failed to delete Excel file {excel_key}: {e}")
    
    if pdf_url:
        # Delete PDF file
        # pdf_url is stored without 'public/' prefix for Amplify Storage API usage
        # but boto3 needs the full S3 key, so add it back
        s3_pdf_key = f'public/{pdf_url}' if not pdf_url.startswith('public/') else pdf_url
        try:
            s3.delete_object(Bucket=bucket_name, Key=s3_pdf_key)
            print(f"Deleted PDF file: {s3_pdf_key}")
        except Exception as e:
            print(f"Failed to delete PDF file {s3_pdf_key}: {e}")