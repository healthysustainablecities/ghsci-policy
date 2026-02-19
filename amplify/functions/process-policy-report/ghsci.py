import json
import os
import pandas as pd
import re
import time
from datetime import datetime
import babel
from babel.numbers import format_decimal as fnum
from babel.units import format_unit
from fpdf import FPDF, FlexTemplate
from boto3 import client

s3_client = client('s3')

configuration_xlsx = os.path.join(os.environ['LAMBDA_TASK_ROOT'], '_report_configuration.xlsx')

languages = pd.read_excel(configuration_xlsx, sheet_name='languages').fillna('')
indicators = {'report': {'policy': {'analyses': ['Presence', 'Checklist', 'POS', 'PT']}}}

policies = {'Indicators': {'Integrated city planning policies for health and sustainability': ['Transport and planning combined in one government department', "Transport policy with health-focused actions (i.e., explicit mention of the word 'health', 'wellbeing' or similar, as a goal or rationale for an action)", "Urban policy with health-focused actions (i.e., explicit mention of the word 'health', 'wellbeing' or similar, as a goal or rationale for an action)", 'Health Impact Assessment (i.e., evaluating potential impacts of policies/plans on population health) requirements in urban/transport policy or legislation', 'Urban and/or transport policy explicitly aims for integrated city planning', 'Publicly available information on government expenditure for different transport modes'], 'Walkability and destination access policies': ['Walking participation', 'Pedestrian infrastructure', 'Cycling participation', 'Cycling infrastructure', 'Traffic safety', 'Parking restrictions to discourage car use', 'Street connectivity', 'Housing or population density', 'Residential building heights', 'Limits on greenfield housing development', 'Mixture of housing types/sizes', 'Mixture of local destinations for daily living', 'Close distance to daily living destinations', 'Healthy food environments', 'Crime prevention through environmental design', 'Employment distribution', 'Ratio of jobs to housing'], 'Public transport policies': ['Access to employment and services via public transport', 'Public transport access', 'Public transport use'], 'Public open space policies': ['Public open space access'], 'Nature-based solutions policies': ['Tree canopy and urban greening', 'Urban biodiversity protection & promotion'], 'Urban air quality policies': ['Transport policies to limit air pollution', 'Land use policies to reduce air pollution exposure'], 'Climate disaster risk reduction policies': ['Adaptation and disaster risk reduction']}, 'Checklist': {'Integrated city planning policies for health and sustainability': ["Transport policy with health-focused actions (i.e., explicit mention of the word 'health', 'wellbeing' or similar, as a goal or rationale for an action)", "Urban policy with health-focused actions (i.e., explicit mention of the word 'health', 'wellbeing' or similar, as a goal or rationale for an action)", 'Health Impact Assessment (i.e., evaluating potential impacts of policies/plans on population health) requirements in urban/transport policy or legislation', 'Urban and/or transport policy explicitly aims for integrated city planning', 'Publicly available information on government expenditure for different transport modes'], 'Walkability and destination access policies': ['Walking participation', 'Pedestrian infrastructure', 'Cycling participation', 'Cycling infrastructure', 'Traffic safety', 'Parking restrictions to discourage car use', 'Street connectivity', 'Housing or population density', 'Residential building heights', 'Limits on greenfield housing development', 'Mixture of housing types/sizes', 'Mixture of local destinations for daily living', 'Close distance to daily living destinations', 'Healthy food environments', 'Crime prevention through environmental design', 'Employment distribution', 'Ratio of jobs to housing'], 'Public transport policies': ['Access to employment and services via public transport', 'Public transport access', 'Public transport use'], 'Public open space policies': ['Public open space access'], 'Nature-based solutions policies': ['Tree canopy and urban greening', 'Urban biodiversity protection & promotion'], 'Urban air quality policies': ['Transport policies to limit air pollution', 'Land use policies to reduce air pollution exposure'], 'Climate disaster risk reduction policies': ['Adaptation and disaster risk reduction']}}

