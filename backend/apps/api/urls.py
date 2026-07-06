from django.urls import include, path

from apps.api.views import HealthView, OperationsSearchView

urlpatterns = [
    path("auth/", include("apps.authentication.urls")),
    path("", include("apps.tenancy.urls")),
    path("", include("apps.businesses.urls")),
    path("", include("apps.platform_media.urls")),
    path("", include("apps.customers.urls")),
    path("", include("apps.services.urls")),
    path("", include("apps.staff.urls")),
    path("", include("apps.bookings.urls")),
    path("", include("apps.notifications.urls")),
    path("", include("apps.calendar.urls")),
    path("", include("apps.analytics.urls")),
    path("search", OperationsSearchView.as_view(), name="operations-search"),
    path("health/", HealthView.as_view(), name="health"),
    path("liveness/", HealthView.as_view(), name="liveness"),
    path("readiness/", HealthView.as_view(), name="readiness"),
]
