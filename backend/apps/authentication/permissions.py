from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


class HasPlatformPermission(BasePermission):
    required_permission: str | None = None

    def has_permission(self, request: Request, view: APIView) -> bool:
        required_permission = self.required_permission or getattr(view, "required_permission", None)
        if not required_permission:
            return True
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "is_superuser", False):
            return True
        return user.user_roles.filter(
            role__role_permissions__permission__code=required_permission,
            role__is_active=True,
            role__role_permissions__permission__is_active=True,
        ).exists()
