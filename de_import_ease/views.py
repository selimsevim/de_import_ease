from django.http import JsonResponse
from django.shortcuts import redirect, render
from .forms import CSVUploadForm
from .sfmc_calls import mc as mc_instance
from .file_reading import infer_csv_fields, handle_uploaded_file
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.core.exceptions import ValidationError
from datetime import datetime
import xml.etree.ElementTree as ET
from io import StringIO
import traceback
import os
import numpy as np



@csrf_protect
def home(request):

    def handle_post_request():
        uploaded_file = request.FILES.get('file')
        
        # Check file size
        if uploaded_file and uploaded_file.size > 20 * 1024 * 1024:  # 20MB
            return {
                'status': 'error',
                'message': "Uploaded file is too large. Max allowed size is 20MB."
            }
        
        # Check file extension
        ext = os.path.splitext(uploaded_file.name)[1] if uploaded_file else ''
        if ext.lower() not in ['.txt', '.csv']:
            return {
                'status': 'error',
                'message': f"Invalid file type. Only .txt, .csv are allowed."
            }

        form = CSVUploadForm(request.POST, request.FILES)
        if form.is_valid():
            csv_file = request.FILES['file']
            try:
                tmp_file_path = handle_uploaded_file(csv_file)
                field_types, anomalies_report, field_lengths = infer_csv_fields(tmp_file_path)
                return {
                    'status': 'success',
                    'field_types': field_types,
                    'anomalies_report': anomalies_report,
                    'field_lengths': field_lengths,
                }

            except ValidationError as e:
                return {
                    'status': 'error',
                    'message': e.messages[0] if e.messages else "Unknown error"
                }
            except Exception as e:
                last_trace = traceback.extract_tb(e.__traceback__)[-1]
                exc_type = type(e).__name__
                filename = last_trace.filename
                lineno = last_trace.lineno
                func_name = last_trace.name
                exc_value = str(e)
                return {
                    'status': 'error',
                    'message': f"Error processing the file: {str(e)} (exc_type: {exc_type}, filename: {filename}, line: {lineno}, func_name: {func_name})"
                }
        else:
            return {
                'status': 'error',
                'message': "Form is not valid. Please check the file and try again."
            }

    context = {
        'form': CSVUploadForm(),
    }

    if request.method == 'POST' and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        response_data = handle_post_request()
        response_data = numpy_int64_to_standard_int(response_data)
        return JsonResponse(response_data)


    # For GET request or non-Ajax POST
    return render(request, 'home.html', context)



def numpy_int64_to_standard_int(data):
    if isinstance(data, dict):
        return {key: numpy_int64_to_standard_int(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [numpy_int64_to_standard_int(value) for value in data]
    elif isinstance(data, tuple):
        return tuple(numpy_int64_to_standard_int(value) for value in data)
    elif isinstance(data, np.int64):
        return int(data)
    else:
        return data



@csrf_protect
def initiate_authorization_view(request):
    return mc_instance.initiate_authorization()

@csrf_protect
def save_field_data(request):
    message = ""
    field_mapping = {}
    dataextension_properties = {}
    data_retention = {}
    
    if request.method == "POST":
        # Filter out the csrf token and separate out name and customerKey
        data = {k: v for k, v in request.POST.items() if k != "csrfmiddlewaretoken"}
        name, customerKey = data.pop('name', None), data.pop('customerKey', None)

        # Extract field names and types based on the format "field_name_x" and "field_type_x"
        for key in list(data.keys()):  # Use list() to ensure you're not modifying the dict while iterating
            if "field_name_" in key:
                index = key.split("_")[-1]  # Get the index from the end of the string
                field_name = data.pop(f"field_name_{index}")  # Get and remove the field name from the data dict
                field_type = data.pop(f"field_type_{index}", "Text")  # Similarly, get and remove the field type
                field_length = data.get(f"field_lengths_{index}", "") 
                field_required = "true" if f"field_required_{index}" in data else "false"
                field_primary = "true" if f"field_primary_{index}" in data else "false"

                data.pop(f"field_required_{index}", None)
                data.pop(f"field_primary_{index}", None)

                if field_type == 'Decimal' and (f"field_lengths_{index}_integer" in data or f"field_lengths_{index}_decimal" in data):
                    integer_part = data.get(f"field_lengths_{index}_integer", "0")
                    decimal_part = data.get(f"field_lengths_{index}_decimal", "0")
                    field_length = f"{integer_part}.{decimal_part}"

                if field_primary == "true":
                    field_required = "true"

                field_mapping[field_name] = {
                    "type": field_type,
                    "length": field_length,
                    "required": field_required,
                    "primary": field_primary
                }
        # Process Data Retention variables
        data_retention_strategy = data.get("dataRetentionStrategy")
        
        if data_retention_strategy == "individual":
            data_retention["RowBasedRetention"] = True
        elif data_retention_strategy in ["allDataExtensions", "allRecords"]:
            data_retention["RowBasedRetention"] = False
            if data_retention_strategy == "allRecords":
                data_retention["DeleteAtEndOfRetentionPeriod"] = True
        
        if data.get("retentionPeriod") == "afterPeriod":
            period_length = data.get("periodLength")
            data_retention["DataRetentionPeriodLength"] = int(period_length) if period_length else None
            data_retention["DataRetentionPeriod"] = data.get("periodUnit")
            data_retention["ResetRetentionPeriodOnImport"] = "resetOnImport" in data
        
        elif data.get("retentionPeriod") == "specificDate":
            date_format = "%Y-%m-%d"
            selected_date = datetime.strptime(data.get("retentionDate"), date_format)
            formatted_date = selected_date.strftime('%m/%d/%Y')
            data_retention["RetainUntil"] = formatted_date
        
        dataextension_properties = {
            "name": name,
            "customerKey": customerKey,
            "dataRetention": data_retention
        }

        response = mc_instance.create_soap_request(field_mapping, dataextension_properties)

        if response.status_code == 200:
            root = ET.fromstring(response.text)

            # Extract namespaces from the XML
            namespaces = dict([node for _, node in ET.iterparse(StringIO(response.text), events=['start-ns'])])

            # Map the default namespace to a prefix for easier querying
            if '' in namespaces:
                namespaces['et'] = namespaces['']
                del namespaces['']

            status_code_elem = root.find('.//et:StatusCode', namespaces=namespaces)
            status_message_elem = root.find('.//et:StatusMessage', namespaces=namespaces)

            # Check if the elements exist before accessing .text attribute
            status_code = status_code_elem.text if status_code_elem is not None else None
            status_message = status_message_elem.text if status_message_elem is not None else None

            if status_code == "OK" and status_message == "Data Extension created.":
                return JsonResponse({
                    "status": "success",
                    "message": "The data extension has been created in your Data Extensions folder."
                })
            elif status_code == "Error":
                return JsonResponse({
                    "status": "error",
                    "message": status_message
                })
        else:
            return JsonResponse({
                "status": "error",
                "message": "Failed to process the request due to an internal error."
            })

    return JsonResponse({
        "status": "error",
        "message": "Invalid request method."
    })
