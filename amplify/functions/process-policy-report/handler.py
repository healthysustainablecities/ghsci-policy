import sys
import os

# Add lib directory to path for local dependencies
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))

import boto3
import json
import time
import traceback
from urllib.parse import unquote_plus
from datetime import datetime
from ghsci import generate_online_policy_report, get_policy_setting, policy_data_setup

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

def parse_excel_config(excel_file_path):
    """
    Parse Excel file using ghsci.get_policy_setting() to extract configuration
    Returns a reportConfig dictionary
    
    Extracts: City, Country, Region, Levels of government, Environmental disaster context,
    City context, and Demographics and health equity from the 'Collection details' sheet.
    """
    try:
        # Use existing ghsci function to extract collection details
        setting = get_policy_setting(excel_file_path)
        
        if not setting:
            print('Failed to extract policy settings from Excel file')
            return None
        
        print(f'Extracted settings from Excel: {json.dumps(setting, indent=2)}')
        
        city = setting.get('City', 'City name')
        country = setting.get('Country', 'Country name')
        region = setting.get('Region', '')
        gov_levels = setting.get('Levels of government', '')
        env_disaster = setting.get('Environmental disaster context', '')
        city_context = setting.get('City context', '')
        demographics = setting.get('Demographics and health equity', '')
        
        # Build reportConfig in the format expected by the frontend
        # Top-level convenience fields for the frontend card/modal display
        # Use default placeholder images from ghsci.py config
        config = {
            'city': city,
            'country': country,
            'year': str(setting.get('Date', '') or ''),
            'reviewer': str(setting.get('Person(s)', '') or ''),
            'reporting': {
                'doi': '',
                'images': {
                    '1': {
                        'file': 'Example image of a vibrant, walkable, urban neighbourhood - landscape.jpg',
                        'credit': 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Carl Higgs, Bing Image Creator, 2023'
                    },
                    '2': {
                        'file': 'Example image 2-Landscape.jpg',
                        'credit': 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Eugen Resendiz, Bing Image Creator, 2023'
                    },
                    '3': {
                        'file': 'Example image of a vibrant, walkable, urban neighbourhood - square.jpg',
                        'credit': 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Carl Higgs, Bing Image Creator, 2023'
                    },
                    '4': {
                        'file': 'Example image of climate resilient lively city watercolor-Square.jpg',
                        'credit': 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Eugen Resendiz, Bing Image Creator, 2023'
                    },
                },
                'languages': {
                    'English': {
                        'name': city,
                        'country': country,
                        'summary_policy': 'After reviewing policy indicator results for your city, provide a contextualised summary by modifying the "summary_policy" text for each configured language within the region configuration file.',
                        'context': [
                            {
                                'City context': [
                                    {'summary': city_context if city_context and city_context != 'Not specified' else f'Contextual information about {city}, {country}.'.replace(', , ', ', ') if any([city, country]) else 'Contextual information about your study region.'}
                                ]
                            },
                            {
                                'Demographics and health equity': [
                                    {'summary': demographics if demographics and demographics != 'Not specified' else 'Demographics and health equity information can be added here.'}
                                ]
                            },
                            {
                                'Environmental disaster context': [
                                    {'summary': env_disaster if env_disaster else 'No environmental disaster context specified.'}
                                ]
                            },
                            {
                                'Levels of government': [
                                    {'summary': gov_levels if gov_levels and gov_levels != 'Not specified' else 'No levels of government specified.'}
                                ]
                            }
                        ]
                    }
                }
            }
        }
        
        print(f'Generated config: {json.dumps(config, indent=2)}')
        print(f'Config summary: City={city}, Country={country}, Region={region}')
        print(f'City context: {city_context[:100] if city_context else "None"}...')
        print(f'Demographics: {demographics[:100] if demographics else "None"}...')
        return config
        
    except Exception as e:
        print(f'Error parsing Excel config: {str(e)}')
        import traceback
        traceback.print_exc()
        return None

