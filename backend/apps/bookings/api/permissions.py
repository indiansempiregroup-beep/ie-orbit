from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


class BookingAccessPermission(BasePermission):
    message = "Booking access requires a platform admin, business owner, or booking role."
    read_permissions = {"booking:read", "booking:write", "booking:manage"}
    write_permissions = {"booking:write", "booking:manage"}

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
        return self._has_permission(request, self.write_permissions)

    def has_object_permission(self, request: Request, view: APIView, obj: object) -> bool:
        if request.method in SAFE_METHODS:
            return True
        if getattr(request.user, "is_superuser", False):
            return True
        tenant = getattr(obj, "tenant", None)
        if tenant and tenant.owner_id == request.user.id:
            return True
        return self._has_permission(request, self.write_permissions)

    def _has_permission(self, request: Request, codes: set[str]) -> bool:
        return request.user.user_roles.filter(
            role__is_active=True,
            role__role_permissions__permission__code__in=codes,
            role__role_permissions__permission__is_active=True,
        ).exists()
