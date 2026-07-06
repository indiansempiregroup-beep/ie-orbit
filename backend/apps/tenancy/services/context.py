from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from django.http import HttpRequest

from apps.tenancy.models import Organization, Tenant


@dataclass(frozen=True)
class TenantContext:
    tenant: Tenant | None
    organization: Organization | None
    user: Any


_current_context: ContextVar[TenantContext | None] = ContextVar(
    "current_tenant_context",
    default=None,
)


class TenantContextService:
    def set_context(
        self,
        *,
        request: HttpRequest,
        tenant: Tenant | None,
        organization: Organization | None,
    ) -> TenantContext:
        context = TenantContext(
            tenant=tenant,
            organization=organization,
            user=getattr(request, "user", None),
        )
        request.current_tenant = tenant
        request.tenant = tenant
        request.current_organization = organization
        request.organization = organization
        request.current_user = context.user
        _current_context.set(context)
        return context

    def get_context(self) -> TenantContext | None:
        return _current_context.get()

    def get_tenant(self) -> Tenant | None:
        context = self.get_context()
        return context.tenant if context else None

    def get_organization(self) -> Organization | None:
        context = self.get_context()
        return context.organization if context else None

    def get_user(self) -> Any:
        context = self.get_context()
        return context.user if context else None


def current_tenant() -> Tenant | None:
    return TenantContextService().get_tenant()


def current_organization() -> Organization | None:
    return TenantContextService().get_organization()


def current_user() -> Any:
    return TenantContextService().get_user()
