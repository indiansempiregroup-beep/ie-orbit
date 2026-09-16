from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from django.conf import settings

RECORD_KINDS = ("booking", "order", "return", "pet", "ticket")

_CTA_LABELS = {
    "booking": "View appointment",
    "order": "View order",
    "return": "View return",
    "pet": "Open pet",
    "ticket": "View conversation",
}


def frontend_base_url() -> str:
    return str(getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000") or "").rstrip("/")


def ops_web_base_url() -> str:
    configured = str(getattr(settings, "OPS_WEB_BASE_URL", "") or "").strip()
    if configured:
        return configured.rstrip("/")
    vite = str(getattr(settings, "VITE_OPS_MOBILE_WEB_URL", "") or "").strip()
    if vite:
        return vite.rstrip("/")
    return "http://localhost:8082"


def _join(base: str, path: str, query: dict[str, str] | None = None) -> str:
    url = f"{base.rstrip('/')}{path if path.startswith('/') else '/' + path}"
    filtered = {key: value for key, value in (query or {}).items() if value}
    if filtered:
        return f"{url}?{urlencode(filtered)}"
    return url


def _app_slug(business: Any | None) -> str:
    if business is None:
        return ""
    business_id = getattr(business, "pk", None) or getattr(business, "id", None)
    if not business_id:
        return ""
    try:
        from apps.businesses.models import WhiteLabelProfile

        slug = (
            WhiteLabelProfile.objects.filter(business_id=business_id)
            .values_list("app_slug", flat=True)
            .first()
        )
    except Exception:
        return ""
    return str(slug or "").strip()


def staff_record_path(kind: str, record_id: str, extra: dict[str, Any] | None = None) -> str:
    extra = extra or {}
    if kind == "booking":
        return f"/bookings/{record_id}"
    if kind == "order":
        return f"/shop/orders/{record_id}"
    if kind == "return":
        order_id = str(extra.get("order_id") or record_id).strip()
        return f"/shop/orders/{order_id}"
    if kind == "pet":
        return f"/shop/pets?petId={record_id}"
    if kind == "ticket":
        if extra.get("platform"):
            return f"/admin/tickets?ticket={record_id}"
        return f"/settings/support?ticket={record_id}"
    return ""


def customer_open_path(kind: str, record_id: str, extra: dict[str, Any] | None = None) -> str:
    extra = extra or {}
    query: dict[str, str] = {}
    app_slug = str(extra.get("app_slug") or "").strip()
    if app_slug:
        query["app"] = app_slug
    order_id = str(extra.get("order_id") or "").strip()
    if kind == "return" and order_id:
        query["order"] = order_id
    path = f"/open/{kind}/{record_id}"
    if query:
        return f"{path}?{urlencode(query)}"
    return path


def record_cta(
    *,
    audience: str,
    kind: str,
    record_id: Any,
    extra: dict[str, Any] | None = None,
    business: Any | None = None,
) -> dict[str, str]:
    """HTTPS CTA for email. Customers get /open trampoline URLs; staff get ops web paths."""
    ident = str(record_id or "").strip()
    kind_key = str(kind or "").strip().lower()
    if not ident or kind_key not in RECORD_KINDS:
        return {"cta_label": "", "cta_url": ""}

    extra = dict(extra or {})
    audience_key = str(audience or "").strip().lower()
    label = str(extra.get("cta_label") or _CTA_LABELS.get(kind_key) or "View details")

    if audience_key == "customer":
        if not extra.get("app_slug"):
            extra["app_slug"] = _app_slug(business)
        path = customer_open_path(kind_key, ident, extra)
        return {"cta_label": label, "cta_url": _join(frontend_base_url(), path)}

    path = staff_record_path(kind_key, ident, extra)
    if not path:
        return {"cta_label": "", "cta_url": ""}
    base = frontend_base_url() if extra.get("platform") else ops_web_base_url()
    # staff_record_path already embeds query for pet/ticket; don't double-join query.
    if "?" in path:
        pathname, _, query = path.partition("?")
        return {"cta_label": label, "cta_url": f"{_join(base, pathname)}?{query}"}
    return {"cta_label": label, "cta_url": _join(base, path)}
