from __future__ import annotations

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseForbidden


class OptionalAdminHostMiddleware:
    """When ADMIN_HOST is set, restrict that host to /admin* and /api/v1/platform* paths.

    Example: ADMIN_HOST=admin.localhost — useful for a Zoho-style dedicated admin entry.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        admin_host = (getattr(settings, "ADMIN_HOST", "") or "").strip().lower()
        if not admin_host:
            return self.get_response(request)

        host = request.get_host().split(":")[0].lower()
        if host != admin_host:
            return self.get_response(request)

        path = request.path or "/"
        allowed_prefixes = (
            "/admin",
            "/api/v1/platform",
            "/api/v1/auth",
            "/api/v1/help",
            "/api/v1/health",
            "/static",
        )
        if path == "/" or any(path.startswith(prefix) for prefix in allowed_prefixes):
            return self.get_response(request)
        return HttpResponseForbidden("This host is reserved for IE Platform Admin.")
