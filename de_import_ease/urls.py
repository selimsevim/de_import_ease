from django.urls import path
from .views import home, save_field_data, initiate_authorization_view
from . import views

urlpatterns = [
    path('', home, name='home'),  # Configure the home page URL
    path('initiate-authorization/', initiate_authorization_view, name='initiate_authorization'),
    path('save_field_data/', save_field_data, name='save_field_data'),
]