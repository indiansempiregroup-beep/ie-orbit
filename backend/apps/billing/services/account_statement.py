from __future__ import annotations

import csv
import io
from datetime import date
from typing import Any

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.billing.services.tax_invoices import serialize_tax_invoice
from apps.businesses.models import Business
from apps.platform_admin.models import PlatformLedgerInvoice
from apps.tenancy.models import Tenant


def _parse_bound(raw: str | None) -> date | None:
    if not raw:
        return None
    parsed = parse_date(str(raw).strip())
    return parsed


def paise_to_inr(paise: Any) -> str:
    """Format integer paise as a rupee string with 2 decimals (CA-friendly CSV/JSON)."""
    try:
        return f"{int(paise or 0) / 100:.2f}"
    except (TypeError, ValueError):
        return "0.00"


def list_tax_documents(
    *,
    tenant: Tenant | None = None,
    business: Business | None = None,
    date_from: str | date | None = None,
    date_to: str | date | None = None,
    document_type: str | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    qs = PlatformLedgerInvoice.objects.select_related("business", "original_invoice", "tenant").order_by(
        "-issued_at", "-created_at"
    )
    if tenant is not None:
        qs = qs.filter(tenant=tenant)
    if business is not None:
        qs = qs.filter(business=business)
    start = date_from if isinstance(date_from, date) else _parse_bound(str(date_from) if date_from else None)
    end = date_to if isinstance(date_to, date) else _parse_bound(str(date_to) if date_to else None)
    if start is not None:
        qs = qs.filter(Q(issued_at__date__gte=start) | Q(issued_at__isnull=True, created_at__date__gte=start))
    if end is not None:
        qs = qs.filter(Q(issued_at__date__lte=end) | Q(issued_at__isnull=True, created_at__date__lte=end))
    if document_type:
        qs = qs.filter(document_type=str(document_type).strip().lower())
    return [serialize_tax_invoice(row) for row in qs[: max(1, min(int(limit), 2000))]]


def tax_documents_csv(rows: list[dict[str, Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "date",
            "document_type",
            "invoice_number",
            "original_invoice",
            "buyer_gstin",
            "buyer_name",
            "place_of_supply",
            "sac_code",
            "taxable_inr",
            "cgst_inr",
            "sgst_inr",
            "igst_inr",
            "total_inr",
            "payment_ref",
            "gst_inclusive",
        ]
    )
    for row in rows:
        buyer = row.get("buyer_snapshot") or {}
        issued = row.get("issued_at") or row.get("created_at") or ""
        writer.writerow(
            [
                str(issued)[:10],
                row.get("document_type"),
                row.get("invoice_number"),
                row.get("original_invoice_number") or "",
                buyer.get("gstin") or "",
                buyer.get("legal_name") or "",
                row.get("place_of_supply") or "",
                row.get("sac_code") or "",
                paise_to_inr(row.get("taxable_paise")),
                paise_to_inr(row.get("cgst_paise")),
                paise_to_inr(row.get("sgst_paise")),
                paise_to_inr(row.get("igst_paise")),
                paise_to_inr(row.get("amount_paise")),
                row.get("payment_ref") or "",
                "yes",
            ]
        )
    return buffer.getvalue()


def build_account_statement(
    *,
    tenant: Tenant,
    business: Business | None = None,
    date_from: str | date | None = None,
    date_to: str | date | None = None,
) -> dict[str, Any]:
    rows = list_tax_documents(
        tenant=tenant,
        business=business,
        date_from=date_from,
        date_to=date_to,
        limit=2000,
    )
    # Chronological for statement
    rows_sorted = sorted(rows, key=lambda r: r.get("issued_at") or r.get("created_at") or "")
    opening = 0
    lines: list[dict[str, Any]] = []
    running = opening
    for row in rows_sorted:
        total = int(row.get("amount_paise") or 0)
        is_credit = row.get("document_type") == "credit_note"
        debit = 0 if is_credit else total
        credit = total if is_credit else 0
        running = running + debit - credit
        lines.append(
            {
                "date": str(row.get("issued_at") or row.get("created_at") or "")[:10],
                "entry_type": row.get("document_type"),
                "document_number": row.get("invoice_number"),
                "taxable_inr": paise_to_inr(row.get("taxable_paise")),
                "cgst_inr": paise_to_inr(row.get("cgst_paise")),
                "sgst_inr": paise_to_inr(row.get("sgst_paise")),
                "igst_inr": paise_to_inr(row.get("igst_paise")),
                "debit_inr": paise_to_inr(debit),
                "credit_inr": paise_to_inr(credit),
                "balance_after_inr": paise_to_inr(running),
                "payment_ref": row.get("payment_ref") or "",
                "notes": row.get("notes") or "",
            }
        )
    return {
        "tenant_id": str(tenant.id),
        "business_id": str(business.id) if business else None,
        "date_from": str(date_from) if date_from else None,
        "date_to": str(date_to) if date_to else None,
        "opening_balance_inr": paise_to_inr(opening),
        "closing_balance_inr": paise_to_inr(running),
        "currency": "INR",
        "gst_inclusive": True,
        "lines": lines,
        "generated_at": timezone.now().isoformat(),
    }


def account_statement_csv(statement: dict[str, Any]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "date",
            "entry_type",
            "document_number",
            "taxable_inr",
            "cgst_inr",
            "sgst_inr",
            "igst_inr",
            "debit_inr",
            "credit_inr",
            "balance_after_inr",
            "payment_ref",
            "notes",
        ]
    )
    for line in statement.get("lines") or []:
        writer.writerow(
            [
                line.get("date"),
                line.get("entry_type"),
                line.get("document_number"),
                line.get("taxable_inr"),
                line.get("cgst_inr"),
                line.get("sgst_inr"),
                line.get("igst_inr"),
                line.get("debit_inr"),
                line.get("credit_inr"),
                line.get("balance_after_inr"),
                line.get("payment_ref"),
                line.get("notes"),
            ]
        )
    return buffer.getvalue()
