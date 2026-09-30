from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.billing.services.orders import serialize_checkout_order
from apps.businesses.models import Business, BusinessProductSubscriptionStatus
from apps.platform_admin.models import PlatformLedgerInvoice
from apps.tenancy.models import Tenant
from apps.authentication.models import User

logger = logging.getLogger(__name__)

REFUND_STATUSES = frozenset(
    {"none", "requested", "rejected", "refunded", "partially_refunded"}
)
REFUND_METHODS = frozenset({"razorpay", "upi_manual", "bank"})
WALLET_TOP_UP_KINDS = frozenset({"assistant_top_up", "smart_lookup_top_up"})


def session_refund_kind(session: BillingCheckoutSession) -> str:
    meta = session.metadata or {}
    kind = str(meta.get("kind") or meta.get("claim_intent") or "").strip().lower()
    if kind in WALLET_TOP_UP_KINDS:
        return kind
    plan = str(session.plan_code or "").strip().lower()
    if plan in {"assistant_wallet", "assistant_top_up"}:
        return "assistant_top_up"
    if plan in {"smart_lookup_wallet", "smart_lookup_top_up"}:
        return "smart_lookup_top_up"
    return kind or "subscription"


def is_wallet_top_up_session(session: BillingCheckoutSession) -> bool:
    return session_refund_kind(session) in WALLET_TOP_UP_KINDS


def _refunded_total_paise(meta: dict[str, Any], invoice: PlatformLedgerInvoice | None) -> int:
    if invoice is not None:
        return int(invoice.refunded_paise or 0)
    total = 0
    for entry in meta.get("refunds") or []:
        if isinstance(entry, dict):
            try:
                total += int(entry.get("amount_paise") or 0)
            except (TypeError, ValueError):
                continue
    return total


def remaining_refundable_paise(session: BillingCheckoutSession) -> int:
    meta = dict(session.metadata or {})
    invoice = PlatformLedgerInvoice.objects.filter(checkout_session=session).first()
    return max(0, int(session.amount_paise) - _refunded_total_paise(meta, invoice))


def wallet_balance_paise(session: BillingCheckoutSession) -> int | None:
    """Live prepaid wallet balance for assistant / smart-lookup top-up orders."""
    kind = session_refund_kind(session)
    if kind not in WALLET_TOP_UP_KINDS or session.business_id is None or session.tenant_id is None:
        return None
    try:
        if kind == "assistant_top_up":
            from apps.assistant.services.wallet import AssistantWalletService

            wallet = AssistantWalletService().ensure_wallet(tenant=session.tenant, business=session.business)
            return max(0, int(wallet.balance_paise))
        from apps.shopie.services.smart_lookup import SmartLookupService

        wallet = SmartLookupService().ensure_wallet(tenant=session.tenant, business=session.business)
        return max(0, int(wallet.balance_paise))
    except Exception:
        logger.exception("wallet_balance_lookup_failed session_id=%s kind=%s", session.id, kind)
        return None


def available_refund_paise(session: BillingCheckoutSession, *, business: Business | None = None) -> int:
    """
    Max amount that can still be refunded for this order.

    Plan orders: remaining order amount (yearly may be further suggested via proration).
    Wallet top-ups: min(remaining order amount, current unused wallet balance).
    """
    remaining = remaining_refundable_paise(session)
    if remaining <= 0:
        return 0
    if is_wallet_top_up_session(session):
        balance = wallet_balance_paise(session)
        if balance is None:
            return 0
        return min(remaining, balance)
    return remaining


