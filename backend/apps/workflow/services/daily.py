"""Morning scans for overdue balances and stale quotations."""

from __future__ import annotations

import logging
from datetime import date

from django.db.models import F, Max

from apps.businesses.models import Business
from apps.shopie.models import (
    QuotationStatus,
    ShopBooksVoucher,
    ShopPartyLedgerEntry,
    ShopQuotation,
    VoucherStatus,
    VoucherType,
)
from apps.workflow.services.events import emit

logger = logging.getLogger("ie_orbit.workflow")


def _party_name(entry: ShopPartyLedgerEntry) -> str:
    if entry.customer_id and entry.customer is not None:
        return (
            entry.customer.display_name
            or f"{entry.customer.first_name} {entry.customer.last_name}".strip()
            or "Customer"
        )
    if entry.supplier_id and entry.supplier is not None:
        return entry.supplier.name or "Supplier"
    return "Party"


def _age_days(*, business: Business, entry: ShopPartyLedgerEntry, today: date) -> int:
    voucher_type = VoucherType.SALE if entry.customer_id else VoucherType.PURCHASE
    qs = ShopBooksVoucher.objects.filter(
        tenant=business.tenant,
        business=business,
        status=VoucherStatus.CONFIRMED,
        voucher_type=voucher_type,
        total__gt=F("amount_paid"),
    )
    if entry.customer_id:
        qs = qs.filter(customer_id=entry.customer_id)
    elif entry.supplier_id:
        qs = qs.filter(supplier_id=entry.supplier_id)
    else:
        return 1
    oldest = qs.order_by("voucher_date").values_list("voucher_date", flat=True).first()
    if oldest is None:
        return 1
    return max(0, (today - oldest).days)


def scan_overdue_balances(*, business: Business, today: date) -> int:
    """Emit books.overdue once per party that still has a positive balance."""
    tenant = business.tenant
    groups = (
        ShopPartyLedgerEntry.objects.filter(tenant=tenant, business=business)
        .values("party_kind", "customer_id", "supplier_id")
        .annotate(last_at=Max("created_at"))
    )
    matched = 0
    for group in groups[:500]:
        entry = (
            ShopPartyLedgerEntry.objects.filter(
                tenant=tenant,
                business=business,
                party_kind=group["party_kind"],
                customer_id=group["customer_id"],
                supplier_id=group["supplier_id"],
                created_at=group["last_at"],
            )
            .select_related("customer", "supplier")
            .first()
        )
        if entry is None or entry.balance_after <= 0:
            continue
        party_id = str(entry.customer_id or entry.supplier_id or entry.id)
        age = _age_days(business=business, entry=entry, today=today)
        outcome = emit(
            tenant=tenant,
            business=business,
            event_key="books.overdue",
            context={
                "customer": entry.customer,
                "supplier": entry.supplier,
                "balance": str(entry.balance_after),
                "age_days": age,
                "party_name": _party_name(entry),
                "party_kind": entry.party_kind,
                "today": today,
            },
            product_code="shopie",
            subject_type="party",
            subject_id=party_id,
            idempotency_prefix=f"books.overdue:{party_id}:{today.isoformat()}",
        )
        matched += len(outcome.get("runs") or [])
    return matched


def scan_open_quotations(*, business: Business, today: date) -> int:
    """Emit quotation.followup for drafts and sent quotes that are not converted."""
    tenant = business.tenant
    rows = (
        ShopQuotation.objects.filter(
            tenant=tenant,
            business=business,
            status__in=[QuotationStatus.DRAFT, QuotationStatus.SENT],
            converted_order__isnull=True,
        )
        .select_related("customer")
        .order_by("created_at")[:200]
    )
    matched = 0
    for quote in rows:
        created = quote.created_at.date() if quote.created_at else today
        age = max(0, (today - created).days)
        outcome = emit(
            tenant=tenant,
            business=business,
            event_key="quotation.followup",
            context={
                "customer": quote.customer,
                "quotation": quote,
                "quotation_number": quote.quotation_number,
                "age_days": age,
                "balance": str(quote.total),
                "party_name": (
                    quote.customer.display_name if quote.customer_id and quote.customer else "Customer"
                ),
                "today": today,
            },
            product_code="shopie",
            subject_type="quotation",
            subject_id=str(quote.id),
            idempotency_prefix=f"quotation.followup:{quote.id}:{today.isoformat()}",
        )
        matched += len(outcome.get("runs") or [])
    return matched


def run_operational_scans(*, business: Business, today: date) -> int:
    matched = 0
    try:
        matched += scan_overdue_balances(business=business, today=today)
    except Exception:  # noqa: BLE001
        logger.exception("overdue balance scan failed for business %s", business.id)
    try:
        matched += scan_open_quotations(business=business, today=today)
    except Exception:  # noqa: BLE001
        logger.exception("quotation follow-up scan failed for business %s", business.id)
    return matched
