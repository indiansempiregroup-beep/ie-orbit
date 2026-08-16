from __future__ import annotations

from django.conf import settings

from apps.businesses.models import Business


def absolute_public_url(url: str | None) -> str:
    value = str(url or "").strip()
    if not value:
        return ""
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if value.startswith("//"):
        return f"https:{value}"
    origin = str(getattr(settings, "PUBLIC_API_ORIGIN", "") or "http://localhost:8000").rstrip("/")
    path = value if value.startswith("/") else f"/{value}"
    return f"{origin}{path}"


def business_email_brand(business: Business | None) -> dict[str, str]:
    if business is None:
        return {"business_name": "", "business_logo": "", "accent_color": "#1A56DB"}
    name = str(getattr(business, "display_name", "") or getattr(business, "business_name", "") or "").strip()
    return {
        "business_name": name,
        "business_logo": absolute_public_url(getattr(business, "logo", "") or ""),
        "accent_color": "#1A56DB",
    }
