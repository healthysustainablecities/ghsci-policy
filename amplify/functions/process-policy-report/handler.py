import json
import boto3
import io
import os
from datetime import datetime
import zipfile
import xml.etree.ElementTree as ET

def handler(event, context):
    print(f"Event: {json.dumps(event)}")
    
    dynamodb = boto3.resource('dynamodb')
    s3 = boto3.client('s3')
    
    table_name = os.environ.get('POLICY_REPORT_TABLE')
    bucket_name = os.environ.get('STORAGE_BUCKET')
    
    print(f"Environment variables - Table: {table_name}, Bucket: {bucket_name}")
    
    if not table_name or not bucket_name:
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': 'Missing required environment variables',
                'table_name': table_name,
                'bucket_name': bucket_name
            })
        }
    
    table = dynamodb.Table(table_name)
    
    # Process unprocessed files
    try:
        objects = s3.list_objects_v2(Bucket=bucket_name, Prefix='public/uploads/', MaxKeys=10)
        
        for obj in objects.get('Contents', []):
            key = obj['Key']
            if key.endswith('.xlsx'):
                result = process_excel_file(s3, table, bucket_name, key)
                if result['statusCode'] == 200:
                    print(f"Successfully processed {key}")
        
        # Clean up orphaned files (files without corresponding records)
        cleanup_orphaned_files(s3, table, bucket_name)
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({'message': 'Processing completed'})
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

def cleanup_orphaned_files(s3, table, bucket_name):
    """Remove files that don't have corresponding database records"""
    try:
        # Get all report records
        scan_response = table.scan()
        active_files = set()
        
        for item in scan_response['Items']:
            if 'fileName' in item:
                active_files.add(f"public/uploads/{item['fileName']}")
            if 'pdfUrl' in item:
                active_files.add(item['pdfUrl'])
        
        # Check uploads folder
        objects = s3.list_objects_v2(Bucket=bucket_name, Prefix='public/uploads/')
        for obj in objects.get('Contents', []):
            if obj['Key'] not in active_files:
                s3.delete_object(Bucket=bucket_name, Key=obj['Key'])
                print(f"Deleted orphaned file: {obj['Key']}")
        
        # Check reports folder
        objects = s3.list_objects_v2(Bucket=bucket_name, Prefix='public/reports/')
        for obj in objects.get('Contents', []):
            if obj['Key'] not in active_files:
                s3.delete_object(Bucket=bucket_name, Key=obj['Key'])
                print(f"Deleted orphaned file: {obj['Key']}")
                
    except Exception as e:
        print(f"Cleanup error: {e}")

def process_excel_file(s3, table, bucket_name, key):
    filename = key.split('/')[-1]
    
    # Find matching report record
    scan_response = table.scan(
        FilterExpression='fileName = :fn',
        ExpressionAttributeValues={':fn': filename}
    )
    
    if not scan_response['Items']:
        print(f"No report record found for {filename}")
        return {'statusCode': 404, 'body': json.dumps({'error': 'Report record not found'})}
    
    report_id = scan_response['Items'][0]['id']
    
    # Download Excel file
    response = s3.get_object(Bucket=bucket_name, Key=key)
    file_content = response['Body'].read()
    
    # Validate file size
    if len(file_content) >= 1024 * 1024:
        table.update_item(
            Key={'id': report_id},
            UpdateExpression='SET #status = :status, errorMessage = :error',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'FAILED',
                ':error': 'File size exceeds 1MB limit'
            }
        )
        return {'statusCode': 400, 'body': json.dumps({'error': 'File too large'})}
    
    try:
        with zipfile.ZipFile(io.BytesIO(file_content), 'r') as xlsx_zip:
            workbook_xml = xlsx_zip.read('xl/workbook.xml')
            root = ET.fromstring(workbook_xml)
            
            sheets = []
            for sheet in root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet'):
                sheets.append(sheet.get('name'))
            
            required_sheets = ['Collection details', 'Policy Checklist']
            missing_sheets = [sheet for sheet in required_sheets if sheet not in sheets]
            
            if missing_sheets:
                table.update_item(
                    Key={'id': report_id},
                    UpdateExpression='SET #status = :status, errorMessage = :error',
                    ExpressionAttributeNames={'#status': 'status'},
                    ExpressionAttributeValues={
                        ':status': 'FAILED',
                        ':error': f'Missing required worksheets: {missing_sheets}'
                    }
                )
                return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid Excel format'})}
            
            # Generate PDF
            pdf_content = f"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 200 >>
stream
BT
/F1 12 Tf
50 750 Td
(Policy Report) Tj
0 -50 Td
(File: {filename}) Tj
0 -30 Td
(Processed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000053 00000 n 
0000000110 00000 n 
0000000230 00000 n 
0000000480 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
550
%%EOF"""
            
            pdf_key = f"public/reports/{os.path.splitext(filename)[0]}.pdf"
            s3.put_object(
                Bucket=bucket_name,
                Key=pdf_key,
                Body=pdf_content.encode('utf-8'),
                ContentType='application/pdf'
            )
            
            # Update report record
            table.update_item(
                Key={'id': report_id},
                UpdateExpression='SET #status = :status, pdfUrl = :url, completedAt = :time',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'COMPLETED',
                    ':url': pdf_key,
                    ':time': datetime.now().isoformat()
                }
            )
            
            # Clean up uploaded file
            s3.delete_object(Bucket=bucket_name, Key=key)
            
            return {'statusCode': 200, 'body': json.dumps({'message': f'Successfully processed {filename}'})}
            
    except Exception as e:
        table.update_item(
            Key={'id': report_id},
            UpdateExpression='SET #status = :status, errorMessage = :error',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'FAILED',
                ':error': f'Processing error: {str(e)}'
            }
        )
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}