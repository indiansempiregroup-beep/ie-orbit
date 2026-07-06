from __future__ import annotations

from typing import Any
from uuid import UUID

from django.db import connection
from django.db.models import QuerySet

from apps.tenancy.models import (
    Branding,
    Organization,
    OrganizationSettings,
    Subscription,
    Tenant,
    TenantSettings,
)


class TenantRepository:
    def list_for_user(self, user: Any) -> QuerySet[Tenant]:
        if getattr(user, "is_superuser", False):
            return Tenant.objects.all()
        return Tenant.objects.filter(owner=user)

    def get_for_user(self, *, tenant_id: UUID | str, user: Any) -> Tenant:
        return self.list_for_user(user).get(id=tenant_id)

    def get_by_identifier(self, identifier: str) -> Tenant | None:
        lookup = {"id": identifier} if _looks_like_uuid(identifier) else {"slug": identifier}
        return Tenant.objects.filter(**lookup).first()

    def get_by_domain(self, domain: str) -> Tenant | None:
        if connection.features.supports_json_field_contains:
            return Tenant.objects.filter(brand_settings__custom_domains__contains=[domain]).first()
        for tenant in Tenant.objects.exclude(brand_settings={}):
            domains = tenant.brand_settings.get("custom_domains", [])
            if domain in domains:
                return tenant
        return None

    def get_authenticated_tenant(self, user: Any) -> Tenant | None:
        if not user or not getattr(user, "is_authenticated", False):
            return None
        return self.list_for_user(user).order_by("created_at").first()

    def default_organization(self, tenant: Tenant) -> Organization | None:
        return Organization.objects.for_tenant(tenant).first()

    def tenant_settings(self, tenant: Tenant) -> TenantSettings:
        settings, _ = TenantSettings.objects.get_or_create(
            tenant=tenant,
            defaults={
                "timezone": tenant.timezone,
                "currency": tenant.currency,
                "language": tenant.language,
            },
        )
        return settings

    def organization_settings(self, organization: Organization) -> OrganizationSettings:
        settings, _ = OrganizationSettings.objects.get_or_create(
            tenant=organization.tenant,
            organization=organization,
            defaults={
                "timezone": organization.tenant.timezone,
                "currency": organization.tenant.currency,
                "language": organization.tenant.language,
            },
        )
        return settings

    def ensure_foundation_records(self, tenant: Tenant) -> None:
        Organization.objects.get_or_create(
            tenant=tenant,
            defaults={
                "name": tenant.display_name,
                "legal_name": tenant.legal_name,
                "city": tenant.city,
                "state": tenant.state,
                "country": tenant.country,
            },
        )
        Branding.objects.get_or_create(
            tenant=tenant,
            defaults={
                "app_name": tenant.display_name,
                "logo": tenant.logo,
                "favicon": tenant.favicon,
                "primary_color": tenant.primary_color,
                "secondary_color": tenant.secondary_color,
            },
        )
        Subscription.objects.get_or_create(tenant=tenant)
        self.tenant_settings(tenant)


def _looks_like_uuid(value: str) -> bool:
    try:
        UUID(str(value))
    except (TypeError, ValueError):
        return False
    return True
