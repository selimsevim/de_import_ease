import pandas as pd
import re
import tempfile
import chardet
import os
from django.core.exceptions import ValidationError
from dateutil import parser
from chardet.universaldetector import UniversalDetector
import string

def read_file_into_memory(csv_path):
    with open(csv_path, 'rb') as file:
        file_content = file.readlines()
    return file_content


def detect_file_encoding_from_content(file_content):
    detector = UniversalDetector()
    for line in file_content:
        detector.feed(line)
        if detector.done:
            break
    detector.close()
    return detector.result

def handle_uploaded_file(file):

    MAX_FILE_SIZE = 2 * 1024 * 1024  
    ALLOWED_EXTENSIONS = ['.txt', '.csv']

    # Check file extension
    ext = os.path.splitext(file.name)[1]
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise ValidationError(f"Invalid file type. Only {', '.join(ALLOWED_EXTENSIONS)} are allowed.")

    # Check file size
    if file.size > MAX_FILE_SIZE:
        raise ValidationError("Uploaded file is too large. Max allowed size is 2MB.")

    # Verify the file's content
    file_content = file.read()
    file.seek(0)  # Reset file pointer to start

    # Heuristic: Check for NULL bytes
    if b'\0' in file_content:
        raise ValidationError("The file content contains NULL bytes and doesn't seem to be a valid CSV or TXT file.")

    # Save the file
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        for chunk in file.chunks():
            tmp.write(chunk)
        tmp.flush()

    return tmp.name  # Return the temporary file path


def is_valid_date(x):
    try:
        parsed_date = parser.parse(x)
        
        # Check if the parsed date contains a year, month, and day
        if parsed_date.year and parsed_date.month and parsed_date.day:
            
            # Additional check to see if the string actually looks like a date
            if any(char in x for char in ['-', '/', ' ', ':']):
                return True
                
    except:
        pass
        
    return False

def check_threshold(series, func, threshold=0.9):
    return (series.apply(func).mean() >= threshold)


def detect_delimiter(file_content, encoding='utf-8'):

    first_line = file_content[0].decode(encoding)
        
    delimiters = [',', ';', '\t']
    for delimiter in delimiters:
        if delimiter in first_line:
            return delimiter
    return None  # If no known delimiter found

def check_mismatched_quotes(file_content):
    mismatched_quote_rows = []
    for idx, line in enumerate(file_content, start=1):  # Starting from 1 for row number in CSV
        if line.count(b'"') % 2 != 0:  # Odd number of quotes
            mismatched_quote_rows.append(idx)
    return mismatched_quote_rows

def check_empty_rows(df):
    """Check for row(s) where all columns are empty."""
    empty_rows = df[df.isnull().all(axis=1)]
    return list(empty_rows.index + 1)  # Adding 1 to get the actual row number in CSV

def check_duplicate_rows(df):
    """Check for duplicate row(s) in the DataFrame."""
    duplicate_rows = df[df.duplicated(keep='first')]
    return list(duplicate_rows.index + 1)  # Adding 1 to get the actual row number in CSV

def check_problematic_chars(df):
    """Check for row(s) with problematic characters."""
    problematic_rows = []
    for idx, row in df.iterrows():
        if any('�' in str(cell) for cell in row):
            problematic_rows.append(idx + 1)  # Adding 1 to get the actual row number in CSV
    return problematic_rows

def infer_datatype(series, column_name=""):
    num_of_values = len(series)
    
    empty_count = series.isna().sum()  # Count NaN values
    series = series.dropna()  # Remove NaNs for better type inference


    str_series = series.astype(str).str.strip()

    # If all values are empty in a field, it is Text
    if empty_count == num_of_values or all(series.astype(str).str.strip() == ""):
        return "Text"


    # ID Check
    if "ID" in column_name.upper():
        if series.astype(str).str.isnumeric().all():
            return "Number"

    # Decimal Check
    if any(str_series.apply(lambda x: bool(re.compile(r"^\d+\.\d+$").match(x)))):
        return "Decimal"

    # Number Check
    elif all(str_series.apply(lambda x: bool(re.compile(r"^\d+$").match(x)))) and not any(str_series == ""):
        return "Number"


    # Email Check
    email_pattern = re.compile(r"(^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$)")
    if check_threshold(series.astype(str), lambda x: bool(email_pattern.match(x))):
        return "Email"
    
    # Date Check
    if check_threshold(series.astype(str), is_valid_date):
        return "Date"
    
    # Boolean Check
    normalized_series = series.astype(str).str.strip().str.lower()
    bool_pattern = {"yes", "no", "1", "y", "true", "0", "n", "false"}
    unique_values = set(normalized_series.unique())
    
    if unique_values.issubset(bool_pattern):
        return "Boolean"
    
    # Locale Check
    locale_pattern = re.compile(r'^[a-zA-Z]{2}-[a-zA-Z]{2}$')
    if check_threshold(series.astype(str), lambda x: bool(locale_pattern.match(x))):
        return "Locale"

    # Phone Field Checks
    phone_pattern = re.compile(r'^\+?1?[-\s\.]?\(?\d{3}\)?[-\s\.]?\d{3}[-\s\.]?\d{4}$')
    if check_threshold(series, lambda x: bool(phone_pattern.match(x.strip()))):
        return "Phone"

    # Default to Text
    return "Text"

