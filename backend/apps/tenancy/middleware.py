from __future__ import annotations

from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from apps.tenancy.repositories import TenantRepository
from apps.tenancy.services.context import TenantContextService
from apps.tenancy.services.resolution import TenantResolutionService


class TenantResolutionMiddleware:
    """Resolve and attach tenant context for API, admin, and future product requests."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response
        self.repository = TenantRepository()
        self.resolver = TenantResolutionService(repository=self.repository)
        self.context_service = TenantContextService()

    def __call__(self, request: HttpRequest) -> HttpResponse:
        result = self.resolver.resolve(request)
        organization = (
            self.repository.default_organization(result.tenant) if result.tenant else None
        )
        request.tenant_resolution_source = result.source
        request.tenant_slug = result.tenant.slug if result.tenant else None
        self.context_service.set_context(
            request=request,
            tenant=result.tenant,
            organization=organization,
        )
        return self.get_response(request)
