from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission

from apps.api.mobile_helpers import resolve_tenant_business

_OPS_ROLE_CODES = {"platform_admin", "super_admin", "business_owner", "manager", "staff"}


def _token_payload(request: Any) -> dict[str, Any]:
    auth = getattr(request, "auth", None)
    if auth is None:
        return {}
    payload = getattr(auth, "payload", None)
    if isinstance(payload, dict):
        return payload
    try:
        return dict(auth)
    except Exception:
        return {}


def _request_tenant_scope(request: Any) -> tuple[str, str]:
    slug = ""
    business_code = ""
    query = getattr(request, "query_params", None)
    if query is not None:
        slug = str(query.get("tenant_slug") or "").strip()
        business_code = str(query.get("business_code") or "").strip()
    data = getattr(request, "data", None)
    if not slug and isinstance(data, dict):
        slug = str(data.get("tenant_slug") or "").strip()
        business_code = str(data.get("business_code") or "").strip()
    elif not slug and data is not None:
        slug = str(getattr(data, "get", lambda *_: "")("tenant_slug") or "").strip()
        business_code = str(getattr(data, "get", lambda *_: "")("business_code") or "").strip()
    return slug, business_code


def _user_is_ops(user: Any) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    codes = set(
        user.user_roles.filter(role__is_active=True).values_list("role__code", flat=True)
    )
    return bool(codes & _OPS_ROLE_CODES)


class IsEmailVerified(BasePermission):
    message = "Verify your email address to continue."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not getattr(user, "is_authenticated", False):
            return False
        return bool(getattr(user, "email_verified_at", None))


class MatchesCustomerAppTenant(BasePermission):
    """Customer JWTs are bound to the flavored shop; they cannot attach to another tenant."""

    message = "This sign-in is for a different shop. Open that shop's app and sign in there."

    def has_permission(self, request, view) -> bool:
        payload = _token_payload(request)
        tenant_id = str(payload.get("tenant_id") or "").strip()
        business_id = str(payload.get("business_id") or "").strip()
        client = str(payload.get("client") or "").strip()
        bound = bool(tenant_id) or client == "customer"

        if not payload:
            return True
        if not bound:
            if _user_is_ops(request.user):
                return True
            self.message = "Sign in again from this app to continue."
            return False

        tenant_slug, business_code = _request_tenant_scope(request)
        if not tenant_slug or not business_code:
            return True
        try:
            tenant, business = resolve_tenant_business(
                tenant_slug=tenant_slug, business_code=business_code
            )
        except ValueError:
            return False
        if tenant_id and str(tenant.id) != tenant_id:
            return False
        if business_id and str(business.id) != business_id:
            return False
        return True
