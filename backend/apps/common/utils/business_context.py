from __future__ import annotations

from typing import Any


def resolve_business_id(request: Any, params: Any) -> str:
    """Resolve business UUID from query params or request.current_business."""
    business_id = ""
    if hasattr(params, "get"):
        raw = params.get("business", "")
        business_id = str(raw) if raw else ""
    if business_id:
        return business_id
    business = getattr(request, "current_business", None)
    if business is not None:
        return str(business.id)
    return ""
