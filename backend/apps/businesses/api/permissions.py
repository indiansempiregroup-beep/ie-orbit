from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


class BusinessAccessPermission(BasePermission):
    message = "Business owner, platform administrator, or authorized manager access is required."
    manager_permissions = {"business:write", "business:update", "business:manage"}

    def has_permission(self, request: Request, view: APIView) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        if not getattr(request, "current_tenant", None):
            return False
        if request.method in SAFE_METHODS:
            return True
        return self._can_modify_tenant(request)

    def has_object_permission(self, request: Request, view: APIView, obj: object) -> bool:
        if request.method in SAFE_METHODS:
            return True
        if getattr(request.user, "is_superuser", False):
            return True
        tenant = getattr(obj, "tenant", None)
        if tenant and tenant.owner_id == request.user.id:
            return True
        return self._has_manager_permission(request)

    def _can_modify_tenant(self, request: Request) -> bool:
        if getattr(request.user, "is_superuser", False):
            return True
        tenant = getattr(request, "current_tenant", None)
        if tenant and tenant.owner_id == request.user.id:
            return True
        return self._has_manager_permission(request)

    def _has_manager_permission(self, request: Request) -> bool:
        return request.user.user_roles.filter(
            role__is_active=True,
            role__role_permissions__permission__code__in=self.manager_permissions,
            role__role_permissions__permission__is_active=True,
        ).exists()
