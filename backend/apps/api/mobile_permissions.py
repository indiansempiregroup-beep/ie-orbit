from __future__ import annotations

from rest_framework.permissions import BasePermission


class IsEmailVerified(BasePermission):
    message = "Verify your email address to continue."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not getattr(user, "is_authenticated", False):
            return False
        return bool(getattr(user, "email_verified_at", None))
