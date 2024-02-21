from django.shortcuts import redirect, render
from django.urls import reverse
from django.http import HttpResponseForbidden
from django.conf import settings
from urllib.parse import urlparse
from .sfmc_calls import mc as mc_instance
import os  

class AuthorizationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Extract the values we're interested in from request.GET
        tssd = request.GET.get('tssd', None)
        code = request.GET.get('code', None)
        referer = request.headers.get('Referer', '')

        # First, get the response from the view
        response = self.get_response(request)
        response.headers.pop('Server', None)

        # If the response has a context_data attribute, just return it
        if request.method == 'POST' and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return response

        # Check for direct access to homepage
        if request.path == '/':  
            if code:
                request.session['authenticated'] = True
                mc_instance.process_authorization_code(code)
                return redirect(reverse('home'))
            elif request.session.get('authenticated') == False or request.session.get('authenticated') is None:
                return HttpResponseForbidden('Can be only accessed via SFMC!')

                

        # Check for access to /initiate-authorization via SFMC
        if request.path == '/initiate-authorization/':
            if not ('exacttarget' in referer):
                request.session['authenticated'] = False
            else:
                request.session['authenticated'] = True
 
            
        return response


