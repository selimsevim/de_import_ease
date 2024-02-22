import xml.etree.ElementTree as ET
import requests
import os
from datetime import datetime,timedelta
from django.core.exceptions import ValidationError
from urllib.parse import urlencode
from django.shortcuts import redirect

class MarketingCloud:

    # Class level variables for constants
    REDIRECT_URI = os.environ.get('HEROKU_DOMAIN', 'default-domain.herokuapp.com')
    scope = 'data_extensions_write'

    _instance = None
    _initialized = False

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(MarketingCloud, cls).__new__(cls)
        return cls._instance

    def __init__(self, client_id, client_secret, base_url):
        if self._initialized:
            return
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = base_url
        self.auth_url = f'https://{base_url}.auth.marketingcloudapis.com/v2/token'
        self.soap_url = f'https://{base_url}.soap.marketingcloudapis.com/Service.asmx'
        self.access_token = None
        self.refresh_token = None
        self.token_expiry_time = None
        self.session = requests.Session()
        self._initialized = True

    def initiate_authorization(self):
        auth_url = f"https://{self.base_url}.auth.marketingcloudapis.com/v2/authorize"
        params = {
            'response_type': 'code',
            'client_id': self.client_id,
            'redirect_uri': f'https://{self.REDIRECT_URI}',
            'scope': self.scope,
            'state': 'active'
        }
        authorization_url = f"{auth_url}?{urlencode(params)}"
        return redirect(authorization_url)


    def process_authorization_code(self, code):

        payload = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": self.client_id,
        "client_secret": self.client_secret,
        "redirect_uri": f'https://{self.REDIRECT_URI}',
        "scope": self.scope
        }


        response = self.session.post(self.auth_url, json=payload)



        if response.status_code == 200:
            token_data = response.json()
            self.access_token = token_data.get('access_token')
            self.refresh_token = token_data.get('refresh_token')

            # Calculate when the token will expire
            expires_in = token_data.get('expires_in', 0)
            self.token_expiry_time = datetime.now() + timedelta(seconds=expires_in - 60)
        else:
            raise ValidationError(f"Token exchange failed with status code: {response.status_code}")
            return None

    def refresh_access_token(self):
        payload = {
        "grant_type": "refresh_token",
        "refresh_token": self.refresh_token,  # Use self.refresh_token
        "client_id": self.client_id,
        "client_secret": self.client_secret
        }
        response = self.session.post(self.auth_url, json=payload)
        if response.status_code == 200:
            token_data = response.json()
            self.access_token = token_data.get('access_token')
            self.refresh_token = token_data.get('refresh_token')  # Use self.refresh_token

            # Calculate new token expiry time
            expires_in = token_data.get('expires_in', 0)
            self.token_expiry_time = datetime.now() + timedelta(seconds=expires_in - 60) 
        else:
            raise Exception(f"Token refresh failed with status code: {response.status_code}")



    def is_token_expired(self):
        print(self.token_expiry_time)
        if not self.token_expiry_time:
            return True
        return datetime.now() > self.token_expiry_time


    def create_soap_request(self, field_mapping, dataextension_properties):
        print(self.token_expiry_time)
        if self.is_token_expired():
            self.refresh_access_token()

        envelope = ET.Element(
            "s:Envelope", 
            {
                "xmlns:s": "http://www.w3.org/2003/05/soap-envelope",
                "xmlns:a": "http://schemas.xmlsoap.org/ws/2004/08/addressing",
                "xmlns:u": "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
            }
        )
        

        name = dataextension_properties['name']
        customerKey = dataextension_properties['customerKey']
        retention_settings = dataextension_properties['dataRetention']

        keys = [
        'DeleteAtEndOfRetentionPeriod', 'RowBasedRetention', 'DataRetentionPeriodLength',
        'DataRetentionPeriod', 'ResetRetentionPeriodOnImport', 'RetainUntil'
        ]


        header = ET.SubElement(envelope, "s:Header")
        ET.SubElement(header, "a:Action", {"s:mustUnderstand":"1"}).text = "Create"
        ET.SubElement(header, "a:To", {"s:mustUnderstand":"1"}).text = self.soap_url
        ET.SubElement(header, "fueloauth", {"xmlns":"http://exacttarget.com"}).text = self.access_token
        body = ET.SubElement(envelope, "s:Body", {"xmlns:xsi":"http://www.w3.org/2001/XMLSchema-instance", "xmlns:xsd":"http://www.w3.org/2001/XMLSchema"})
        create_request = ET.SubElement(body, "CreateRequest", {"xmlns":"http://exacttarget.com/wsdl/partnerAPI"})
        obj = ET.SubElement(create_request, "Objects", {"xsi:type":"DataExtension"})
        client_elem = ET.SubElement(obj, 'Client')
        fields = ET.SubElement(obj, "Fields")
        ET.SubElement(obj, 'Name').text = name
        ET.SubElement(obj, 'CustomerKey').text = customerKey

        for key in keys:
            value = retention_settings.get(key)
            if value is not None:  # Only check for None since False is a valid boolean we want to handle
                if isinstance(value, bool):
                    value = str(value).lower()  # Convert boolean to lowercase string ("true" or "false")
                elif isinstance(value, int):
                    value = str(value)  # Convert integer to string
                ET.SubElement(obj, key).text = value

        
        for field_name, field_info in field_mapping.items():
            field_elem = ET.SubElement(fields, "Field")
            if field_info["type"] == 'Email':
                field_info["type"] = 'EmailAddress'
            ET.SubElement(field_elem, "CustomerKey").text = field_name
            ET.SubElement(field_elem, "Name").text = field_name
            ET.SubElement(field_elem, "FieldType").text = field_info["type"]
            ET.SubElement(field_elem, "IsRequired").text = field_info["required"]
            ET.SubElement(field_elem, "IsPrimaryKey").text = field_info["primary"]
            if field_info["length"]:
                if field_info["type"] == 'Decimal':
                    # Split the length for Decimal type to extract Precision and Scale
                    precision, scale = field_info["length"].split('.')
                    ET.SubElement(field_elem, "Precision").text = precision
                    ET.SubElement(field_elem, "Scale").text = scale
                else:
                    # For other types, use MaxLength
                    ET.SubElement(field_elem, "MaxLength").text = field_info["length"]


        
        tree = ET.ElementTree(envelope)
        xml_str = ET.tostring(tree.getroot(), encoding="utf-8").decode("utf-8")
        headers = {
            "Content-Type": "application/soap+xml; charset=utf-8",
            # Add any other necessary headers
        }

        response = requests.post(self.soap_url, data=xml_str, headers=headers)
        if response.status_code == 401:  # Token likely expired
            self.refresh_access_token()
            response = requests.post(self.soap_url, data=xml_str, headers=headers)
        return response

client_id = os.environ.get('client_id')
client_secret = os.environ.get('client_secret')
base_url = os.environ.get('base_url')

mc = MarketingCloud(client_id, client_secret, base_url)