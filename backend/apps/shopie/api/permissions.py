from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


class ShopAccessPermission(BasePermission):
    message = "ShopIE access requires an authenticated workspace user."
    read_permissions = {
        "business:read",
        "business:write",
        "business:manage",
        "booking:read",
        "booking:write",
        "service:read",
        "service:write",
    }
    write_permissions = {
        "business:write",
        "business:manage",
        "booking:write",
        "booking:manage",
        "service:write",
        "service:manage",
    }

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        if not getattr(request, "current_tenant", None):
            return False
        if request.method in SAFE_METHODS:
            return True
        if getattr(request.user, "is_superuser", False):
            return True
        if request.current_tenant.owner_id == request.user.id:
            return True
        return request.user.user_roles.filter(
            role__is_active=True,
            role__role_permissions__permission__code__in=self.write_permissions,
            role__role_permissions__permission__is_active=True,
            role__tenant=request.current_tenant,
        ).exists()
