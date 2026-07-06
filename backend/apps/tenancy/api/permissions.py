from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.tenancy.models import Tenant


class IsTenantOwnerOrPlatformAdmin(BasePermission):
    message = "Tenant owner or platform administrator access is required."

    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request: Request, view: APIView, obj: object) -> bool:
        if getattr(request.user, "is_superuser", False):
            return True
        tenant = obj if isinstance(obj, Tenant) else getattr(obj, "tenant", None)
        return bool(tenant and tenant.owner_id == request.user.id)


class HasTenantContext(BasePermission):
    message = "A tenant context is required."

    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(getattr(request, "current_tenant", None))
