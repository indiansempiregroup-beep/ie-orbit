from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


class IsAuthenticatedAndActive(BasePermission):
    message = "Authentication is required."

    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_active)


class TenantScopedPermission(BasePermission):
    message = "A tenant context is required."

    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(getattr(request, "tenant_slug", None))