def suggested_refund_paise(session: BillingCheckoutSession, *, business: Business | None = None) -> int:
    """Default refund amount: unused wallet balance, or prorated remaining yearly period."""
    available = available_refund_paise(session, business=business)
    if available <= 0:
        return 0
    if is_wallet_top_up_session(session):
        return available

    biz = business or session.business
    if biz is None:
        return available
    meta = session.metadata or {}
    product_codes: list[str] = []
    for item in meta.get("line_items") or []:
        if isinstance(item, dict):
            code = str(item.get("product_code") or "").strip().lower()
            if code and code not in product_codes:
                product_codes.append(code)
    if session.product_code and session.product_code not in product_codes:
        product_codes.insert(0, session.product_code)

    now = timezone.now()
    for code in product_codes:
        sub = (
            biz.product_subscriptions.filter(product_code=code)
            .only(
                "billing_interval",
                "current_period_starts_at",
                "current_period_ends_at",
                "status",
            )
            .first()
        )
        if sub is None or sub.billing_interval != "yearly":
            continue
        start = sub.current_period_starts_at
        end = sub.current_period_ends_at
        if not start or not end or end <= start or end <= now:
            continue
        period_seconds = (end - start).total_seconds()
        remaining_seconds = (end - now).total_seconds()
        if period_seconds <= 0:
            continue
        ratio = max(0.0, min(1.0, remaining_seconds / period_seconds))
        return max(1, min(available, int(round(session.amount_paise * ratio))))
    return available


def _clawback_wallet_for_refund(session: BillingCheckoutSession, amount_paise: int) -> int:
    """Remove prepaid balance equal to the refund. Returns clawed paise."""
    kind = session_refund_kind(session)
    if kind not in WALLET_TOP_UP_KINDS or amount_paise <= 0:
        return 0
    if session.business_id is None or session.tenant_id is None:
        raise ValidationError({"refund": "Wallet top-up order is missing business context."})
    meta_extra = {
        "checkout_session_id": str(session.id),
        "order_number": str((session.metadata or {}).get("order_number") or session.razorpay_order_id or ""),
    }
    if kind == "assistant_top_up":
        from apps.assistant.services.wallet import AssistantWalletService

        _, clawed = AssistantWalletService().clawback_wallet(
            tenant=session.tenant,
            business=session.business,
            amount_paise=amount_paise,
            reason=f"refund:{session.razorpay_order_id}",
            metadata=meta_extra,
        )
        return clawed
    from apps.shopie.services.smart_lookup import SmartLookupService

    _, clawed = SmartLookupService().clawback_wallet(
        tenant=session.tenant,
        business=session.business,
        amount_paise=amount_paise,
        reason=f"refund:{session.razorpay_order_id}",
        metadata=meta_extra,
    )
    return clawed


