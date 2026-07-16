import sys
import os

# Add lib directory to path for local dependencies
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))

import boto3
import json
import re
import time
import traceback
from boto3.dynamodb.conditions import Key
from urllib.parse import unquote_plus
from datetime import datetime, timezone
from ghsci import (
    generate_online_policy_report,
    generate_online_policy_report_from_form_data,
    get_policy_setting,
    get_policy_setting_from_form_data,
    get_policy_checklist,
    get_policy_audit_from_form_data,
    policy_data_setup,
    get_policy_presence_quality_score_dictionary,
    get_raw_policy_details,
    get_phrases,
    ghsci_policies,
)

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

        # Add additional language entries from the xlsx (e.g. Spanish - Spain block)
        additional_languages = setting.get('additional_languages', {})
        for lang_name, lang_data in additional_languages.items():
            config['reporting']['languages'][lang_name] = {
                'name': lang_data.get('name', city),
                'country': lang_data.get('country', country),
                'summary_policy': lang_data.get('summary_policy', ''),
                'context': [
                    {'City context': [{'summary': lang_data.get('city_context', '')}]},
                    {'Demographics and health equity': [{'summary': lang_data.get('demographics', '')}]},
                    {'Environmental disaster context': [{'summary': env_disaster if env_disaster else ''}]},
                    {'Levels of government': [{'summary': gov_levels if gov_levels and gov_levels != 'Not specified' else ''}]},
                ]
            }
            print(f"Added additional language to config: {lang_name}")

        # Set selectedLanguages: English always first, then any additional xlsx languages
        config['reporting']['selectedLanguages'] = ['English'] + list(additional_languages.keys())
        
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
    Lambda function to process policy report uploads.
    Also handles form submissions when 'formData' is present in the event.
    """
    print(f"Processing event keys: {list(event.keys())}")
    print(f"Processing event (truncated): {json.dumps(event, indent=2)[:2000]}")

    # Form submission path: formData passed directly (no S3 file yet)
    if 'formData' in event:
        form_data = event['formData']
        bucket = event.get('bucket', os.environ.get('STORAGE_BUCKET', ''))
        synthetic_key = event.get('syntheticKey', '')
        record_id = event.get('recordId') or None
        report_config = event.get('reportConfig', None)
        if report_config and isinstance(report_config, str):
            try:
                report_config = json.loads(report_config)
            except json.JSONDecodeError:
                report_config = None
        print(f"Form submission path: bucket={bucket}, synthetic_key={synthetic_key}, record_id={record_id}, has_report_config={report_config is not None}")
        try:
            process_form_submission(bucket, form_data, synthetic_key, report_config, record_id=record_id)
            return {'statusCode': 200, 'body': json.dumps({'message': 'Form processed successfully'})}
        except Exception as e:
            error_message = f"{type(e).__name__}: {str(e)}"
            print(f'Form processing error: {error_message}')
            traceback.print_exc()
            try:
                update_report_status(synthetic_key, 'FAILED', error_message=error_message[:4000], record_id=record_id)
            except Exception:
                pass
            return {'statusCode': 500, 'body': json.dumps({'error': error_message})}

    try:
        # Support both direct S3 trigger format and EventBridge S3 event notification format
        if 'Records' in event:
            # Direct S3 trigger: event['Records'][0]['s3']['bucket']['name']
            bucket = event['Records'][0]['s3']['bucket']['name']
            key = unquote_plus(event['Records'][0]['s3']['object']['key'])
        elif event.get('source') == 'aws.s3' and 'detail' in event:
            # EventBridge S3 event notification format
            bucket = event['detail']['bucket']['name']
            key = unquote_plus(event['detail']['object']['key'])
        else:
            raise KeyError("Unrecognised event format: neither 'Records' nor EventBridge 'detail' found")
    except (KeyError, IndexError) as e:
        error_msg = f"Invalid S3 event format: {str(e)}"
        print(error_msg)
        return {
            'statusCode': 400,
            'body': json.dumps({'error': error_msg})
        }
    
    # Extract custom reportConfig if available (from manual trigger)
    report_config = event.get('reportConfig', None)

    # Record id is present on synthetic events from the trigger-processing Lambda;
    # genuine EventBridge S3 events won't have it (lookup falls back to fileKey).
    record_id = event.get('recordId') or None

    # Parse reportConfig if it's a JSON string
    if report_config and isinstance(report_config, str):
        try:
            report_config = json.loads(report_config)
            print("Parsed reportConfig from JSON string")
        except json.JSONDecodeError as e:
            print(f"Warning: Failed to parse reportConfig JSON string: {e}")
            report_config = None

    try:
        process_report(bucket, key, report_config, record_id=record_id)
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
            update_report_status(key, 'FAILED', error_message=display_error, record_id=record_id)
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
            update_report_status(key, 'FAILED', error_message=display_error, record_id=record_id)
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

def _aws_datetime_now():
    """Current UTC time formatted for AWS Amplify (ISO 8601 with milliseconds and Z)"""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'

# Cached name of the fileKey GSI; the sentinel distinguishes "not yet checked"
# from "checked, table has no such index" (None).
_FILE_KEY_INDEX_UNSET = object()
_file_key_index = _FILE_KEY_INDEX_UNSET

def _get_file_key_index(table):
    """
    Discover (and cache) the name of the GSI whose partition key is 'fileKey'.
    Returns None if the table has no such index (e.g. before the schema update
    adding it has been deployed), so callers can fall back to a scan.
    """
    global _file_key_index
    if _file_key_index is not _FILE_KEY_INDEX_UNSET:
        return _file_key_index
    try:
        description = table.meta.client.describe_table(TableName=table.table_name)
        for gsi in description['Table'].get('GlobalSecondaryIndexes') or []:
            hash_keys = [k['AttributeName'] for k in gsi['KeySchema'] if k['KeyType'] == 'HASH']
            if hash_keys == ['fileKey']:
                _file_key_index = gsi['IndexName']
                print(f"Using fileKey GSI: {_file_key_index}")
                return _file_key_index
        _file_key_index = None
        print("No fileKey GSI found on table; lookups will fall back to paginated scan")
    except Exception as e:
        # Don't cache a failed discovery (may be transient or a permissions issue)
        print(f"Warning: could not describe table to discover fileKey GSI: {e}")
        return None
    return _file_key_index

def _lookup_report_record(table, file_key, record_id=None):
    """
    Single lookup attempt for a PolicyReport record. Tries, in order:
    1. Direct get_item when the caller supplied the record id.
    2. Query on the fileKey GSI when the index exists.
    3. Paginated scan on fileKey (follows LastEvaluatedKey) as a fallback.
    Returns the item dict, or None if not found.
    """
    if record_id:
        response = table.get_item(Key={'id': record_id})
        item = response.get('Item')
        if item:
            return item
        print(f"get_item found no record for id {record_id}; falling back to fileKey lookup")

    index_name = _get_file_key_index(table)
    if index_name:
        response = table.query(
            IndexName=index_name,
            KeyConditionExpression=Key('fileKey').eq(file_key),
        )
        items = response.get('Items', [])
        return items[0] if items else None

    # Fallback: scan the whole table, following pagination. A single scan page is
    # capped at 1MB of examined data, so the record may lie beyond the first page.
    scan_kwargs = {
        'FilterExpression': 'fileKey = :fk',
        'ExpressionAttributeValues': {':fk': file_key},
    }
    while True:
        response = table.scan(**scan_kwargs)
        items = response.get('Items', [])
        if items:
            return items[0]
        last_key = response.get('LastEvaluatedKey')
        if not last_key:
            return None
        scan_kwargs['ExclusiveStartKey'] = last_key

def find_report_record(file_key, record_id=None, max_retries=5, required=True):
    """
    Find a PolicyReport record by record id (preferred) or fileKey, retrying with
    exponential backoff to tolerate the record being created moments after the
    S3 upload that triggered processing.

    Returns the item dict. If not found after retries: raises ValueError when
    required=True, otherwise returns None.
    """
    retry_delay = 1
    last_error = None
    for attempt in range(max_retries):
        try:
            table = get_table()
            item = _lookup_report_record(table, file_key, record_id=record_id)
            if item:
                return item
            print(f"No record found for fileKey: {file_key} (attempt {attempt + 1}/{max_retries})")
        except Exception as e:
            last_error = e
            print(f"Lookup error for fileKey {file_key} (attempt {attempt + 1}/{max_retries}): {e}")
        if attempt < max_retries - 1:
            time.sleep(retry_delay)
            retry_delay *= 2  # Exponential backoff
    message = f"Record not found for fileKey: {file_key}"
    if last_error:
        message += f" (last error: {last_error})"
    if required:
        raise ValueError(message)
    print(message)
    return None

def update_report_status(file_key, status, pdf_url=None, error_message=None, pdf_urls=None, record_id=None):
    """Update the PolicyReport record in DynamoDB, locating it via find_report_record()"""
    print(f"update_report_status called with:")
    print(f"  file_key: {file_key}")
    print(f"  record_id: {record_id}")
    print(f"  status: {status}")
    print(f"  pdf_url: {pdf_url}")
    print(f"  pdf_urls: {pdf_urls}")
    print(f"  error_message repr: {repr(error_message)}")

    item = find_report_record(file_key, record_id=record_id)
    target_id = item['id']
    print(f"Found record: {target_id}")

    # Build update expression
    update_expr = 'SET #status = :status, updatedAt = :updatedAt'
    expr_names = {'#status': 'status'}
    aws_datetime = _aws_datetime_now()
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
        if pdf_urls:
            update_expr += ', pdfUrls = :pdfUrls'
            expr_values[':pdfUrls'] = json.dumps(pdf_urls)
    elif status == 'FAILED':
        if error_message:
            print(f"Adding error message to update: {repr(error_message)}")
            update_expr += ', errorMessage = :errorMessage'
            expr_values[':errorMessage'] = str(error_message)  # Ensure it's a string
        else:
            print("WARNING: No error message provided for FAILED status!")

    print(f"Updating with expression: {update_expr}")
    print(f"Expression values: {expr_values}")

    # Retry the update itself against transient DynamoDB errors
    max_retries = 3
    retry_delay = 1
    for attempt in range(max_retries):
        try:
            table = get_table()
            table.update_item(
                Key={'id': target_id},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_values,
            )
            print(f"Successfully updated record {target_id} to status {status}")
            return  # Success, exit retry loop
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"Error updating status after {max_retries} attempts: {str(e)}")
                print(f"Traceback: {traceback.format_exc()}")
                raise
            else:
                print(f"Error on attempt {attempt + 1}, retrying: {str(e)}")
                time.sleep(retry_delay)
                retry_delay *= 2

def update_report_config(file_key, report_config, record_id=None):
    """Update the reportConfig field in the PolicyReport record (non-critical: logs and returns on failure)"""
    try:
        item = find_report_record(file_key, record_id=record_id)
        target_id = item['id']

        print(f"Updating reportConfig for record: {target_id}")

        # Convert config to JSON string for DynamoDB (AWSJSON type expects string)
        config_json_string = json.dumps(report_config)

        # Check if initialReportConfig already exists
        # If not, save this as the initial config (for revert functionality)
        if not item.get('initialReportConfig'):
            print("Setting initialReportConfig (first parse)")
            update_expression = 'SET reportConfig = :config, initialReportConfig = :config, updatedAt = :updatedAt'
        else:
            print("initialReportConfig already exists, only updating reportConfig")
            update_expression = 'SET reportConfig = :config, updatedAt = :updatedAt'

        # Update the record with the parsed config
        table = get_table()
        table.update_item(
            Key={'id': target_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues={
                ':config': config_json_string,
                ':updatedAt': _aws_datetime_now()
            },
        )

        print(f"Successfully updated reportConfig for record {target_id}")
    except Exception as e:
        # Don't raise - this is not critical to fail the entire process
        print(f"Error updating reportConfig: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")

def update_policy_data(file_key, policy_data, scores=None, raw_details=None, max_retries=5, record_id=None):
    """
    Update the policyData field in the database with policy_data_setup() results.

    Args:
        file_key: The S3 file key to identify the record
        policy_data: Dictionary from policy_data_setup() to be stored as JSON
        scores: Optional dict from get_policy_presence_quality_score_dictionary(),
                stored under '_scores' so the UI can use the authoritative values.
        raw_details: Optional dict from get_raw_policy_details(), mapping measure name ->
                     list of raw policy entry dicts for frontend drill-down display.
        max_retries: Maximum number of retry attempts
        record_id: Optional PolicyReport record id for direct lookup
    """

    # Convert policy_data to JSON string
    # The policy_data is a dictionary of pandas DataFrames
    # Use .to_json() on each DataFrame
    serializable_data = {}
    for topic, df in policy_data.items():
        # df.to_json() returns a JSON string, parse it back to an object for proper nesting
        topic_data = json.loads(df.to_json(orient="index"))
        # Attach raw policy entries to each measure for frontend drill-down
        if raw_details:
            for measure in topic_data:
                if measure in raw_details:
                    topic_data[measure]['policies'] = raw_details[measure]
        serializable_data[topic] = topic_data
    
    # Embed authoritative presence/quality scores so the UI doesn't need to recompute them
    if scores is not None:
        # Cast numpy int64/float64 to native Python types so json.dumps can serialise them
        serializable_data['_scores'] = {
            'presence': {
                'numerator': int(scores['presence']['numerator']),
                'denominator': int(scores['presence']['denominator']),
            },
            'quality': {
                'numerator': float(scores['quality']['numerator']),
                'denominator': int(scores['quality']['denominator']),
            },
        }
    
    # Use ensure_ascii=False to preserve actual Unicode characters (✔, ✘) instead of escaping as \uXXXX
    # DynamoDB/AppSync handle UTF-8 properly, so the characters display correctly in the browser
    policy_data_json_string = json.dumps(serializable_data, ensure_ascii=False)
    
    print(f"Updating policyData for {file_key}")
    print(f"Policy data size: {len(policy_data_json_string)} bytes")

    try:
        item = find_report_record(file_key, record_id=record_id, max_retries=max_retries, required=False)
        if not item:
            return

        target_id = item['id']
        print(f"Updating policyData for record {target_id}")

        table = get_table()
        table.update_item(
            Key={'id': target_id},
            UpdateExpression='SET policyData = :policyData, updatedAt = :updatedAt',
            ExpressionAttributeValues={
                ':policyData': policy_data_json_string,
                ':updatedAt': _aws_datetime_now()
            },
        )

        print(f"Successfully updated policyData for record {target_id}")
    except Exception as e:
        # Don't raise - this is not critical to fail the entire process
        print(f"Error updating policyData: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")

def process_report(bucket, key, report_config=None, record_id=None):
    """
    Download file from S3, process and upload report
    """

    print(f"Starting to process: {key}")
    if report_config:
        print(f"Using custom config: {json.dumps(report_config, indent=2)}")

    # Update status to PROCESSING
    try:
        update_report_status(key, 'PROCESSING', record_id=record_id)
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
                update_report_config(key, parsed_config, record_id=record_id)
                report_config = parsed_config
                print(f"Using parsed config: {json.dumps(report_config, indent=2)}")
            else:
                print("Warning: Failed to parse config, will use defaults")
        except Exception as e:
            print(f"Warning: Error parsing config, will use defaults: {str(e)}")
            # Don't fail the entire process if parsing fails
    else:
        print("Using provided custom config")
    
    # Parse setting + audit once so all downstream functions share the same parsed data.
    try:
        print("Parsing policy checklist setting and audit...")
        policy_setting = get_policy_setting(checklist_file_path)
        audit = get_policy_checklist(checklist_file_path, setting=policy_setting)
        print("Policy checklist parsed successfully")
    except Exception as e:
        raise RuntimeError(f"Failed to parse policy checklist: {str(e)}")

    # Extract and save policy data for viewing
    try:
        print("Extracting policy data using policy_data_setup()...")
        policy_data = policy_data_setup(audit)
        policy_scores = get_policy_presence_quality_score_dictionary(audit)
        policy_raw_details = get_raw_policy_details(audit)
        if policy_data:
            update_policy_data(key, policy_data, scores=policy_scores, raw_details=policy_raw_details, record_id=record_id)
            print("Policy data extracted and saved successfully")
        else:
            print("Warning: policy_data_setup returned None")
    except Exception as e:
        print(f"Warning: Error extracting policy data: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        # Don't fail the entire process if policy data extraction fails

    # Determine which languages to generate reports for
    selected_languages = (
        report_config.get('reporting', {}).get('selectedLanguages', ['English'])
        if report_config else ['English']
    )
    if not selected_languages:
        selected_languages = ['English']
    if 'English' not in selected_languages:
        selected_languages = ['English'] + selected_languages

    # Always merge any additional languages declared in the xlsx (e.g. "Spanish - Spain"
    # block). The xlsx is the source of truth for which languages are configured, so these
    # are added on top of any user-configured selectedLanguages from the saved reportConfig.
    # This ensures that reports saved before additional-language support was introduced still
    # generate all configured language PDFs on regeneration.
    for xl_lang in policy_setting.get('additional_languages', {}).keys():
        if xl_lang not in selected_languages:
            selected_languages.append(xl_lang)
            print(f"Auto-adding language from xlsx: {xl_lang}")

    print(f"Generating reports for languages: {selected_languages}")

    # Generate one PDF per language, collect S3 keys
    pdf_urls = {}
    first_upload_key = None
    for lang in selected_languages:
        try:
            print(f"Generating PDF report for language: {lang}")
            lang_pdf = generate_online_policy_report(
                checklist_file_path,
                bucket,
                options={'language': lang},
                report_config=report_config,
            )
            if lang_pdf is None:
                print(f"Warning: generate_online_policy_report returned None for language '{lang}', skipping")
                continue
            lang_slug = re.sub(r'[^\w]+', '-', lang).strip('-').lower()
            lang_pdf_name = f'{file_basename}-{lang_slug}.pdf'
            lang_pdf_local = f'/tmp/{lang_pdf_name}'
            lang_s3_key = f'public/reports/{lang_pdf_name}'
            lang_pdf.output(lang_pdf_local)
            print(f"PDF written to {lang_pdf_local}")
            s3_client.upload_file(lang_pdf_local, bucket, lang_s3_key)
            print(f"Uploaded {lang} PDF to {lang_s3_key}")
            pdf_urls[lang] = lang_s3_key
            if first_upload_key is None:
                first_upload_key = lang_s3_key
            # Extract translated UI labels from phrases and store in reportConfig so
            # the frontend can display section headings, summary label, and policy
            # checklist category/measure names in the configured language.
            try:
                phrases = get_phrases(lang)
                context_labels = {
                    # Report settings section headings
                    'City context': phrases.get('City context', 'City context'),
                    'Demographics and health equity': phrases.get('Demographics and health equity', 'Demographics and health equity'),
                    'Environmental disaster context': phrases.get('Environmental disaster context', 'Environmental disaster context'),
                    'Levels of government': phrases.get('Levels of government', 'Levels of government'),
                    'executive_summary': phrases.get('executive_summary', 'Summary'),
                    # Policy checklist table column headers
                    'Policy identified': phrases.get('Policy identified', 'Identified'),
                    'Aligns with healthy cities principles': phrases.get('Aligns with healthy cities principles', 'Aligns'),
                    'Measurable target': phrases.get('Measurable target', 'Measurable target'),
                }
                # Add translations for all policy category names and measure names
                for category, measures in ghsci_policies['Checklist'].items():
                    context_labels[category] = phrases.get(category, category)
                    for measure in measures:
                        context_labels[measure] = phrases.get(measure, measure)
                # 'Climate disaster risk reduction policies' has no matching phrase key;
                # override with the shorter available key after the loop.
                context_labels['Climate disaster risk reduction policies'] = phrases.get(
                    'Climate disaster risk reduction',
                    context_labels.get('Climate disaster risk reduction policies', 'Climate disaster risk reduction policies')
                )
                # Score box labels
                context_labels['presence_text'] = phrases.get('presence_text', 'Policy presence')
                context_labels['quality_text'] = phrases.get('quality_text', 'Policy quality')
                # Self-name of this language (for language toggle button labels in the UI)
                context_labels['language'] = phrases.get('language', lang)
                if report_config is None:
                    report_config = {}
                report_config.setdefault('reporting', {}).setdefault('languages', {}).setdefault(lang, {})['contextLabels'] = context_labels
                print(f"Stored contextLabels for language '{lang}'")
            except Exception as label_err:
                print(f"Warning: Could not extract contextLabels for language '{lang}': {label_err}")
        except Exception as e:
            print(f"Warning: Failed to generate/upload PDF for language '{lang}': {str(e)}")
            traceback.print_exc()

    if not pdf_urls:
        raise RuntimeError("No PDF reports were successfully generated for any language")

    primary_url = pdf_urls.get('English', first_upload_key)

    # Persist updated reportConfig (now containing contextLabels per language and the
    # full merged selectedLanguages list) to DynamoDB.
    if report_config:
        try:
            # Keep selectedLanguages in sync with what was actually generated.
            report_config.setdefault('reporting', {})['selectedLanguages'] = selected_languages
            update_report_config(key, report_config, record_id=record_id)
            print("Persisted updated reportConfig with contextLabels to DynamoDB")
        except Exception as e:
            print(f"Warning: Failed to persist updated reportConfig: {str(e)}")

    # Update database record with COMPLETED status
    try:
        update_report_status(key, 'COMPLETED', pdf_url=primary_url, pdf_urls=pdf_urls, record_id=record_id)
        print(f"File {key} processed successfully")
    except Exception as e:
        raise RuntimeError(f"Failed to update status to COMPLETED: {str(e)}")


def process_form_submission(bucket, form_data, synthetic_key, report_config=None, record_id=None):
    """
    Handle an online form submission by generating a PDF directly from form data,
    without creating or uploading an intermediate xlsx file.

    The form data is converted in-memory to the same data structures that the
    xlsx pipeline produces (policy setting dict + audit DataFrame), then fed
    straight into generate_online_policy_report_from_form_data().
    """
    print(f"process_form_submission called with synthetic_key={synthetic_key}, record_id={record_id}")

    # Remove internal _force flag if present (no longer used, but guard against stale clients).
    if isinstance(form_data, dict):
        form_data.pop('_force', None)

    # Duplicate guard: only skip if already COMPLETED.
    try:
        existing = find_report_record(synthetic_key, record_id=record_id, max_retries=1, required=False)
        if existing and existing.get('status', '') == 'COMPLETED':
            print(f"Duplicate trigger detected: record {synthetic_key} already COMPLETED. Skipping.")
            return
    except Exception as e:
        print(f"Warning: Could not check for duplicate trigger: {e}")

    collection_details = form_data.get('collectionDetails', {})
    form_policies = form_data.get('policies', {})

    # Build a meaningful PDF filename from collection details, e.g.:
    #   gohsc-policy-indicator-checklist-Melbourne-Australia-2025.pdf
    # Fall back to the synthetic-key timestamp if fields are missing.
    def _slugify(value: str) -> str:
        """Convert a string to a URL/filename-safe slug."""
        import re
        value = str(value).strip()
        value = re.sub(r'[^\w\s-]', '', value)   # remove non-word chars except dash
        value = re.sub(r'[\s_]+', '-', value)      # spaces/underscores → dash
        value = re.sub(r'-+', '-', value)           # collapse repeated dashes
        return value.strip('-')

    cd_city    = _slugify(collection_details.get('city', ''))
    cd_country = _slugify(collection_details.get('country', ''))
    cd_year    = _slugify(collection_details.get('date', ''))

    if cd_city and cd_country and cd_year:
        file_basename = f'gohsc-policy-indicator-checklist-{cd_city}-{cd_country}-{cd_year}'
    elif cd_city and cd_country:
        file_basename = f'gohsc-policy-indicator-checklist-{cd_city}-{cd_country}'
    else:
        # Fallback: use the timestamp from the synthetic key
        filename = synthetic_key.split('/')[-1]
        file_basename = os.path.splitext(filename)[0]

    output_pdf_name = f'{file_basename}.pdf'
    pdf_local_path = f'/tmp/{output_pdf_name}'
    s3_upload_key = f'public/reports/{output_pdf_name}'
    print(f"Will upload PDF to: {s3_upload_key}")

    # Persist report_config to DynamoDB before PDF generation.
    if report_config:
        try:
            update_report_config(synthetic_key, report_config, record_id=record_id)
            print("Persisted report_config to DynamoDB")
        except Exception as e:
            print(f"Warning: Failed to persist report_config to DynamoDB: {e}")

    # Build in-memory parsed structures directly from form data.
    policy_setting = get_policy_setting_from_form_data(collection_details)
    audit = get_policy_audit_from_form_data(form_policies)

    # Extract and save policy data for viewing.
    try:
        policy_data = policy_data_setup(audit)
        policy_scores = get_policy_presence_quality_score_dictionary(audit)
        policy_raw_details = get_raw_policy_details(audit)
        if policy_data:
            update_policy_data(synthetic_key, policy_data, scores=policy_scores, raw_details=policy_raw_details, record_id=record_id)
            print("Policy data extracted and saved successfully")
        else:
            print("Warning: policy_data_setup returned None")
    except Exception as e:
        print(f"Warning: Error extracting policy data: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")

    # Determine which languages to generate reports for
    selected_languages = (
        report_config.get('reporting', {}).get('selectedLanguages', ['English'])
        if report_config else ['English']
    )
    if not selected_languages:
        selected_languages = ['English']
    if 'English' not in selected_languages:
        selected_languages = ['English'] + selected_languages
    print(f"Generating reports for languages: {selected_languages}")

    # Generate one PDF per language, collect S3 keys
    import re as _re
    pdf_urls = {}
    first_upload_key = None
    for lang in selected_languages:
        try:
            print(f"Generating PDF report for language: {lang}")
            lang_pdf = generate_online_policy_report_from_form_data(
                collection_details=collection_details,
                form_policies=form_policies,
                bucket=bucket,
                options={'language': lang},
                report_config=report_config,
            )
            if lang_pdf is None:
                print(f"Warning: generate_online_policy_report_from_form_data returned None for language '{lang}', skipping")
                continue
            lang_slug = _re.sub(r'[^\w]+', '-', lang).strip('-').lower()
            lang_pdf_name = f'{file_basename}-{lang_slug}.pdf'
            lang_pdf_local = f'/tmp/{lang_pdf_name}'
            lang_s3_key = f'public/reports/{lang_pdf_name}'
            lang_pdf.output(lang_pdf_local)
            print(f"PDF written to {lang_pdf_local}")
            s3_client.upload_file(lang_pdf_local, bucket, lang_s3_key)
            print(f"Uploaded {lang} PDF to {lang_s3_key}")
            pdf_urls[lang] = lang_s3_key
            if first_upload_key is None:
                first_upload_key = lang_s3_key
            # Extract translated UI labels from phrases and store in reportConfig so
            # the frontend can display section headings, summary label, and policy
            # checklist category/measure names in the configured language.
            try:
                phrases = get_phrases(lang)
                context_labels = {
                    # Report settings section headings
                    'City context': phrases.get('City context', 'City context'),
                    'Demographics and health equity': phrases.get('Demographics and health equity', 'Demographics and health equity'),
                    'Environmental disaster context': phrases.get('Environmental disaster context', 'Environmental disaster context'),
                    'Levels of government': phrases.get('Levels of government', 'Levels of government'),
                    'executive_summary': phrases.get('executive_summary', 'Summary'),
                    # Policy checklist table column headers
                    'Policy identified': phrases.get('Policy identified', 'Identified'),
                    'Aligns with healthy cities principles': phrases.get('Aligns with healthy cities principles', 'Aligns'),
                    'Measurable target': phrases.get('Measurable target', 'Measurable target'),
                }
                # Add translations for all policy category names and measure names
                for category, measures in ghsci_policies['Checklist'].items():
                    context_labels[category] = phrases.get(category, category)
                    for measure in measures:
                        context_labels[measure] = phrases.get(measure, measure)
                # 'Climate disaster risk reduction policies' has no matching phrase key;
                # override with the shorter available key after the loop.
                context_labels['Climate disaster risk reduction policies'] = phrases.get(
                    'Climate disaster risk reduction',
                    context_labels.get('Climate disaster risk reduction policies', 'Climate disaster risk reduction policies')
                )
                # Score box labels
                context_labels['presence_text'] = phrases.get('presence_text', 'Policy presence')
                context_labels['quality_text'] = phrases.get('quality_text', 'Policy quality')
                # Self-name of this language (for language toggle button labels in the UI)
                context_labels['language'] = phrases.get('language', lang)
                if report_config is None:
                    report_config = {}
                report_config.setdefault('reporting', {}).setdefault('languages', {}).setdefault(lang, {})['contextLabels'] = context_labels
                print(f"Stored contextLabels for language '{lang}'")
            except Exception as label_err:
                print(f"Warning: Could not extract contextLabels for language '{lang}': {label_err}")
        except Exception as e:
            print(f"Warning: Failed to generate/upload PDF for language '{lang}': {str(e)}")
            import traceback as _tb
            _tb.print_exc()

    if not pdf_urls:
        update_report_status(synthetic_key, 'FAILED', error_message='No PDF reports were successfully generated for any language', record_id=record_id)
        raise RuntimeError("No PDF reports were successfully generated for any language")

    primary_url = pdf_urls.get('English', first_upload_key)

    # Persist updated reportConfig (now containing contextLabels per language and the
    # full merged selectedLanguages list) to DynamoDB.
    if report_config:
        try:
            report_config.setdefault('reporting', {})['selectedLanguages'] = selected_languages
            update_report_config(synthetic_key, report_config, record_id=record_id)
            print("Persisted updated reportConfig with contextLabels to DynamoDB")
        except Exception as e:
            print(f"Warning: Failed to persist updated reportConfig: {str(e)}")

    # Mark as COMPLETED.
    try:
        update_report_status(synthetic_key, 'COMPLETED', pdf_url=primary_url, pdf_urls=pdf_urls, record_id=record_id)
        print(f"Form submission {synthetic_key} processed successfully")
    except Exception as e:
        raise RuntimeError(f"Failed to update status to COMPLETED: {str(e)}")

