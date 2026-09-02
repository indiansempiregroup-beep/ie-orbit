from django.urls import include, path

from apps.api.views import HealthView, OperationsSearchView
from apps.common.api.contact_views import ContactFormView
from apps.common.api.places_views import (
    PlacesAutocompleteView,
    PlacesDetailsView,
    ReverseGeocodeView,
)

urlpatterns = [
    path("contact", ContactFormView.as_view(), name="contact-form"),
    path("places/autocomplete", PlacesAutocompleteView.as_view(), name="places-autocomplete"),
    path("places/details", PlacesDetailsView.as_view(), name="places-details"),
    path("places/reverse", ReverseGeocodeView.as_view(), name="places-reverse"),
    path("", include("apps.api.mobile_urls")),
    path("auth/", include("apps.authentication.urls")),
    path("", include("apps.tenancy.urls")),
    path("", include("apps.businesses.urls")),
    path("", include("apps.platform_media.urls")),
    path("", include("apps.customers.urls")),
    path("", include("apps.services.urls")),
    path("", include("apps.staff.urls")),
    path("", include("apps.bookings.urls")),
    path("", include("apps.shopie.urls")),
    path("", include("apps.notifications.urls")),
    path("", include("apps.calendar.urls")),
    path("", include("apps.analytics.urls")),
    path("", include("apps.billing.urls")),
    path("", include("apps.platform_admin.urls")),
    path("search", OperationsSearchView.as_view(), name="operations-search"),
    path("health/", HealthView.as_view(), name="health"),
    path("liveness/", HealthView.as_view(), name="liveness"),
    path("readiness/", HealthView.as_view(), name="readiness"),
]