config = {'name': None, 'codename': None, 'country': None, 'country_code': None, 'continent': None, 'year': None, 'policy_review': None, 'notes': None, 'reporting': {'templates': ['policy'], 'publication_ready': True, 'doi': '', 'images': {1: {'file': 'Example image of a vibrant, walkable, urban neighbourhood - landscape.jpg', 'description': 'Example image of a vibrant, walkable, urban neighbourhood with diverse people using active modes of transport and a tram (replace with a photograph, customised in region configuration)', 'credit': 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Carl Higgs, Bing Image Creator, 2023'}, 2: {'file': 'Example image 2-Landscape.jpg', 'description': 'Example image of a vibrant, walkable, urban area (replace with a photograph or your own image, customised in region configuration)', 'credit': 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Eugen Resendiz, Bing Image Creator, 2023'}, 3: {'file': 'Example image of a vibrant, walkable, urban neighbourhood - square.jpg', 'description': 'Example image of a vibrant, walkable, urban neighbourhood with diverse people using active modes of transport and a tram (replace with a photograph, customised in region configuration)', 'credit': 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Carl Higgs, Bing Image Creator, 2023'}, 4: {'file': 'Example image of climate resilient lively city watercolor-Square.jpg', 'description': 'Example image of a climate-resilient, lively city (replace with an image for your city, customised in region configuration)', 'credit': 'Feature inspiring healthy, sustainable urban design from your city, crediting the source, e.g.: Eugen Resendiz, Bing Image Creator, 2023'}}, 'languages': {'English': {'name': 'Las Palmas de Gran Canaria', 'country': 'Spain', 'summary_policy': 'After reviewing policy indicator results for your city, provide a contextualised summary by modifying the "summary_policy" text for each configured language within the region configuration file.\n', 'summary_spatial': 'After reviewing spatial indicator results for your city, provide a contextualised summary by modifying the "summary_spatial" text for each configured language within the region configuration file.\n', 'summary_policy_spatial': 'After reviewing both the policy and spatial indicator results for your city, provide a contextualised summary by modifying the "summary_policy_spatial" text for each configured language within the region configuration file.\n', 'context': [{'City context': [{'summary': 'Provide background context for your study region, for example, a brief summary of the location, history and topography, as relevant.'}]}, {'Demographics and health equity': [{'summary': ''}]}, {'Environmental disaster context': [{'summary': ''}]}, {'Levels of government': [{'summary': ''}]}, {'Additional context': [{'summary': ''}]}]}}, 'exceptions': {}, '__version__': '4.10.5', 'folder_path': '/home/ghsci', 'date_hhmm': '', 'authors': None, 'configuration': configuration_xlsx},'folder_path': os.environ.get('LAMBDA_TASK_ROOT', os.path.dirname(__file__))}

reports = {
    'policy': 'policy indicators',
    'policy_spatial': 'policy and spatial indicators',
    'spatial': 'spatial indicators',
}

def get_and_setup_font(language):
    """Setup and return font for given language configuration."""
    fonts = pd.read_excel(configuration_xlsx, sheet_name='fonts')
    fonts['Language'] = fonts['Language'].str.split(',')
    fonts = fonts.explode('Language')
    if language.replace(' (Auto-translation)', '') in fonts.Language.unique():
        fonts = fonts.loc[
            fonts['Language'] == language.replace(' (Auto-translation)', '')
        ].fillna('')
    else:
        fonts = fonts.loc[fonts['Language'] == 'default'].fillna('')
    fonts['File'] = fonts['File'].str.strip()
    
    # Update font paths to use local Lambda deployment path
    lambda_root = os.environ.get('LAMBDA_TASK_ROOT', os.path.dirname(__file__))
    for index, row in fonts.iterrows():
        # Try local bundled font first
        local_font_path = os.path.join(lambda_root, 'configuration', row['File'])
        if os.path.exists(local_font_path):
            fonts.at[index, 'File'] = local_font_path
        elif not os.path.exists(row['File']):
            context = f"Font '{row['File']}' has been configured for {language}, however this file could not be located."
            raise FileNotFoundError(context)
    font = fonts.Font.values[0]
    return font


def get_phrases(
    language='English',
    reporting_template='policy',
):
    """Prepare dictionary for specific language translation given English phrase."""
    phrases = json.loads(languages.set_index('name').to_json())[language]
    # _check_config_language(language=language, languages=languages)
    city_details = config['reporting']
    phrases['city'] = config['name']
    phrases['city_name'] = city_details['languages'][language]['name']
    phrases['country'] = city_details['languages'][language]['country']
    phrases['study_doi'] = 'https://healthysustainablecities.org'
    phrases['summary_policy'] = city_details['languages'][language].get(
        'summary_policy',
        '',
    )
    phrases['year'] = str(config['year'])
    phrases['current_year'] = str(datetime.now().year)
    country_code = config['country_code']
    # set default English country code
    if language == 'English' and country_code not in ['AU', 'GB', 'US']:
        country_code = 'AU'
    phrases['locale'] = f'{phrases["language_code"]}_{country_code}'
    try:
        babel.Locale.parse(phrases['locale'])
    except babel.core.UnknownLocaleError:
        phrases['locale'] = f'{phrases["language_code"]}'
        babel.Locale.parse(phrases['locale'])
    # extract English language variables
    phrases['metadata_author'] = languages.loc[
        languages['name'] == 'title_author',
        'English',
    ].values[0]
    phrases['metadata_title1'] = languages.loc[
        languages['name'] == 'title_series_line1',
        'English',
    ].values[0]
    phrases['metadata_title2'] = languages.loc[
        languages['name'] == 'disclaimer',
        'English',
    ].values[0]
    # restrict to specific language
    langue = languages.loc[
        languages['role'] == 'template',
        ['name', language],
    ]
    phrases['vernacular'] = langue.loc[
        langue['name'] == 'language',
        language,
    ].values[0]
    if city_details['doi'] is not None:
        phrases['city_doi'] = city_details['doi']
    else:
        phrases['city_doi'] = ''
    if (
        reporting_template is not None
        and f'doi_{reporting_template}' in city_details
        and city_details[f'doi_{reporting_template}'] is not None
    ):
        phrases['city_doi'] = city_details[f'doi_{reporting_template}']
    for i in range(1, len(city_details['images']) + 1):
        phrases[f'Image {i} file'] = city_details['images'][i]['file']
        phrases[f'Image {i} credit'] = city_details['images'][i]['credit']
    phrases['GOHSC_executive'] = (
        'Deepti Adlakha, Jonathan Arundel, Geoff Boeing, Eugen Resendiz Bontrud, Ester Cerin, Billie Giles-Corti, Carl Higgs, Vuokko Heikinheimo, Erica Hinckson, Shiqin Liu, Melanie Lowe, Anne Vernez Moudon, Jim Sallis, Deborah Salvo'
    )
    phrases['editor_names'] = (
        'Carl Higgs, Eugen Resendiz, Melanie Lowe and Deborah Salvo'
    )
    # incoporating study citations
    phrases['title_series_line2'] = phrases[reports[reporting_template]]
    citations = {
        'study_citations': '\n\nGlobal Observatory of Healthy & Sustainable Cities\nhttps://www.healthysustainablecities.org',
        'citations': '{citation_series}: {study_citations}\n\n. Zenodo. https://doi.org/10.5281/zenodo.1287763',
    }
    if language == 'English':
        citations['citation_doi'] = (
            '{author_names}. {year}. {title_series_line1}: {title_city}—{title_series_line2} ({vernacular}).  Global Observatory of Healthy and Sustainable Cities. {city_doi}'
        )
    else:
        citations['citation_doi'] = (
            '{author_names}. {year}. {title_series_line1}: {title_city}—{title_series_line2} ({vernacular}).  Global Observatory of Healthy and Sustainable Cities. {translation}. {city_doi}'
        )

    # handle city-specific exceptions
    language_exceptions = city_details['exceptions']
    if (language_exceptions is not None) and (
        language in language_exceptions
    ):
        for e in language_exceptions[language]:
            phrases[e] = language_exceptions[language][e]
    for citation in citations:
        if citation != 'citation_doi' or 'citation_doi' not in phrases:
            phrases[citation] = citations[citation].format(**phrases)
    phrases['citation_doi'] = (
        phrases['citation_doi'].format(**phrases).replace('\n', '')
    )
    # Conditional draft marking if not flagged as publication ready
    if config['reporting']['publication_ready']:
        phrases['metadata_title2'] = ''
        phrases['disclaimer'] = ''
        phrases['filename_publication_check'] = ''
    else:
        phrases['citation_doi'] = (
            f"{phrases['citation_doi']} ({phrases['DRAFT ONLY header warning']})."
        )
        phrases['title_city'] = (
            f"{phrases['title_city']} ({phrases['DRAFT ONLY header warning']})"
        )
        phrases['filename_publication_check'] = (
            f" ({phrases['DRAFT ONLY header warning']})"
        )
    return phrases

def generate_online_policy_report(
    checklist: str = None,
    bucket: str = None,
    options: dict = {'language': 'English'},
):
    """Generate a policy report for a completed policy checklist."""    
    policy_setting = get_policy_setting(checklist)
    if 'language' not in options:
        print('No language specified; defaulting to English.')
        language = 'English'
    else:
        language = options['language']
        if language not in config['reporting']['languages']:
            config['reporting']['languages'][language] = {}
        if language not in config['reporting']['exceptions']:
            config['reporting']['exceptions'][language] = {}
    config['folder_path'] = os.environ.get('LAMBDA_TASK_ROOT', os.path.dirname(__file__))
    config['bucket'] = bucket
    config['policy_review'] = checklist
    config['codename'] = policy_setting['City']
    config['name'] = policy_setting['City']
    config['codename'] = policy_setting['City']
    config['name'] = policy_setting['City']
    config['year'] = policy_setting['Date']
    if str(config['year']) in ['nan', 'NaN', '']:
        config['year'] = time.strftime('%Y-%m-%d')
    config['region_dir'] = f'{bucket}/public/data'
    # config['reporting']['images'] = {}
    config['reporting']['languages'][language]['name'] = policy_setting[
        'City'
    ]
    config['reporting']['languages'][language]['country'] = policy_setting[
        'Country'
    ]
    config['reporting']['exceptions'][language]['author_names'] = (
        policy_setting['Person(s)']
    )
    policy_review = policy_data_setup(
        config['policy_review']
    )
    report_template = 'policy'
    if policy_review is None:
        print(
            f"The policy checklist ({config['policy_review']}) could not be loaded.",
        )
        return None
    if 'images' in options:
        config['reporting']['images'] = options['images']
        print(
            f'\nCustom image configuration:\n{config["reporting"]["images"]}',
        )
    if 'context' in options:
        config['reporting']['languages'][language]['context'] = options[
            'context'
        ]
        print(
            f'\nCustom context:\n{config["reporting"]["languages"][language]["context"]}',
        )
    if 'summary' in options:
        config['reporting']['languages'][language]['summary_policy'] = (
            options['summary']
        )
        print(
            f'\nCustom summary:\n{config["reporting"]["languages"][language]["summary_policy"]}',
        )
    if 'summary_policy' in options:
        config['reporting']['languages'][language]['summary_policy'] = (
            options['summary_policy']
        )
        print(
            f'\nCustom summary:\n{config["reporting"]["languages"][language]["summary_policy"]}',
        )
    if 'exceptions' in options:
        config['reporting']['exceptions'][language] = options['exceptions']
        print(
            f"\nCustom exceptions:\n{config['reporting']['exceptions'][language]}",
        )
    if 'publication_ready' in options:
        config['reporting']['publication_ready'] = options[
            'publication_ready'
        ]
    phrases = get_phrases(language)
    font = get_and_setup_font(language)
    pdf = generate_pdf(
        font,
        report_template,
        language,
        phrases,
        policy_review,
    )
    return pdf


def _checklist_policy_identified(policy):
    """Check if policy identified.

    If any policy name entered for a particular measure ('Yes'); otherwise, 'None identified'.
    """
    identified = any(
        ~policy['Policy'].astype(str).isin(['No', '', 'nan', 'NaN']),
    )
    return ['✘', '✔'][identified]


def _checklist_policy_aligns(policy):
    """Check if policy aligns with healthy and sustainable cities principles.

    Yes: If policy details not entered under 'no' principles (qualifier!='No'; noting some policies aren't yes or no)

    No: If a policy identified with details entered under 'no' principles, without an aligned policy identified

    Mixed: If both 'yes' (and aligned) and 'no' principles identified
    """
    # policy_count = len(policy.query("""qualifier!='No'"""))
    identified = any(
        ~policy['Policy'].astype(str).isin(['No', '', 'nan', 'NaN']),
    )
    aligns = any(
        policy.query(
            """Policy.astype('str') not in ['No','','nan','NaN'] and qualifier!='No' and `Evidence-informed threshold`.astype('str') not in ['No']""",
        )['Policy'],
    )
    does_not_align = any(
        policy.query(
            """Policy.astype('str') not in ['No','','nan','NaN'] and qualifier=='No'""",
        )['Policy'],
    )
    # if aligns_count == policy_count:
    #     return '✔'
    if aligns and does_not_align:
        return '✔/✘'
    elif aligns:
        return '✔'
        # return f'✔ ({aligns_count}/{policy_count})'
    elif identified and (not aligns or does_not_align):
        return '✘'
    else:
        return '-'


def _checklist_policy_measurable(policy):
    """Check if policy has a measurable target."""
    identified = any(
        ~policy['Policy'].astype(str).isin(['No', '', 'nan', 'NaN']),
    )
    measurable = any(
        policy.query(
            """Policy.astype('str') not in ['No','','nan','NaN'] and `Measurable target`.astype('str') not in ['No','','nan','NaN','Unclear']""",
        )['Policy'],
    )
    not_measurable = any(
        policy.query(
            """Policy.astype('str') not in ['No','','nan','NaN'] and `Measurable target`.astype('str') in ['No','','nan','NaN','Unclear']""",
        )['Policy'],
    )
    if measurable and not_measurable:
        return '✔'
        # return '✔+✘'
    elif measurable:
        return '✔'
    elif identified and (not measurable or not_measurable):
        return '✘'
    else:
        return '-'

def policy_data_setup(xlsx: str):
    """Returns a dictionary of policy data."""
    # get list of all valid measures
    measures = [
        measure
        for categories in [
            policies['Checklist'][x] for x in policies['Checklist']
        ]
        for measure in categories
    ]
    # read in completed policy checklist
    audit = get_policy_checklist(xlsx)
    if audit is not None:
        # restrict policy checklist to valid measures
        audit = audit.loc[audit['Measures'].isin(measures)]
    else:
        print('Policy checklist evaluation will be skipped.')
        return None
    # initialise and populate checklist for specific themes
    checklist = {}
    for topic in policies['Checklist']:
        checklist[topic] = pd.DataFrame.from_dict(
            policies['Checklist'][topic],
        ).set_index(0)
        checklist[topic].index.name = 'Measure'
        # initialise criteria columns
        checklist[topic]['identified'] = '-'
        checklist[topic]['aligns'] = '-'
        checklist[topic]['measurable'] = '-'
        for measure in checklist[topic].index:
            if audit is not None:
                policy_measure = audit.query(f'Measures == "{measure}"')
                # evaluate indicators against criteria
                checklist[topic].loc[
                    measure,
                    'identified',
                ] = _checklist_policy_identified(policy_measure)
                checklist[topic].loc[
                    measure,
                    'aligns',
                ] = _checklist_policy_aligns(policy_measure)
                checklist[topic].loc[
                    measure,
                    'measurable',
                ] = _checklist_policy_measurable(policy_measure)
                # checklist[topic].loc[measure,'evidence'] = _checklist_policy_evidence(policy_measure)
            else:
                checklist[topic].loc[
                    measure,
                    ['identified', 'aligns', 'measurable'],
                ] = '-'
    # Replace all '✘' with '-' for topics where all criteria are '✘'
    for topic in checklist:
        if (checklist[topic]['identified'] == '✘').all():
            checklist[topic]['identified'] = checklist[topic][
                'identified'
            ].replace('✘', '-')
    return checklist


def get_policy_presence_quality_score_dictionary(xlsx):
    """
    Returns a dictionary with scores for presence and quality of policy data.

    Only unique measures are evaluated (ie. if a measure is reported multiple themes, only its highest rating instance is evaluated).

    'Transport and planning combined in one government department' is excluded from quality rating.

    Quality scores for 'aligns':
    - '✔': 1
    - '✔/✘': -0.5
    - '✘': -1

    Quality scores for 'measurable':
    - no relevant policy = 0;
    - policy but 'no' measurable target = 1;
    - policy with 'yes' measurable target = 2.

    Final quality score for measures is the product of the 'align score' and 'measurable score'.

    Overall quality score is the sum of the quality scores for each measure.
    """
    # read in completed policy checklist
    audit = get_policy_checklist(xlsx)
    if audit is None:
        print(
            f'Policy document does not appear to have been completed and evaluation will be skipped.  Check the configured document {xlsx} is complete to proceed.',
        )
        return None
    # initialise and populate checklist for specific themes
    checklist = pd.DataFrame.from_dict(audit['Measures'].unique()).set_index(0)
    checklist.index.name = 'Measure'
    # initialise criteria columns
    checklist['identified'] = '-'
    checklist['aligns'] = '-'
    checklist['measurable'] = '-'
    for measure in checklist.index:
        if audit is not None:
            policy_measure = audit.query(f'Measures == "{measure}"')
            # evaluate indicators against criteria
            checklist.loc[measure, 'identified'] = (
                _checklist_policy_identified(
                    policy_measure,
                )
            )
            checklist.loc[measure, 'aligns'] = _checklist_policy_aligns(
                policy_measure,
            )
            checklist.loc[
                measure,
                'measurable',
            ] = _checklist_policy_measurable(policy_measure)
            # checklist.loc[measure,'evidence'] = _checklist_policy_evidence(policy_measure)
        else:
            checklist.loc[measure, ['identified', 'aligns', 'measurable']] = (
                '-'
            )
    checklist['align_score'] = checklist['aligns'].map(
        {'✔': 1, '✔/✘': -0.5, '✘': -1},
    )
    checklist['measurable_score'] = checklist['measurable'].map(
        {'✔': 2, '✘': 1, '-': 0},
    )
    checklist['quality'] = (
        checklist['align_score'] * checklist['measurable_score']
    )
    policy_score = {}
    policy_score['presence'] = {
        'numerator': (checklist['identified'] == '✔').sum(),
        'denominator': len(checklist),
    }
    policy_score['quality'] = {
        'numerator': checklist.loc[
            ~(
                checklist.index
                == 'Transport and planning combined in one government department'
            ),
            'quality',
        ].sum(),
        'denominator': len(
            checklist.loc[
                ~(
                    checklist.index
                    == 'Transport and planning combined in one government department'
                )
            ],
        )
        * 2,
    }
    return policy_score


def get_policy_checklist(xlsx) -> dict:
    """Get and format policy checklist from Excel into series of DataFrames organised by indicator and measure in a dictionary."""

    try:
        df = pd.read_excel(
            xlsx,
            sheet_name='Policy Checklist',
            header=2,
            usecols='A:M',
        )
        df.columns = [
            'Measures',
            'Policies',
            'Policy',
            'Level of government',
            'Adoption date',
            'Citation',
            'Text',
            'Mandatory',
            'Measurable target',
            'Measurable target text',
            'Evidence-informed threshold',
            'Threshold explanation',
            'Notes',
        ]
        df.insert(
            0,
            'Indicators',
            [
                x if x in policies['Indicators'].keys() else pd.NA
                for x in df['Measures']
            ],
        )
        # Strip redundant white space (e.g. at start or end of cell values that could impede matching or formatting)
        df = df.apply(lambda x: x.str.strip() if x.dtype == 'object' else x)
        # fill down Indicators column values
        df.loc[:, ['Indicators', 'Measures']] = df.loc[
            :,
            ['Indicators', 'Measures'],
        ].ffill()
        # Exclude rows with NA for indicators
        df = df.loc[~df['Indicators'].isna()]
        # Exclude dataframe rows where indicators match measures (i.e. section headers)
        df = df.query('~(Indicators==Measures)').copy()
        # Add qualifier for evaluating policy polarity when scoring
        policy_qualifiers = (
            df['Policies'].isin([''])
            | df['Policies'].str.startswith('No')
            | df['Policies'].str.startswith('Yes')
        )
        df['qualifier'] = (
            df['Policies']
            .where(policy_qualifiers)
            .str.split(',')
            .str[0]
            .ffill()
            .fillna('')
        )
        # Exclude policy heading rows
        df = df.loc[~policy_qualifiers]
        return df
    except Exception as e:
        print(
            f'  Error reading policy checklist; please ensure these have been completed.  Specific error: {e}',
        )
        return None


def get_policy_setting(xlsx) -> dict:
    """Get and format policy checklist from Excel into series of DataFrames organised by indicator and measure in a dictionary."""
    try:
        df = pd.read_excel(xlsx, sheet_name='Collection details', header=3)
        if len(df.columns) < 3:
            print(
                'Policy checklist collection details appear not to have completed (no values found in column C); please check the specified file has been completed.',
            )
            return None
        # Strip redundant white space (e.g. at start or end of cell values that could impede matching or formatting)
        df.columns = ['item', 'location', 'value']
        df.loc[:, 'item'] = df.loc[:, 'item'].ffill()
        setting = {}
        setting['Person(s)'] = df.loc[
            df['item'] == 'Name of person(s) completing checklist:',
            'value',
        ].values[0]
        setting['E-mail'] = df.loc[
            df['item'] == 'Email address(es):',
            'value',
        ].values[0]
        setting['Date'] = df.loc[
            df['item'] == 'Date completed:',
            'value',
        ].values[0]
        try:
            setting['Date'] = setting['Date'].strftime('%Y')
        except Exception:
            pass
        setting['City'] = df.loc[
            df['item'] == 'City:',
            'value',
        ].values[0]
        setting['Region'] = df.loc[
            df['item'] == 'State/province/county/region:',
            'value',
        ].values[0]
        setting['Country'] = df.loc[
            df['item'] == 'Country:',
            'value',
        ].values[0]
        setting['Levels of government'] = df.loc[
            df['item'].str.startswith(
                'Governments included in the policy checklist:',
            ),
            'value',
        ].values[0]
        setting['Environmental disaster context'] = {}
        disasters = [
            'Severe storms',
            'Floods',
            'Bushfires/wildfires',
            'Heatwaves',
            'Extreme cold',
            'Typhoons',
            'Hurricanes',
            'Cyclones',
            'Earthquakes',
        ]
        for disaster in disasters:
            setting['Environmental disaster context'][disaster] = df.loc[
                (df['item'].str.strip() == disaster)
                & (df['item'].str.strip() != 'Other (please specify)'),
                'value',
            ].values[0]
        setting['Environmental disaster context']['Other'] = df.loc[
            df['item'] == 'Other (please specify)',
            'value',
        ].values[0]
        setting['Environmental disaster context'] = '\n'.join(
            [
                f'{x}: {setting["Environmental disaster context"][x]}'
                for x in setting['Environmental disaster context']
                if str(setting['Environmental disaster context'][x]) != 'nan'
            ],
        )
        for x in setting:
            if setting[x] == '':
                setting[x] = 'Not specified'
        return setting
    except Exception as e:
        print(
            f'  Error reading policy checklist "Collection details" worksheet; please ensure that this has been completed.\nSpecific error: {e}',
        )
        return None


def get_policy_checklist_item(
    policy_review_setting,
    phrases,
    item='Levels of government',
):
    """Get policy checklist items (e.g. 'Levels of government' or 'Environmnetal disaster context')."""
    if policy_review_setting is None:
        return []
    levels = policy_review_setting[item].split('\n')
    if len(levels) == 0:
        return []
    elif len(levels) == 1:
        return levels
    elif len(levels) > 1:
        levels_clean = [
            phrases[level[0].strip()].strip()
            for level in [
                x.split(': ')
                for x in levels
                if not (
                    x.startswith('Other') or x.startswith('(Please indicate')
                )
            ]
            if str(level[1]).strip()
            not in ['No', 'missing', 'nan', 'None', 'N/A', '']
        ]
        levels_clean = levels_clean + [
            x.replace('Other: ', '').lower()
            for x in levels
            if x.startswith('Other: ')
        ]
        return levels_clean


def summarise_policy(series_or_df):
    """
    Summarise policy evaluation for 'identified', 'aligns', 'measurable'.

    Input: pandas Series or DataFrame with these three fields.
    For each field:
      - Return '✔' if all values are '✔'
      - Return '-' if all values are '-'
      - Else return '✘'
    Returns a dictionary: {name: {field: result, ...}}
    """
    if isinstance(series_or_df, pd.Series):
        summary = {
            col: series_or_df[col]
            for col in ['identified', 'aligns', 'measurable']
            if col in series_or_df
        }
        return summary
    elif isinstance(series_or_df, pd.DataFrame):
        summary = {}
        for col in ['identified', 'aligns', 'measurable']:
            values = series_or_df[col]
            if (values == '✔').all():
                summary[col] = '✔'
            elif (values == '-').all():
                summary[col] = '-'
            else:
                summary[col] = '✘'
        return summary
    else:
        raise TypeError('Input must be a pandas Series or DataFrame')


# PDF layout set up
class PDF_Policy_Report(FPDF):
    """PDF report class for analysis report."""

    def __init__(self, policy_checklist, *args, **kwargs):
        super(self.__class__, self).__init__(*args, **kwargs)
        self.file = policy_checklist

    def generate_policy_report(self):
        """Generate analysis report."""
        file_path = generate_policy_report(self.file)
        return file_path
    
################
## PDF functions
################

def fpdf2_mm_scale(mm):
    """Returns a width double that of the conversion of mm to inches.

    This has been found, via trial and error, to be useful when preparing images for display in generated PDFs using fpdf2.
    """
    return 2 * mm / 25.4


def _pct(value, locale, length='short'):
    """Formats a percentage sign according to a given locale."""
    return format_unit(value, 'percent', locale=locale, length=length)


def pdf_template_setup(
    config,
    template,
    font=None,
    language='English',
    phrases=None,
):
    """
    Takes a template xlsx sheet defining elements for use in fpdf2's FlexTemplate function.

    This is loosely based on the specification at https://pyfpdf.github.io/fpdf2/Templates.html
    However, it has been modified to allow additional definitions which are parsed
    by this function
      - can define the page for which template elements are to be applied
      - colours are specified using standard hexadecimal codes
    Any blank cells are set to represent "None".
    The function returns a dictionary of elements, indexed by page number strings.
    """
    # read in elements
    elements = pd.read_excel(
        config['reporting']['configuration'],
        sheet_name=template,
    )
    fonts = pd.read_excel(
        config['reporting']['configuration'],
        sheet_name='fonts',
    )
    fonts['Language'] = fonts['Language'].str.split(',')
    fonts = fonts.explode('Language')
    right_to_left = fonts.query('Align=="Right"')['Language'].unique()
    char_wrap = fonts.query('Wrapmode=="CHAR"')['Language'].unique()
    conditional_size = fonts.loc[~fonts['Conditional size'].isna()]
    document_pages = elements.page.unique()
    # Conditional formatting for specific languages to improve pagination
    if language in right_to_left:
        elements['align'] = (
            elements['align'].replace('L', 'R').replace('J', 'R')
        )
        elements.loc[elements['name'] == 'Low', ['x1', 'x2']] -= 18
        elements.loc[
            elements['name'].isin(
                [f'study region legend patch {x}' for x in ['a', 'b']],
            ),
            ['x1', 'x2'],
        ] += 46
        elements.loc[
            elements['name'] == 'study region legend patch c',
            ['x1', 'x2'],
        ] += 50
    if language in char_wrap:
        elements['wrapmode'] = 'CHAR'
    else:
        elements['wrapmode'] = 'WORD'
    if language in conditional_size['Language'].unique().tolist():
        for condition in conditional_size.loc[
            conditional_size['Language'] == language,
            'Conditional size',
        ].unique():
            tuple = str(condition).split(',')
            if len(tuple) == 2:
                expression = f"((elements['type'] == 'T')|(elements['type'] == 'W')) & (elements['size'] {tuple[0]})"
                elements.loc[eval(expression), 'size'] = elements.loc[
                    eval(expression),
                    'size',
                ] + eval(tuple[1])
    if font is not None:
        elements.loc[elements.font == 'custom', 'font'] = font
    elements = elements.to_dict(orient='records')
    elements = [
        {k: v if not str(v) == 'nan' else None for k, v in x.items()}
        for x in elements
    ]
    # Need to convert hexadecimal colours (eg FFFFFF is white) to
    # decimal colours for the fpdf Template class to work
    # We'll establish default hex colours for foreground and background
    planes = {'foreground': '000000', 'background': None}
    for i, element in enumerate(elements):
        for plane in planes:
            if elements[i][plane] not in [None, 'None', 0]:
                # this assumes a hexadecimal string without the 0x prefix
                elements[i][plane] = int(elements[i][plane], 16)
            elif plane == 'foreground':
                elements[i][plane] = int(planes[plane], 16)
            else:
                del elements[i][plane]
    pages = format_pages(document_pages, elements, phrases)
    return pages


def format_pages(document_pages, elements, phrases):
    """Format page with phrases."""
    pages = {}
    for page in document_pages:
        pages[f'{page}'] = [x for x in elements if x['page'] == page]
        for i, item in enumerate(pages[f'{page}']):
            if item['name'] in phrases:
                try:
                    pages[f'{page}'][i]['text'] = phrases[item['name']].format(
                        **phrases,
                    )
                except Exception:
                    pages[f'{page}'][i]['text'] = phrases[item['name']]
    return pages


def find_page_index_with_name(pages, page, name_value):
    for index, record in enumerate(pages[str(page)]):
        if record.get('name') == name_value:
            return index
    return None


def check_and_update_report_title_layout(
    pages,
    phrases,
    threshold=70,
    offset=8,
):
    """If report title is too long, adjust layout."""
    if len(phrases['title_series_line2']) > 70:
        shiftings = ['title_series_line1', 'disclaimer']
        for shift in shiftings:
            index = find_page_index_with_name(pages, 1, shift)
            if index is not None:
                pages['1'][index]['y1'] = pages['1'][index]['y1'] + offset
                pages['1'][index]['y2'] = pages['1'][index]['y2'] + offset
    return pages


def wrap_sentences(words, limit=50, delimiter=''):
    """Wrap sentences if exceeding limit."""
    sentences = []
    sentence = ''
    gap = len(delimiter)
    for i, word in enumerate(words):
        if i == 0:
            sentence = word
            continue
        # combine word to sentence if under limit
        if len(sentence) + gap + len(word) <= limit:
            sentence = sentence + delimiter + word
        else:
            sentences.append(sentence)
            sentence = word
            # append the final word if not yet appended
            if i == len(words) - 1:
                sentences.append(sentence)
        # finally, append sentence of all words if still below limit
        if (i == len(words) - 1) and (sentences == []):
            sentences.append(sentence)
    return sentences


def prepare_pdf_fonts(pdf, report_configuration, report_language):
    """Prepare PDF fonts."""
    fonts = pd.read_excel(report_configuration, sheet_name='fonts')
    fonts['Language'] = fonts['Language'].str.split(',')
    fonts = fonts.explode('Language')
    fonts = (
        fonts.loc[
            fonts['Language'].isin(
                [
                    'default',
                    report_language.replace(' (Auto-translation)', ''),
                ],
            )
        ]
        .fillna('')
        .drop_duplicates()
    )
    
    # Update font paths to use local Lambda deployment path
    lambda_root = os.environ.get('LAMBDA_TASK_ROOT', os.path.dirname(__file__))
    for index, row in fonts.iterrows():
        local_font_path = os.path.join(lambda_root, 'configuration', row['File'])
        if os.path.exists(local_font_path):
            fonts.at[index, 'File'] = local_font_path
    
    for s in ['', 'b', 'i', 'bi']:
        for langue in ['default', report_language]:
            if (
                langue.replace(' (Auto-translation)', '')
                in fonts.Language.unique()
            ):
                f = fonts.loc[
                    (
                        fonts['Language']
                        == langue.replace(' (Auto-translation)', '')
                    )
                    & (fonts['Style'] == s)
                ]
                if f'{f.Font.values[0]}{s}' not in pdf.fonts.keys():
                    pdf.add_font(
                        f.Font.values[0],
                        style=s,
                        fname=f.File.values[0],
                    )
    pdf.set_fallback_fonts(['dejavu'])
    pdf.set_text_shaping(True)
    return pdf


def save_pdf_layout(pdf, folder, filename):
    """Save a PDF report in template subfolder in specified location."""
    import re
    
    if not os.path.exists(folder):
        os.mkdir(folder)
    template_folder = f'{folder}/reports'
    if not os.path.exists(template_folder):
        os.mkdir(template_folder)
    
    # Sanitize filename to remove/replace invalid path characters
    # Replace forward slashes, backslashes, and other problematic characters
    invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
    cleaned_filename = filename
    for char in invalid_chars:
        cleaned_filename = cleaned_filename.replace(char, '-')
    
    # Also collapse multiple spaces/hyphens that might result
    cleaned_filename = re.sub(r'[-\s]+', ' ', cleaned_filename)
    cleaned_filename = cleaned_filename.strip()
    
    pdf.output(f'{template_folder}/{cleaned_filename}')
    return f'  reports/{cleaned_filename}'.replace('/home/ghsci/', '')


def _pdf_initialise_document(phrases, config):
    """Initialise PDF document."""
    pdf = FPDF(orientation='portrait', format='A4', unit='mm')
    pdf = prepare_pdf_fonts(
        pdf,
        config['reporting']['configuration'],
        config['pdf']['language'],
    )
    pdf.set_author(phrases['metadata_author'])
    pdf.set_title(f"{phrases['metadata_title1']} {phrases['metadata_title2']}")
    pdf.set_auto_page_break(False)
    return pdf


def _pdf_insert_cover_page(pdf, pages, phrases):
    pdf.add_page()
    pages = check_and_update_report_title_layout(pages, phrases)
    template = FlexTemplate(pdf, elements=pages['1'])
    _insert_report_image(template, config, phrases, 1)
    template.render()
    return pdf


def _pdf_insert_citation_page(pdf, pages, phrases):
    """Add and render PDF report citation page."""
    pdf.add_page()
    template = FlexTemplate(pdf, elements=pages['2'])
    template['citations'] = phrases['citations']
    template['authors'] = template['authors'].format(**phrases)
    template['edited'] = template['edited'].format(**phrases)
    template['translation'] = template['translation'].format(**phrases)
    # template['author_names'] = phrases['author_names']
    if phrases['translation_names'] in [None, '']:
        template['translation'] = ''
        # template['translation_names'] = ''
    example = False
    date = config['pdf']['policy_review_setting']['Date']
    if str(date) in ['', 'nan', 'NaN', 'None']:
        date = ''
    else:
        date = f' ({date})'
    policy_review_credit = f"""{phrases['Policy review conducted by']}: {config['pdf']['policy_review_setting']['Person(s)']}{date}{['', ' (example only)'][example]}"""
    template['citations'] = phrases['citations'].replace(
        '.org\n\n',
        f'.org\n\n{policy_review_credit}\n\n',
    )
    if config['pdf']['report_template'] == 'policy':
        template['citations'] = (
            '{citation_series}: {study_citations}\n\n{policy_review_credit}'.format(
                policy_review_credit=policy_review_credit,
                **phrases,
            )
        )
    template.render()
    return pdf


def _pdf_insert_introduction_page(pdf, pages, phrases):
    """Add and render PDF report introduction page."""
    pdf.add_page()
    template = FlexTemplate(pdf, elements=pages['3'])
    template['introduction'] = f"{phrases['policy_intro']}".format(
            **phrases,
        )
    template = format_template_context(
        template,
        config,
        config['pdf']['language'],
        phrases,
    )
    if 'hero_image_2' in template:
        _insert_report_image(
            template,
            config,
            phrases,
            2,
            alternate_text='hero_alt',
        )
    template.render()
    return pdf


def _pdf_insert_policy_scoring_page(pdf, pages, phrases):
    """Add and render PDF report integrated city planning policy page."""
    template = FlexTemplate(pdf, elements=pages['4'])
    pdf.add_page()
    if config['pdf']['policy_review'] is not None:
        policy_rating = get_policy_presence_quality_score_dictionary(
            config['policy_review'],
        )
        if policy_rating is not None:
            # Check if both numerators are 0
            if (
                policy_rating['presence']['numerator'] == 0
                and policy_rating['quality']['numerator'] == 0
            ):
                template['presence_rating'] = '-'
                template['quality_rating'] = '-'
            else:
                template['presence_rating'] = template[
                    'presence_rating'
                ].format(
                    presence=round(policy_rating['presence']['numerator'], 1),
                    n=round(policy_rating['presence']['denominator'], 1),
                    percent=_pct(
                        fnum(
                            100
                            * policy_rating['presence']['numerator']
                            / policy_rating['presence']['denominator'],
                            '0.0',
                            config['pdf']['locale'],
                        ),
                        config['pdf']['locale'],
                    ),
                )
                template['quality_rating'] = template['quality_rating'].format(
                    quality=round(policy_rating['quality']['numerator'], 1),
                    n=round(policy_rating['quality']['denominator'], 1),
                    percent=_pct(
                        fnum(
                            100
                            * policy_rating['quality']['numerator']
                            / policy_rating['quality']['denominator'],
                            '0.0',
                            config['pdf']['locale'],
                        ),
                        config['pdf']['locale'],
                    ),
                )
    template.render()
    return pdf

def _pdf_insert_policy_integrated_planning_page(pdf, pages, phrases):
    """Add and render PDF report integrated city planning policy page."""
    # display 25 cities comparison blurb
    template = FlexTemplate(pdf, elements=pages['5'])
    pdf.add_page()
    template.render()
    template = FlexTemplate(pdf, elements=pages['6'])
    pdf.add_page()
    template = format_template_policy_checklist(
        template,
        phrases=phrases,
        policy_review=config['pdf']['policy_review'],
        indicator='Integrated city planning policies for health and sustainability',
        title=False,
    )
    if 'hero_image_2' in template:
        _insert_report_image(
            template,
            config,
            phrases,
            2,
            alternate_text='hero_alt',
        )
    template.render()
    return pdf


def _pdf_insert_accessibility_policy(pdf, pages, phrases):
    """Add and render PDF report accessibility policy page."""
    template = FlexTemplate(pdf, elements=pages['7'])

    pdf.add_page()
    indicator = 'Walkability and destination access policies'
    indicator_index = list(policies['Checklist'].keys()).index(indicator)
    if config['pdf']['policy_review'] is not None:
        template = format_template_policy_checklist(
            template,
            phrases=phrases,
            policy_review=config['pdf']['policy_review'],
            indicator=indicator,
            title=True,
        )
    else:
        template[f'policy_checklist{indicator_index}_title'] = phrases[
            indicator
        ]
    template.render()
    return pdf

def _pdf_insert_transport_policy_page(pdf, pages, phrases):
    """Add and render PDF report thresholds page."""
    template = FlexTemplate(pdf, elements=pages['8'])
    if config['pdf']['policy_review'] is not None:
        template = format_template_policy_checklist(
            template,
            phrases=phrases,
            policy_review=config['pdf']['policy_review'],
            indicator='Public transport policies',
            title=False,
        )
    pdf.add_page()
    template.render()
    return pdf

def _pdf_insert_open_space_policy_page(pdf, pages, phrases):
    """Add and render PDF report thresholds page."""
    template = FlexTemplate(pdf, elements=pages['9'])
    template = format_template_policy_checklist(
        template,
        phrases=phrases,
        policy_review=config['pdf']['policy_review'],
        indicator='Public open space policies',
        title=False,
    )
    pdf.add_page()
    if 'hero_image_3' in template:
        _insert_report_image(template, config, phrases, 3)
    template.render()
    return pdf


def _pdf_insert_nature_based_solutions(pdf, pages, phrases):
    """Add and render PDF report thresholds page."""
    template = FlexTemplate(pdf, elements=pages['10'])
    # Set up last page
    template = format_template_policy_checklist(
        template,
        phrases=phrases,
        policy_review=config['pdf']['policy_review'],
        indicator='Nature-based solutions policies',
        title=False,
    )
    template = format_template_policy_checklist(
        template,
        phrases=phrases,
        policy_review=config['pdf']['policy_review'],
        indicator='Urban air quality policies',
        title=False,
    )
    pdf.add_page()
    template.render()
    return pdf


def _pdf_insert_climate_change_risk_reduction(pdf, pages, phrases):
    """Add and render PDF report thresholds page."""
    template = FlexTemplate(pdf, elements=pages['11'])
    # Set up last page
    if (
        'policy' in config['pdf']['report_template']
        and config['pdf']['policy_review'] is not None
    ):
        template = format_template_policy_checklist(
            template,
            phrases=phrases,
            policy_review=config['pdf']['policy_review'],
            indicator='Climate disaster risk reduction policies',
            title=False,
        )
    pdf.add_page()
    if 'hero_image_4' in template:
        _insert_report_image(template, config, phrases, 4)
    template.render()
    return pdf


def _pdf_insert_back_page(pdf, pages, phrases):
    # Set up last page
    template = FlexTemplate(pdf, elements=pages['12'])
    pdf.add_page()
    template.render()
    return pdf


def _insert_report_image(
    template,
    config,
    phrases,
    number: int,
    alternate_text=None,
):
    image_path = None
    image_filename = phrases[f"Image {number} file"]
    lambda_root = config.get('folder_path')
    
    # Try local bundled assets first (deployed with Lambda)
    local_asset_path = os.path.join(lambda_root, 'configuration', 'assets', image_filename)
    if os.path.exists(local_asset_path):
        image_path = local_asset_path
        print(f"Using local bundled image: {local_asset_path}")
    else:
        # Fall back to S3 download for custom user-uploaded images
        bucket = config.get('bucket')
        if bucket:
            # Try configuration/assets path in S3
            s3_key = f'configuration/assets/{image_filename}'
            tmp_path = f'/tmp/{image_filename}'
            try:
                s3_client.download_file(bucket, s3_key, tmp_path)
                image_path = tmp_path
                print(f"Downloaded image from S3: {s3_key}")
            except Exception as e:
                # Try public path in S3
                try:
                    s3_key = f'public/{image_filename}'
                    s3_client.download_file(bucket, s3_key, tmp_path)
                    image_path = tmp_path
                    print(f"Downloaded image from S3: {s3_key}")
                except Exception as e2:
                    print(f"Could not find image {image_filename}: {e2}")
    
    if (
        image_path
        and os.path.exists(image_path)
        and f'hero_image_{number}' in template
    ):
        template[f'hero_image_{number}'] = image_path
        if alternate_text is None:
            template[f'hero_alt_{number}'] = ''
        else:
            template[alternate_text] = ''
        template[f'Image {number} credit'] = phrases[f'Image {number} credit']


def format_template_policy_checklist(
    template,
    phrases,
    policy_review: dict,
    indicator: str,
    title=False,
):
    """Format report template policy checklist."""
    if policy_review is None:
        print('  No policy review data available. Skipping policy checklist.')
        return template
    policy_checklist_index = list(policy_review.keys()).index(indicator) + 1
    policy_checklist = list(policy_review.keys())[policy_checklist_index - 1]

    if title:
        template[f'policy_checklist{policy_checklist_index}_title'] = phrases[
            policy_checklist
        ]
    template['policy_checklist_header1'] = phrases['Policy identified']
    template['policy_checklist_header2'] = phrases[
        'Aligns with healthy cities principles'
    ]
    template['policy_checklist_header3'] = phrases['Measurable target']
    # template['policy_checklist_header4'] = phrases['Evidence-istnformed threshold']
    for i, policy in enumerate(policy_review[policy_checklist].index):
        row = i + 1
        template[f'policy_checklist{policy_checklist_index}_text{row}'] = (
            phrases[policy]
        )
        for j, item in enumerate(
            [x for x in policy_review[policy_checklist].loc[policy]],
        ):
            col = j + 1
            template[
                f'policy_checklist{policy_checklist_index}_text{row}_response{col}'
            ] = item
    return template


def format_template_context(template, config, language, phrases):
    """Format report template context."""
    context = config['reporting']['languages'][language]['context']
    keys = [
        ''.join(x)
        for x in config['reporting']['languages'][language]['context']
    ]
    context_list = [
        (k, d[k][0]['summary'] if d[k][0]['summary'] is not None else '')
        for k, d in zip(keys, context)
    ]

    def update_value_if_key_in_template(
        key,
        value,
        template,
        phrases,
        skip=False,
    ):
        """Update item tuple if in template."""
        if key in template:
            if skip:
                template[key] = ''
                template[f'{key} blurb'] = ''
                return template
            else:
                template[key] = phrases[key].format(**phrases)
                if value.strip() != '':
                    template[f'{key} blurb'] = value
                else:
                    try:
                        template[f'{key} blurb'] = phrases[
                            f'{key} blurb'
                        ].format(**phrases)
                    except Exception:
                        template[f'{key} blurb'] = ''
                return template
        else:
            return template

    for heading, blurb in context_list:
        if blurb == '' and config['reporting']['publication_ready']:
            skip = True
        else:
            skip = False
        template = update_value_if_key_in_template(
            heading,
            blurb,
            template,
            phrases,
            skip=skip,
        )
        if 'policy' in config['pdf']['report_template']:
            if heading == 'Levels of government':
                # fill in blurb based on policy checklist
                if blurb.strip() in ['', 'None specified']:
                    phrases['policy_checklist_levels'] = ', '.join(
                        get_policy_checklist_item(
                            config['pdf']['policy_review_setting'],
                            phrases,
                            item=heading,
                        ),
                    )
                    if phrases['policy_checklist_levels'] != '':
                        template[f'{heading}'] = phrases[f'{heading}']
                        template[f'{heading} blurb'] = phrases[
                            f'{heading} blurb'
                        ].format(**phrases)
                    else:
                        template = update_value_if_key_in_template(
                            heading,
                            blurb,
                            template,
                            phrases,
                            skip=True,
                        )
            if heading == 'Environmental disaster context':
                hazards = get_policy_checklist_item(
                    config['pdf']['policy_review_setting'],
                    phrases,
                    item=heading,
                )
                if len(hazards) > 1:
                    phrases['policy_checklist_hazards'] = ', '.join(
                        get_policy_checklist_item(
                            config['pdf']['policy_review_setting'],
                            phrases,
                            item=heading,
                        ),
                    )
                    template[f'{heading}'] = phrases[f'{heading}']
                    template[f'{heading} blurb'] = phrases[
                        f'{heading} blurb'
                    ].format(**phrases)
                else:
                    if phrases[f'{heading} blurb'] == '':
                        template[f'{heading}'] = ''
    return template


def _pdf_add_spatial_accessibility_plots(template, config, phrases):
    ## Walkability plot
    if 'all_cities_walkability' in template:
        template['all_cities_walkability'] = (
            f"{config['pdf']['figure_path']}/all_cities_walkability_{config['pdf']['language']}_no_label.jpg"
        )
    if 'walkability_above_median_pct' in template:
        template['walkability_above_median_pct'] = phrases[
            'walkability_above_median_pct'
        ].format(
            percent=_pct(
                fnum(
                    config['pdf']['indicators']['report']['walkability'][
                        'walkability_above_median_pct'
                    ],
                    '0.0',
                    config['pdf']['locale'],
                ),
                config['pdf']['locale'],
            ),
            city_name=phrases['city_name'],
        )
    if 'access_profile' in template:
        # Access profile plot
        template['access_profile'] = (
            f"{config['pdf']['figure_path']}/access_profile_{config['pdf']['language']}.png"
        )
    return template


def _pdf_add_threshold_plots(template, config, phrases):
    for scenario in config['pdf']['indicators']['report']['thresholds']:
        if scenario in template:
            plot = config['pdf']['indicators']['report']['thresholds'][
                scenario
            ]['field']
            template[plot] = (
                f"{config['pdf']['figure_path']}/{plot}_{config['pdf']['language']}_no_label.jpg"
            )
            template[scenario] = phrases[f'optimal_range - {scenario}'].format(
                percent=_pct(
                    fnum(
                        config['pdf']['indicators']['report']['thresholds'][
                            scenario
                        ]['pct'],
                        '0.0',
                        config['pdf']['locale'],
                    ),
                    config['pdf']['locale'],
                ),
                n=fnum(
                    config['pdf']['indicators']['report']['thresholds'][
                        scenario
                    ]['criteria'],
                    '#,000',
                    config['pdf']['locale'],
                ),
                per_unit=phrases['density_units'],
                city_name=phrases['city_name'],
            )
    for percentage in [0, 20, 40, 60, 80, 100]:
        if f'pct_{percentage}' in template:
            template[f'pct_{percentage}'] = _pct(
                fnum(percentage, '0', config['pdf']['locale']),
                config['pdf']['locale'],
            )
    return template


def generate_pdf(
    font,
    report_template,
    language,
    phrases,
    policy_review,
):
    """
    Generate a PDF based on a template for web distribution.

    This template includes reporting on both policy and spatial indicators.
    """

    config['pdf'] = {}
    config['pdf']['font'] = font
    config['pdf']['language'] = language
    config['pdf']['locale'] = phrases['locale']
    config['pdf']['report_template'] = report_template
    config['pdf']['figure_path'] = f"{config['region_dir']}/figures"
    config['pdf']['indicators'] = indicators
    config['pdf']['policy_review'] = policy_review
    config['pdf']['policy_review_setting'] = get_policy_setting(
        config['policy_review'],
    )

    if 'policy' in config['pdf']['report_template']:
        if config['pdf']['policy_review'] is None:
            phrases['disclaimer'] = (
                f"{phrases['disclaimer']} {phrases['policy checklist incomplete warning']}"
            )
            print(
                '\n  No policy review data available.\n  Policy checklists will be incomplete until this has been successfully completed and configured.\n  For more information, see https://github.com/healthysustainablecities/global-indicators/wiki/7.-Advanced-Features#policy-checklist\n',
            )
        phrases['title_series_line2'] = phrases['policy indicators']
    pages = pdf_template_setup(
        config,
        report_template,
        font,
        language,
        phrases,
    )
    pdf = _pdf_initialise_document(phrases, config)
    pdf = _pdf_insert_cover_page(pdf, pages, phrases)
    pdf = _pdf_insert_citation_page(pdf, pages, phrases)
    pdf = _pdf_insert_introduction_page(pdf, pages, phrases)
    pdf = _pdf_insert_policy_scoring_page(pdf, pages, phrases)
    pdf = _pdf_insert_policy_integrated_planning_page(pdf, pages, phrases)
    pdf = _pdf_insert_accessibility_policy(pdf, pages, phrases)
    pdf = _pdf_insert_transport_policy_page(pdf, pages, phrases)
    pdf = _pdf_insert_open_space_policy_page(pdf, pages, phrases)
    pdf = _pdf_insert_nature_based_solutions(pdf, pages, phrases)
    pdf = _pdf_insert_climate_change_risk_reduction(pdf, pages, phrases)
    pdf = _pdf_insert_back_page(pdf, pages, phrases)
    return pdf

