from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


class MediaAccessPermission(BasePermission):
    message = "Media access requires business owner, platform admin, manager, or authorized staff."
    read_permissions = {"media:read", "media:write", "media:manage"}
    write_permissions = {"media:write", "media:manage"}

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        if not getattr(request, "current_tenant", None):
            return False
        if request.method in SAFE_METHODS:
            return True
        if getattr(request.user, "is_superuser", False):
            return True
        tenant = request.current_tenant
        if tenant.owner_id == request.user.id:
            return True
        return self._has_permission(request, self.write_permissions)

    def has_object_permission(self, request: Request, view: APIView, obj: object) -> bool:
        if request.method == "DELETE":
            return self._can_delete(request, obj)
        if request.method in SAFE_METHODS:
            return True
        if getattr(request.user, "is_superuser", False):
            return True
        tenant = getattr(obj, "tenant", None)
        if tenant and tenant.owner_id == request.user.id:
            return True
        return self._has_permission(request, self.write_permissions)

    def _can_delete(self, request: Request, obj: object) -> bool:
        if getattr(request.user, "is_superuser", False):
            return True
        tenant = getattr(obj, "tenant", None)
        return bool(tenant and tenant.owner_id == request.user.id)

    def _has_permission(self, request: Request, codes: set[str]) -> bool:
        return request.user.user_roles.filter(
            role__is_active=True,
            role__role_permissions__permission__code__in=codes,
            role__role_permissions__permission__is_active=True,
        ).exists()
