from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet

from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.billing.services.upi_proof import proof_url_from_meta

# Merchant Products & Billing history: only show payments the user submitted or
# completed. Open/unpaid checkouts (UPI QR created, Razorpay/Cashfree unpaid)
# stay out of history until claimed, paid, rejected, or failed.
# Refund request/resolve statuses also keep the row visible.
MERCHANT_HISTORY_PAYMENT_STATUSES = ("awaiting_confirmation", "paid", "rejected")
MERCHANT_HISTORY_REFUND_STATUSES = ("requested", "rejected", "refunded", "partially_refunded")


def merchant_history_sessions(queryset: QuerySet[BillingCheckoutSession]) -> QuerySet[BillingCheckoutSession]:
    """Filter checkout sessions visible in merchant order history."""
    return queryset.filter(
        Q(status__in=[CheckoutSessionStatus.PAID, CheckoutSessionStatus.FAILED])
        | Q(metadata__payment_status__in=MERCHANT_HISTORY_PAYMENT_STATUSES)
        | Q(metadata__refund_status__in=MERCHANT_HISTORY_REFUND_STATUSES)
    )


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
        or meta.get("refund_resolved_at")
        or meta.get("refund_rejected_at")
        or (session.paid_at.isoformat() if session.paid_at else None)
    )
    refund_request = meta.get("refund_request") if isinstance(meta.get("refund_request"), dict) else None
    refunds = meta.get("refunds") if isinstance(meta.get("refunds"), list) else []
    refunded_paise = 0
    for entry in refunds:
        if isinstance(entry, dict):
            try:
                refunded_paise += int(entry.get("amount_paise") or 0)
            except (TypeError, ValueError):
                continue
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
        "note": meta.get("confirm_note")
        or meta.get("reject_note")
        or meta.get("refund_reject_note")
        or "",
        "refund_status": str(meta.get("refund_status") or "none"),
        "refund_request": refund_request,
        "refunded_paise": refunded_paise,
        "refunds": refunds,
        "suggested_refund_paise": None,
        "available_refund_paise": None,
        "wallet_balance_paise": None,
        "refund_kind": str(meta.get("kind") or meta.get("claim_intent") or ""),
        "is_wallet_top_up": False,
        "tax_invoice_id": None,
        "tax_invoice_number": None,
        "credit_notes": [],
    }
    if include_tenant:
        row["tenant_id"] = str(session.tenant_id) if session.tenant_id else None
        row["tenant_name"] = session.tenant.display_name if session.tenant_id else "Tenant"
        row["tenant_slug"] = session.tenant.slug if session.tenant_id else ""
    try:
        from apps.billing.services.refunds import (
            available_refund_paise,
            is_wallet_top_up_session,
            session_refund_kind,
            suggested_refund_paise,
            wallet_balance_paise,
        )

        row["refund_kind"] = session_refund_kind(session)
        row["is_wallet_top_up"] = is_wallet_top_up_session(session)
        paid = (
            str(meta.get("payment_status") or session.status or "").lower() == "paid"
            or session.status == CheckoutSessionStatus.PAID
        )
        if paid:
            row["suggested_refund_paise"] = suggested_refund_paise(session)
            row["available_refund_paise"] = available_refund_paise(session)
            row["wallet_balance_paise"] = wallet_balance_paise(session)
    except Exception:
        row["suggested_refund_paise"] = None

    try:
        from apps.platform_admin.models import PlatformLedgerInvoice

        paid = (
            str(meta.get("payment_status") or session.status or "").lower() == "paid"
            or session.status == CheckoutSessionStatus.PAID
        )
        if paid and session.business_id and session.tenant_id:
            try:
                from apps.billing.services.tax_invoices import TaxInvoiceService

                TaxInvoiceService().issue_tax_invoice_for_session(session)
            except Exception:
                pass

        tax_docs = list(
            PlatformLedgerInvoice.objects.filter(checkout_session=session)
            .only(
                "id",
                "invoice_number",
                "document_type",
                "amount_paise",
                "issued_at",
                "created_at",
            )
            .order_by("created_at")
        )
        tax_invoice = next(
            (doc for doc in tax_docs if doc.document_type == PlatformLedgerInvoice.DocumentType.TAX_INVOICE),
            None,
        )
        credit_notes = [
            doc for doc in tax_docs if doc.document_type == PlatformLedgerInvoice.DocumentType.CREDIT_NOTE
        ]
        if tax_invoice is not None:
            row["tax_invoice_id"] = str(tax_invoice.id)
            row["tax_invoice_number"] = tax_invoice.invoice_number
            row["invoice_id"] = str(tax_invoice.id)
            row["invoice_number"] = tax_invoice.invoice_number
        else:
            row["tax_invoice_id"] = None
            row["tax_invoice_number"] = None
            row.setdefault("invoice_id", None)
            row.setdefault("invoice_number", None)
        row["credit_notes"] = [
            {
                "id": str(doc.id),
                "invoice_number": doc.invoice_number,
                "amount_paise": doc.amount_paise,
                "issued_at": (doc.issued_at or doc.created_at).isoformat() if (doc.issued_at or doc.created_at) else None,
            }
            for doc in credit_notes
        ]
    except Exception:
        row.setdefault("tax_invoice_id", None)
        row.setdefault("tax_invoice_number", None)
        row.setdefault("credit_notes", [])
    return row
