from __future__ import annotations

import logging
from dataclasses import dataclass

from django.http import HttpRequest
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.tenancy.models import Tenant
from apps.tenancy.repositories import TenantRepository

logger = logging.getLogger("ie_platform.tenancy")


@dataclass(frozen=True)
class TenantResolutionResult:
    tenant: Tenant | None
    source: str | None


class TenantResolutionService:
    tenant_id_header = "HTTP_X_TENANT_ID"
    tenant_slug_header = "HTTP_X_TENANT_SLUG"

    def __init__(self, repository: TenantRepository | None = None) -> None:
        self.repository = repository or TenantRepository()

    def resolve(self, request: HttpRequest) -> TenantResolutionResult:
        header_value = self._header_identifier(request)
        if header_value:
            tenant = self.repository.get_by_identifier(header_value)
            if tenant:
                return TenantResolutionResult(tenant=tenant, source="header")

        tenant = self._resolve_custom_domain(request)
        if tenant:
            return TenantResolutionResult(tenant=tenant, source="custom_domain")

        tenant = self._resolve_subdomain(request)
        if tenant:
            return TenantResolutionResult(tenant=tenant, source="subdomain")

        user = self._authenticated_user(request)
        tenant = self.repository.get_authenticated_tenant(user)
        if tenant:
            return TenantResolutionResult(tenant=tenant, source="authenticated_user")

        return TenantResolutionResult(tenant=None, source=None)

    def _header_identifier(self, request: HttpRequest) -> str | None:
        value = request.META.get(self.tenant_id_header) or request.META.get(self.tenant_slug_header)
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
        return None

    def _resolve_custom_domain(self, request: HttpRequest) -> Tenant | None:
        host = request.get_host().split(":")[0].lower()
        tenant = self.repository.get_by_domain(host)
        if tenant:
            logger.debug("Resolved tenant from custom domain", extra={"host": host})
        return tenant

    def _resolve_subdomain(self, request: HttpRequest) -> Tenant | None:
        host = request.get_host().split(":")[0].lower()
        labels = host.split(".")
        if len(labels) < 3 or labels[0] in {"www", "api"}:
            return None
        return self.repository.get_by_identifier(labels[0])

    def _authenticated_user(self, request: HttpRequest) -> object | None:
        user = getattr(request, "user", None)
        if getattr(user, "is_authenticated", False):
            return user
        try:
            authenticated = JWTAuthentication().authenticate(request)
        except Exception:
            logger.debug("JWT tenant fallback authentication failed", exc_info=True)
            return user
        if not authenticated:
            return user
        request.user = authenticated[0]
        return authenticated[0]