def handler(event, context):
    """
    Lambda function to process policy report uploads
    """
    print(f"Processing event: {json.dumps(event, indent=2)}")

    try:
        # Extract bucket and key from the S3 event
        bucket = event['Records'][0]['s3']['bucket']['name']
        key = unquote_plus(event['Records'][0]['s3']['object']['key'])
    except (KeyError, IndexError) as e:
        error_msg = f"Invalid S3 event format: {str(e)}"
        print(error_msg)
        return {
            'statusCode': 400,
            'body': json.dumps({'error': error_msg})
        }
    
    # Extract custom reportConfig if available (from manual trigger)
    report_config = event.get('reportConfig', None)
    
    # Parse reportConfig if it's a JSON string
    if report_config and isinstance(report_config, str):
        try:
            report_config = json.loads(report_config)
            print("Parsed reportConfig from JSON string")
        except json.JSONDecodeError as e:
            print(f"Warning: Failed to parse reportConfig JSON string: {e}")
            report_config = None

    try:
        process_report(bucket, key, report_config)
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Processing completed successfully'})
        }
    except SystemExit as e:
        # Handle sys.exit() calls from ghsci.py
        error_message = f"SystemExit: Process exited with code {e.code}. This usually indicates a missing dependency or configuration issue in ghsci.py"
        error_traceback = traceback.format_exc()
        
        print("=" * 80)
        print("SYSTEM EXIT DETECTED")
        print("=" * 80)
        print(f"Exit Code: {e.code}")
        print(f"Error Message: {error_message}")
        print("Full Traceback:")
        print(error_traceback)
        print("=" * 80)
        
        # Update status to FAILED
        try:
            display_error = error_message[:4000]
            print(f"Updating status to FAILED with error: {display_error}")
            update_report_status(key, 'FAILED', error_message=display_error)
            print("Status updated successfully to FAILED")
        except Exception as update_error:
            print(f"Failed to update status to FAILED: {str(update_error)}")
            traceback.print_exc()

        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Process terminated unexpectedly',
                'details': error_message
            })
        }
    except Exception as e:
        # Capture detailed error information
        exc_type = type(e).__name__
        exc_message = str(e) if str(e) else "Unknown error"
        error_message = f"{exc_type}: {exc_message}"
        error_traceback = traceback.format_exc()
        
        print("=" * 80)
        print("ERROR OCCURRED DURING PROCESSING")
        print("=" * 80)
        print(f"Exception Type: {exc_type}")
        print(f"Exception Message: {exc_message}")
        print(f"Full Error Message: {error_message}")
        print("Full Traceback:")
        print(error_traceback)
        print("=" * 80)
        
        # Update status to FAILED with detailed error
        try:
            # Ensure error message is not empty
            if not error_message or error_message.strip() == f"{exc_type}:":
                error_message = f"{exc_type}: An error occurred but no details were provided"
            
            # Limit error message length for database (DynamoDB has size limits)
            display_error = error_message[:4000] if len(error_message) > 4000 else error_message
            
            print(f"Updating status to FAILED with error: {display_error}")
            update_report_status(key, 'FAILED', error_message=display_error)
            print("Status updated successfully to FAILED")
        except Exception as update_error:
            print(f"Failed to update status to FAILED: {str(update_error)}")
            traceback.print_exc()

        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to process policy report',
                'details': error_message
            })
        }

def get_table():
    """Get DynamoDB table reference"""
    table_name = os.environ.get('POLICY_REPORT_TABLE')
    if not table_name:
        raise ValueError("POLICY_REPORT_TABLE environment variable not set")
    return dynamodb.Table(table_name)

def update_report_status(file_key, status, pdf_url=None, error_message=None):
    """Update the PolicyReport record in DynamoDB with retry logic"""
    max_retries = 5
    retry_delay = 1  # Start with 1 second
    
    print(f"update_report_status called with:")
    print(f"  file_key: {file_key}")
    print(f"  status: {status}")
    print(f"  pdf_url: {pdf_url}")
    print(f"  error_message: {error_message}")
    print(f"  error_message type: {type(error_message)}")
    print(f"  error_message repr: {repr(error_message)}")
    
    for attempt in range(max_retries):
        try:
            table = get_table()
            
            print(f"S3 fileKey: {file_key}")
            print(f"Searching database for: {file_key} (attempt {attempt + 1}/{max_retries})")

            # Find the record by matching the full file key
            response = table.scan(
                FilterExpression='fileKey = :fk',
                ExpressionAttributeValues={':fk': file_key}
            )
            
            print(f"Scan response: {response}")

            if not response.get('Items'):
                if attempt < max_retries - 1:
                    print(f"No record found for fileKey: {file_key}, retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                    continue
                else:
                    print(f"No record found for fileKey: {file_key} after {max_retries} attempts")
                    raise ValueError(f"Record not found for fileKey: {file_key}")

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
                    print(f"Adding error message to update: {repr(error_message)}")
                    update_expr += ', errorMessage = :errorMessage'
                    expr_values[':errorMessage'] = str(error_message)  # Ensure it's a string
                else:
                    print("WARNING: No error message provided for FAILED status!")

            # Update the record
            print(f"Updating with expression: {update_expr}")
            print(f"Expression names: {expr_names}")
            print(f"Expression values: {expr_values}")
            
            update_response = table.update_item(
                Key={'id': record_id},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_values,
                ReturnValues='ALL_NEW'
            )
            
            print(f"Update response: {update_response}")
            print(f"Successfully updated record {record_id} to status {status}")
            
            # Verify the error message was actually set
            if status == 'FAILED' and error_message:
                updated_item = update_response.get('Attributes', {})
                stored_error = updated_item.get('errorMessage')
                print(f"Verification - stored errorMessage: {repr(stored_error)}")
            
            return  # Success, exit retry loop
            
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"Error updating status after {max_retries} attempts: {str(e)}")
                import traceback
                print(f"Traceback: {traceback.format_exc()}")
                raise
            else:
                print(f"Error on attempt {attempt + 1}, retrying: {str(e)}")
                time.sleep(retry_delay)
                retry_delay *= 2

