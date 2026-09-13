from __future__ import annotations

from typing import Any

from apps.billing.models import BillingCheckoutSession
from apps.billing.services.upi_proof import proof_url_from_meta


def product_codes_for_session(session: BillingCheckoutSession) -> list[str]:
    meta = session.metadata or {}
    codes: list[str] = []
    for item in meta.get("line_items") or []:
        if isinstance(item, dict):
            code = str(item.get("product_code") or "").strip()
            if code and code not in codes:
                codes.append(code)
    if session.product_code and session.product_code not in codes:
        codes.insert(0, session.product_code)
    return codes


def order_number_for(session: BillingCheckoutSession) -> str:
    raw = str(session.razorpay_order_id or session.id).replace("-", "")
    return raw[-10:].upper()


def serialize_checkout_order(
    session: BillingCheckoutSession,
    *,
    include_tenant: bool = False,
) -> dict[str, Any]:
    meta = session.metadata or {}
    payment_status = str(meta.get("payment_status") or session.status or "")
    resolved_at = (
        meta.get("confirmed_at")
        or meta.get("rejected_at")
        or (session.paid_at.isoformat() if session.paid_at else None)
    )
    row: dict[str, Any] = {
        "id": str(session.id),
        "order_number": order_number_for(session),
        "order_id": session.razorpay_order_id,
        "payment_id": meta.get("payment_id") or "",
        "amount_paise": session.amount_paise,
        "currency": session.currency,
        "status": session.status,
        "plan_code": session.plan_code,
        "product_code": session.product_code,
        "product_codes": product_codes_for_session(session),
        "business_id": str(session.business_id) if session.business_id else None,
        "business_name": session.business.display_name if session.business_id else "",
        "paid_at": session.paid_at.isoformat() if session.paid_at else None,
        "created_at": session.created_at.isoformat(),
        "payment_channel": meta.get("payment_channel") or "",
        "payment_status": payment_status,
        "upi_utr": meta.get("upi_utr") or "",
        "payment_proof_url": proof_url_from_meta(meta),
        "payment_proof_media_id": meta.get("payment_proof_media_id") or "",
        "claimed_at": meta.get("claimed_at"),
        "claim_intent": meta.get("claim_intent") or "",
        "line_items": meta.get("line_items") or [],
        "resolved_at": resolved_at,
        "note": meta.get("confirm_note") or meta.get("reject_note") or "",
    }
    if include_tenant:
        row["tenant_id"] = str(session.tenant_id) if session.tenant_id else None
        row["tenant_name"] = session.tenant.display_name if session.tenant_id else "Tenant"
        row["tenant_slug"] = session.tenant.slug if session.tenant_id else ""
    return row
