from django.urls import path

from apps.tenancy.api.views import (
    CurrentOrganizationView,
    TenantDetailView,
    TenantListCreateView,
    TenantSettingsView,
)
from apps.authentication.api.views import TenantSlugCheckView

urlpatterns = [
    path("tenants/check-slug", TenantSlugCheckView.as_view(), name="tenant-check-slug"),
    path("tenants", TenantListCreateView.as_view(), name="tenant-list-create"),
    path("tenants/<uuid:tenant_id>", TenantDetailView.as_view(), name="tenant-detail"),
    path("organizations/me", CurrentOrganizationView.as_view(), name="organization-me"),
    path("tenant/settings", TenantSettingsView.as_view(), name="tenant-settings"),
]