class BillingRefundService:
    def request_refund(
        self,
        *,
        session_id: str,
        business: Business,
        actor: User,
        reason: str,
        amount_paise: int | None = None,
    ) -> BillingCheckoutSession:
        session = get_object_or_404(BillingCheckoutSession, id=session_id, business=business)
        meta = dict(session.metadata or {})
        payment_status = str(meta.get("payment_status") or session.status or "").lower()
        if session.status != CheckoutSessionStatus.PAID and payment_status != "paid":
            raise ValidationError({"status": "Only confirmed payments can be refunded."})
        current = str(meta.get("refund_status") or "none").lower()
        if current == "requested":
            raise ValidationError({"refund": "A refund request is already pending for this order."})
        if current in {"refunded"} and remaining_refundable_paise(session) <= 0:
            raise ValidationError({"refund": "This order is already fully refunded."})

        available = available_refund_paise(session, business=business)
        if available <= 0:
            if is_wallet_top_up_session(session):
                raise ValidationError(
                    {
                        "amount_paise": (
                            "Nothing left to refund — this top-up balance has already been used "
                            "or previously refunded."
                        )
                    }
                )
            raise ValidationError({"amount_paise": "Nothing left to refund on this order."})
        suggested = suggested_refund_paise(session, business=business)
        requested = int(amount_paise) if amount_paise is not None else suggested
        if requested < 1 or requested > available:
            label = "unused wallet balance" if is_wallet_top_up_session(session) else "refundable amount"
            raise ValidationError(
                {"amount_paise": f"Refund amount must be between ₹0.01 and ₹{available / 100:.2f} ({label})."}
            )
        cleaned_reason = str(reason or "").strip()
        if len(cleaned_reason) < 3:
            raise ValidationError({"reason": "Tell us why you need a refund (at least 3 characters)."})

        meta["refund_status"] = "requested"
        meta["refund_request"] = {
            "amount_paise": requested,
            "reason": cleaned_reason[:500],
            "requested_at": timezone.now().isoformat(),
            "requested_by": str(getattr(actor, "id", "") or ""),
            "suggested_amount_paise": suggested,
            "available_amount_paise": available,
            "kind": session_refund_kind(session),
        }
        meta.pop("refund_reject_note", None)
        meta.pop("refund_rejected_at", None)
        session.metadata = meta
        session.save(update_fields=["metadata", "updated_at"])
        try:
            from apps.billing.services.upi_notifications import notify_refund_request_submitted

            notify_refund_request_submitted(session)
        except Exception:
            logger.exception("refund_request_notify_failed session_id=%s", session.id)
        return session

    def withdraw_refund_request(
        self,
        *,
        session_id: str,
        business: Business,
        actor: User,
    ) -> BillingCheckoutSession:
        session = get_object_or_404(BillingCheckoutSession, id=session_id, business=business)
        meta = dict(session.metadata or {})
        if str(meta.get("refund_status") or "") != "requested":
            raise ValidationError({"refund": "There is no pending refund request to withdraw."})
        request_payload = dict(meta.get("refund_request") or {})
        request_payload["withdrawn_at"] = timezone.now().isoformat()
        request_payload["withdrawn_by"] = str(getattr(actor, "id", "") or "")
        meta["refund_request"] = request_payload
        meta["refund_status"] = "none" if remaining_refundable_paise(session) > 0 else "refunded"
        if _refunded_total_paise(meta, PlatformLedgerInvoice.objects.filter(checkout_session=session).first()) > 0:
            remaining = remaining_refundable_paise(session)
            meta["refund_status"] = "partially_refunded" if remaining > 0 else "refunded"
        else:
            meta["refund_status"] = "none"
        session.metadata = meta
        session.save(update_fields=["metadata", "updated_at"])
        return session

    def list_refund_requests(self, *, scope: str = "pending", limit: int = 100) -> list[dict[str, Any]]:
        cap = max(1, min(int(limit), 200))
        queryset = BillingCheckoutSession.objects.select_related("tenant", "business").order_by("-updated_at")
        wanted = str(scope or "pending").strip().lower()
        if wanted == "history":
            queryset = queryset.filter(
                metadata__refund_status__in=["rejected", "refunded", "partially_refunded"]
            )
        elif wanted == "all":
            queryset = queryset.filter(
                Q(metadata__refund_status__in=["requested", "rejected", "refunded", "partially_refunded"])
            )
        else:
            queryset = queryset.filter(metadata__refund_status="requested")
        return [serialize_checkout_order(session, include_tenant=True) for session in queryset[:cap]]

    @transaction.atomic
    def reject_refund_request(
        self,
        *,
        tenant: Tenant,
        session_id: str,
        actor: User,
        reason: str,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        from apps.platform_admin.services import PlatformAdminService

        admin = PlatformAdminService()
        cleaned = admin.require_reason(reason)
        session = get_object_or_404(BillingCheckoutSession, id=session_id, tenant=tenant)
        meta = dict(session.metadata or {})
        if str(meta.get("refund_status") or "") != "requested":
            raise ValidationError({"refund": "No pending refund request on this order."})
        meta["refund_status"] = "rejected"
        meta["refund_reject_note"] = cleaned
        meta["refund_rejected_at"] = timezone.now().isoformat()
        meta["refund_rejected_by"] = str(actor.id)
        session.metadata = meta
        session.save(update_fields=["metadata", "updated_at"])
        admin.audit(
            actor=actor,
            tenant=tenant,
            action="platform.payment.refund_reject",
            resource_type="checkout_session",
            resource_id=str(session.id),
            reason=cleaned,
            metadata={"amount_paise": (meta.get("refund_request") or {}).get("amount_paise")},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        try:
            from apps.billing.services.upi_notifications import notify_refund_request_resolved

            notify_refund_request_resolved(session, action="reject", note=cleaned)
        except Exception:
            logger.exception("refund_reject_notify_failed session_id=%s", session.id)
        return serialize_checkout_order(session, include_tenant=True)

    @transaction.atomic
    def resolve_refund_request(
        self,
        *,
        tenant: Tenant,
        session_id: str,
        actor: User,
        reason: str,
        amount_paise: int | None = None,
        method: str = "upi_manual",
        reference: str = "",
        end_access_now: bool = False,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        from apps.platform_admin.services import PlatformAdminService

        admin = PlatformAdminService()
        cleaned = admin.require_reason(reason)
        method_key = str(method or "upi_manual").strip().lower()
        if method_key not in REFUND_METHODS:
            raise ValidationError({"method": "Use razorpay, upi_manual, or bank."})

        session = get_object_or_404(BillingCheckoutSession, id=session_id, tenant=tenant)
        meta = dict(session.metadata or {})
        payment_status = str(meta.get("payment_status") or session.status or "").lower()
        if session.status != CheckoutSessionStatus.PAID and payment_status != "paid":
            raise ValidationError({"status": "Only confirmed payments can be refunded."})

        available = available_refund_paise(session)
        if available <= 0:
            if is_wallet_top_up_session(session):
                raise ValidationError(
                    {
                        "amount_paise": (
                            "Nothing left to refund — unused wallet balance is ₹0 "
                            "(spent on usage or already refunded)."
                        )
                    }
                )
            raise ValidationError({"amount_paise": "Nothing left to refund on this order."})

        request_payload = dict(meta.get("refund_request") or {})
        requested = request_payload.get("amount_paise")
        refund_amount = int(amount_paise if amount_paise is not None else (requested or available))
        if refund_amount < 1 or refund_amount > available:
            label = "unused wallet balance" if is_wallet_top_up_session(session) else "refundable amount"
            raise ValidationError(
                {"amount_paise": f"Refund amount must be between ₹0.01 and ₹{available / 100:.2f} ({label})."}
            )

        wallet_clawed = 0
        if is_wallet_top_up_session(session):
            wallet_clawed = _clawback_wallet_for_refund(session, refund_amount)
            if wallet_clawed < refund_amount:
                if wallet_clawed <= 0:
                    raise ValidationError(
                        {
                            "amount_paise": (
                                "Wallet balance was spent before this refund could be applied. "
                                "Refresh and try again with the available amount."
                            )
                        }
                    )
                refund_amount = wallet_clawed

        payment_id = str(meta.get("payment_id") or "")
        razorpay_refund_id = None
        if method_key == "razorpay":
            if not payment_id or not str(payment_id).startswith("pay_"):
                raise ValidationError(
                    {
                        "method": (
                            "Razorpay refund needs a live Razorpay payment id. "
                            "Use upi_manual or bank after you pay the merchant offline."
                        )
                    }
                )
            refund_payload = admin.razorpay.refund_payment(
                payment_id=payment_id,
                amount_paise=refund_amount,
                notes={"reason": cleaned[:120], "session_id": str(session.id)},
            )
            razorpay_refund_id = refund_payload.get("id")

        invoice = (
            PlatformLedgerInvoice.objects.filter(
                checkout_session=session,
                document_type=PlatformLedgerInvoice.DocumentType.TAX_INVOICE,
            )
            .order_by("created_at")
            .first()
        )
        if invoice is None:
            invoice, _ = PlatformLedgerInvoice.objects.get_or_create(
                checkout_session=session,
                defaults={
                    "tenant": session.tenant,
                    "business": session.business,
                    "invoice_number": f"LEGACY-{str(session.id).replace('-', '')[:10].upper()}",
                    "amount_paise": session.amount_paise,
                    "currency": session.currency or "INR",
                    "status": "paid",
                    "metadata": {},
                },
            )
        if invoice.refunded_paise + refund_amount > session.amount_paise:
            raise ValidationError({"amount_paise": "Refund would exceed the original order amount."})

        invoice.refunded_paise += refund_amount
        invoice.status = "refunded" if invoice.refunded_paise >= invoice.amount_paise else "partially_refunded"
        invoice_meta = dict(invoice.metadata or {})
        invoice_meta.setdefault("refunds", []).append(
            {
                "id": razorpay_refund_id or f"manual_{uuid4().hex[:10]}",
                "amount_paise": refund_amount,
                "method": method_key,
                "reference": str(reference or "")[:120],
                "note": cleaned[:500],
                "recorded_at": timezone.now().isoformat(),
                "admin_id": str(actor.id),
                "wallet_clawed_paise": wallet_clawed,
            }
        )
        invoice.metadata = invoice_meta
        invoice.save(update_fields=["refunded_paise", "status", "metadata", "updated_at"])

        try:
            from apps.billing.services.tax_invoices import TaxInvoiceService

            TaxInvoiceService().issue_credit_note_for_refund(
                session=session,
                amount_paise=refund_amount,
                reason=cleaned,
                reference=str(reference or ""),
            )
        except Exception:
            logger.exception("credit_note_issue_failed session_id=%s", session.id)

        entry = {
            "amount_paise": refund_amount,
            "method": method_key,
            "reference": str(reference or "")[:120],
            "note": cleaned[:500],
            "recorded_at": timezone.now().isoformat(),
            "admin_id": str(actor.id),
            "razorpay_refund_id": razorpay_refund_id,
            "wallet_clawed_paise": wallet_clawed,
        }
        refunds = list(meta.get("refunds") or [])
        refunds.append(entry)
        meta["refunds"] = refunds
        meta["refund_status"] = (
            "refunded" if invoice.refunded_paise >= session.amount_paise else "partially_refunded"
        )
        meta["refund_resolved_at"] = timezone.now().isoformat()
        meta["refund_resolved_by"] = str(actor.id)
        if wallet_clawed:
            meta["wallet_clawed_paise"] = int(meta.get("wallet_clawed_paise") or 0) + wallet_clawed
            meta["wallet_clawback_at"] = timezone.now().isoformat()
        session.metadata = meta
        session.save(update_fields=["metadata", "updated_at"])

        if end_access_now and session.business_id and not is_wallet_top_up_session(session):
            self._end_access_for_session(session)

        admin.audit(
            actor=actor,
            tenant=tenant,
            action="platform.payment.refund_resolve",
            resource_type="checkout_session",
            resource_id=str(session.id),
            reason=cleaned,
            metadata={
                "amount_paise": refund_amount,
                "method": method_key,
                "reference": str(reference or "")[:120],
                "end_access_now": bool(end_access_now) and not is_wallet_top_up_session(session),
                "razorpay_refund_id": razorpay_refund_id,
                "wallet_clawed_paise": wallet_clawed,
                "kind": session_refund_kind(session),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        try:
            from apps.billing.services.upi_notifications import notify_refund_request_resolved

            notify_refund_request_resolved(session, action="resolve", note=cleaned)
        except Exception:
            logger.exception("refund_resolve_notify_failed session_id=%s", session.id)
        return serialize_checkout_order(session, include_tenant=True)

    def _end_access_for_session(self, session: BillingCheckoutSession) -> None:
        from apps.billing.services.orders import product_codes_for_session

        business = session.business
        if business is None:
            return
        now = timezone.now()
        for code in product_codes_for_session(session):
            sub = business.product_subscriptions.filter(product_code=code).first()
            if sub is None:
                continue
            if sub.status in {
                BusinessProductSubscriptionStatus.ACTIVE,
                BusinessProductSubscriptionStatus.TRIALING,
            }:
                sub.status = BusinessProductSubscriptionStatus.SOFT_LOCKED
                sub.canceled_at = sub.canceled_at or now
                sub.pending_cancel = False
                sub.save(update_fields=["status", "canceled_at", "pending_cancel", "updated_at"])
