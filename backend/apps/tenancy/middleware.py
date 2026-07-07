from __future__ import annotations

from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from apps.businesses.repositories import BusinessRepository
from apps.common.utils.request_auth import resolve_authenticated_user
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


class BusinessResolutionMiddleware:
    """Attach active business from X-Business-ID header or tenant default."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response
        self.repository = BusinessRepository()

    def __call__(self, request: HttpRequest) -> HttpResponse:
        tenant = getattr(request, "current_tenant", None)
        business = None

        if tenant is not None:
            user = resolve_authenticated_user(request)
            if user is not None:
                business_id = request.headers.get("X-Business-ID") or request.META.get(
                    "HTTP_X_BUSINESS_ID"
                )
                if business_id:
                    try:
                        business = self.repository.get_for_request(
                            business_id=str(business_id),
                            tenant=tenant,
                            user=user,
                        )
                    except Exception:
                        business = None
                if business is None:
                    business = self.repository.default_for_request(tenant=tenant, user=user)

        request.current_business = business
        return self.get_response(request)