def update_report_config(file_key, report_config):
    """Update the reportConfig field in the PolicyReport record with retry logic"""
    max_retries = 5
    retry_delay = 1
    
    for attempt in range(max_retries):
        try:
            table = get_table()
            
            # Find the record by matching the full file key
            response = table.scan(
                FilterExpression='fileKey = :fk',
                ExpressionAttributeValues={':fk': file_key}
            )
            
            if not response.get('Items'):
                if attempt < max_retries - 1:
                    print(f"No record found for fileKey: {file_key}, retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                    retry_delay *= 2
                    continue
                else:
                    print(f"No record found for fileKey: {file_key} after {max_retries} attempts")
                    raise ValueError(f"Record not found for fileKey: {file_key}")

            item = response['Items'][0]
            record_id = item['id']
            
            print(f"Updating reportConfig for record: {record_id}")
            print(f"Config to save: {json.dumps(report_config, indent=2)}")

            # Convert config to JSON string for DynamoDB (AWSJSON type expects string)
            config_json_string = json.dumps(report_config)

            # Check if initialReportConfig already exists
            # If not, save this as the initial config (for revert functionality)
            if 'initialReportConfig' not in item or not item.get('initialReportConfig'):
                print("Setting initialReportConfig (first parse)")
                update_expression = 'SET reportConfig = :config, initialReportConfig = :config, updatedAt = :updatedAt'
            else:
                print("initialReportConfig already exists, only updating reportConfig")
                update_expression = 'SET reportConfig = :config, updatedAt = :updatedAt'

            # Update the record with the parsed config
            update_response = table.update_item(
                Key={'id': record_id},
                UpdateExpression=update_expression,
                ExpressionAttributeValues={
                    ':config': config_json_string,
                    ':updatedAt': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
                },
                ReturnValues='ALL_NEW'
            )
            
            print(f"Successfully updated reportConfig for record {record_id}")
            print(f"Updated attributes: {json.dumps(update_response.get('Attributes', {}), indent=2, default=str)}")
            return  # Success, exit retry loop
            
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"Error updating reportConfig after {max_retries} attempts: {str(e)}")
                import traceback
                print(f"Traceback: {traceback.format_exc()}")
                # Don't raise - this is not critical to fail the entire process
            else:
                print(f"Error on attempt {attempt + 1}, retrying: {str(e)}")
                time.sleep(retry_delay)
                retry_delay *= 2

def update_policy_data(file_key, policy_data, max_retries=5):
    """
    Update the policyData field in the database with policy_data_setup() results.
    
    Args:
        file_key: The S3 file key to identify the record
        policy_data: Dictionary from policy_data_setup() to be stored as JSON
        max_retries: Maximum number of retry attempts
    """
    retry_delay = 1
    
    # Convert policy_data to JSON string
    # The policy_data is a dictionary of pandas DataFrames
    # Use .to_json() on each DataFrame
    serializable_data = {}
    for topic, df in policy_data.items():
        # df.to_json() returns a JSON string, parse it back to an object for proper nesting
        serializable_data[topic] = json.loads(df.to_json(orient="index"))
    
    # Use ensure_ascii=False to preserve actual Unicode characters (✔, ✘) instead of escaping as \uXXXX
    # DynamoDB/AppSync handle UTF-8 properly, so the characters display correctly in the browser
    policy_data_json_string = json.dumps(serializable_data, ensure_ascii=False)
    
    print(f"Updating policyData for {file_key}")
    print(f"Policy data size: {len(policy_data_json_string)} bytes")
    
    for attempt in range(max_retries):
        try:
            table = get_table()
            
            # Find the record
            response = table.scan(
                FilterExpression='fileKey = :fk',
                ExpressionAttributeValues={':fk': file_key}
            )
            
            if not response.get('Items'):
                if attempt < max_retries - 1:
                    print(f"No record found for fileKey: {file_key}, retrying in {retry_delay}s...")
                    time.sleep(retry_delay)
                    retry_delay *= 2
                    continue
                else:
                    print(f"No record found for fileKey: {file_key} after {max_retries} attempts")
                    return
            
            item = response['Items'][0]
            record_id = item['id']
            
            print(f"Updating policyData for record {record_id}")
            
            # Update the policyData field
            update_expression = 'SET policyData = :policyData, updatedAt = :updatedAt'
            
            update_response = table.update_item(
                Key={'id': record_id},
                UpdateExpression=update_expression,
                ExpressionAttributeValues={
                    ':policyData': policy_data_json_string,
                    ':updatedAt': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
                },
                ReturnValues='ALL_NEW'
            )
            
            print(f"Successfully updated policyData for record {record_id}")
            return  # Success, exit retry loop
            
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"Error updating policyData after {max_retries} attempts: {str(e)}")
                import traceback
                print(f"Traceback: {traceback.format_exc()}")
                # Don't raise - this is not critical to fail the entire process
            else:
                print(f"Error on attempt {attempt + 1}, retrying: {str(e)}")
                time.sleep(retry_delay)
                retry_delay *= 2

