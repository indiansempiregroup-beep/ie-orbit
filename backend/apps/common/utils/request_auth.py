from __future__ import annotations

from django.http import HttpRequest
from rest_framework_simplejwt.authentication import JWTAuthentication


def resolve_authenticated_user(request: HttpRequest) -> object | None:
    """Resolve JWT-authenticated user for middleware (DRF auth runs after middleware)."""
    user = getattr(request, "user", None)
    if getattr(user, "is_authenticated", False):
        return user
    try:
        authenticated = JWTAuthentication().authenticate(request)
    except Exception:
        return None
    if not authenticated:
        return None
    request.user = authenticated[0]
    return authenticated[0]