def validate_csv_structure_from_content(file_content, delimiter, encoding, anomalies_report):
    
    mismatch_detected = False
    mismatch_with_quotes_detected = False
    anomalies_report = {}


    if delimiter == ",":
        delimiter_display = "Comma"
    elif delimiter == "\t":
        delimiter_display = "Tab"
    else:
        delimiter_display = delimiter

    anomalies_report["Delimiter"] = [{
        "Issue": f"Your delimiter is '{delimiter_display}'. Please select it while importing the file.",
        "examples": []
    }]

    detector_result = detect_file_encoding_from_content(file_content)
    encoding = detector_result['encoding']

    # Split the header using the detected delimiter
    header_tokens = file_content[0].decode(encoding).strip().split(delimiter)
    header_field_count = len(header_tokens)

    # Rule 1: Check if headers have quotes
    header_has_quotes = any('"' in token for token in header_tokens)
    if header_has_quotes:
        anomalies_report["Header Quotes"] = [{
        "Issue": "The field names (headers) in the CSV file contain quotes. This might create mismatched field counts and be misleading for SFMC data processing.",
        "examples": []
        }]

    for idx, line in enumerate(file_content, start=2):  # Start from 2 because of the header
        line_decoded = line.decode(encoding).strip()
        tokens = line_decoded.split(delimiter)
        tokens_with_quotes = re.split(delimiter + '(?=(?:[^"]*"[^"]*")*[^"]*$)', line_decoded)

        if len(tokens) != header_field_count:
            mismatch_detected = True
        if len(tokens_with_quotes) != header_field_count:
            mismatch_with_quotes_detected = True

        if mismatch_detected and mismatch_with_quotes_detected:
            break

    if detector_result['encoding'] != 'utf-8':
        utf8_check = 0
    else: 
        utf8_check = 1

    return utf8_check, mismatch_with_quotes_detected, mismatch_detected, header_has_quotes, anomalies_report
            

def anomalies(series, pattern):
    """Return entries that don't match the given pattern."""
    mask = series.dropna().astype(str).apply(lambda x: not bool(pattern.match(x)))
    return series[series.index.isin(mask.index[mask])]


def sanitize_csv_cell(cell):
    if isinstance(cell, str) and cell.startswith(('=', '+', '-', '@')):
        return "'" + cell
    return cell

def infer_csv_fields(csv_path):

    file_content = read_file_into_memory(csv_path)
    delimiter = detect_delimiter(file_content)
    encoding_result = detect_file_encoding_from_content(file_content)
    encoding = encoding_result['encoding']

    if delimiter is None:
        raise ValidationError("Delimiter could not be detected.")
        return

    anomalies_report = {}
    field_types = {}

    utf8_check, mismatch_with_quotes_detected, mismatch_detected, header_has_quotes, anomalies_report = validate_csv_structure_from_content(file_content, delimiter, encoding, anomalies_report)

    df = pd.read_csv(csv_path, delimiter=delimiter, encoding=encoding, dtype=str, on_bad_lines='skip', converters={col: sanitize_csv_cell for col in range(256)})


    if not all(any(c.isalpha() for c in field_name) for field_name in df.columns):
        raise ValidationError("CSV is missing headers or has invalid headers.")

    if not header_has_quotes:  # Only run this if the header doesn't contain quotes
        mismatched_quote_detected = check_mismatched_quotes(file_content)
        if mismatched_quote_detected:
            anomalies_report["Mismatched Quotes"] = [{
                "Issue": "There are mismatched quotes which might create issues while uploading the file.",
                "examples": []
            }]

    if not utf8_check:
        anomalies_report["UTF-8 Check"] = [{
            "Issue": f"Your file format is not UTF-8. That might create some issues while importing the file.",
            "examples": []
        }]

    # Rule 2: Report if there are row(s) with mismatched quotes
    if mismatch_with_quotes_detected:
        anomalies_report["Mismatched row(s) With Quotes"] = [{
            "Issue": "It seems some rows have mismatched quotes. If you select 'Respect double quotes as a text qualifier', those rows might be skipped.",
            "examples": []
        }]

    # Rule 3: Report if there are row(s) with mismatched number of fields
    if mismatch_detected:
        anomalies_report["Mismatched row(s)"] = [{
            "Issue": "It seems your file doesn't follow the same field count in each row. Choosing 'Respect double quotes as a text qualifier' option while importing, changing the delimiter or making your file format UTF-8 might fix this if you have any issues while importing it.",
            "examples": []
        }]



    # Remove quotes from the column headers
    df.columns = [col.replace('"', '').strip() for col in df.columns]

    for column in df.columns:
        series = df[column]
        expected_type = infer_datatype(series, column)
        field_types[column] = expected_type


    # To handle the field length logic:
    field_lengths = {}
    for column, datatype in field_types.items():
        if datatype == "Text":
            max_length = df[column].astype(str).apply(len).max()
            rounded_length = get_rounded_length(max_length)
            field_lengths[column] = rounded_length
        elif datatype == "Decimal":
            precision, scale = calculate_decimal_field_length(df[column])
            field_lengths[column] = (precision, scale)

    return field_types, anomalies_report, field_lengths



def get_rounded_length(length):

    def round_up(num, n):
        return ((num + n - 1) // n) * n

    if length < 1000:
        return round_up(length + 50, 100)
    elif length < 4000 - 500:  # subtract 500 to ensure we can add the buffer
        return round_up(length + 500, 1000)
    else:
        return ""

def calculate_decimal_field_length(series):

    max_length_before_decimal = series.dropna().apply(lambda x: len(str(x).split('.')[0])).max()
    max_length_after_decimal = series.dropna().apply(lambda x: len(str(x).split('.')[1]) if '.' in str(x) else 0).max()
    precision = max_length_before_decimal + max_length_after_decimal
    scale = max_length_after_decimal

    return precision, scale