def process_report(bucket, key, report_config=None):
    """
    Download file from S3, process and upload report
    """
    
    print(f"Starting to process: {key}")
    if report_config:
        print(f"Using custom config: {json.dumps(report_config, indent=2)}")

    # Update status to PROCESSING
    try:
        update_report_status(key, 'PROCESSING')
    except Exception as e:
        raise RuntimeError(f"Failed to update status to PROCESSING: {str(e)}")

    # Parse the S3 key - format is public/{username}/{filename}.xlsx
    try:
        parts = key.split('/')
        print(f"Key parts: {parts}")
        print(f"Number of parts: {len(parts)}")
        
        # Get the filename (last part of the path)
        filename = parts[-1]
        file_basename = os.path.splitext(filename)[0]
        
        print(f"Filename: {filename}")
        print(f"Basename: {file_basename}")
    except Exception as e:
        raise ValueError(f"Failed to parse S3 key '{key}': {str(e)}")

    # Define local and remote paths
    checklist_file_path = f'/tmp/{filename}'
    output_pdf_name = f'{file_basename}.pdf'
    pdf_local_path = f'/tmp/{output_pdf_name}'
    s3_upload_key = f'public/reports/{output_pdf_name}'
    
    print(f"Will upload PDF to: {s3_upload_key}")
    print(f"Processing file: {key} from bucket: {bucket}")

    # Download the Excel file from S3
    try:
        print(f"Downloading file from S3...")
        s3_client.download_file(bucket, key, checklist_file_path)
        print(f"Successfully downloaded to {checklist_file_path}")
    except Exception as e:
        raise RuntimeError(f"Failed to download file from S3 (bucket: {bucket}, key: {key}): {str(e)}")

    # Parse Excel file to extract configuration (unless custom config provided)
    if not report_config:
        try:
            print("Parsing Excel file to extract configuration...")
            parsed_config = parse_excel_config(checklist_file_path)
            if parsed_config:
                # Update database with parsed config
                update_report_config(key, parsed_config)
                report_config = parsed_config
                print(f"Using parsed config: {json.dumps(report_config, indent=2)}")
            else:
                print("Warning: Failed to parse config, will use defaults")
        except Exception as e:
            print(f"Warning: Error parsing config, will use defaults: {str(e)}")
            # Don't fail the entire process if parsing fails
    else:
        print("Using provided custom config")
    
    # Extract and save policy data for viewing
    try:
        print("Extracting policy data using policy_data_setup()...")
        policy_data = policy_data_setup(checklist_file_path)
        if policy_data:
            update_policy_data(key, policy_data)
            print("Policy data extracted and saved successfully")
        else:
            print("Warning: policy_data_setup returned None")
    except Exception as e:
        print(f"Warning: Error extracting policy data: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        # Don't fail the entire process if policy data extraction fails

    # Generate PDF report
    try:
        print("Generating PDF report...")
        pdf = generate_online_policy_report(checklist_file_path, bucket, report_config=report_config)
        
        if pdf is None:
            raise RuntimeError("generate_online_policy_report returned None")
        
        print("PDF generated successfully, writing to file...")
        pdf.output(pdf_local_path)
        print(f"PDF written to {pdf_local_path}")
    except Exception as e:
        raise RuntimeError(f"Failed to generate PDF report: {str(e)}")

    # Upload PDF back to S3
    try:
        print(f"Uploading PDF to S3...")
        s3_client.upload_file(
            pdf_local_path, 
            bucket, 
            s3_upload_key
        )
        print(f"Successfully uploaded PDF to {s3_upload_key}")
    except Exception as e:
        raise RuntimeError(f"Failed to upload PDF to S3: {str(e)}")

    # Update database record with COMPLETED status
    try:
        update_report_status(key, 'COMPLETED', pdf_url=s3_upload_key)
        print(f"File {key} processed successfully")
    except Exception as e:
        raise RuntimeError(f"Failed to update status to COMPLETED: {str(e)}")
