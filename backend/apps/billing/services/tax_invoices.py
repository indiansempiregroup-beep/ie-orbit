from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.billing.models import BillingCheckoutSession
from apps.billing.services.gst import split_inclusive_gst
from apps.businesses.models import Business
from apps.platform_admin.models import PlatformBillingGstSettings, PlatformLedgerInvoice

logger = logging.getLogger(__name__)


def get_billing_gst_settings() -> PlatformBillingGstSettings:
    row, _ = PlatformBillingGstSettings.objects.get_or_create(key="default")
    return row


def serialize_billing_gst_settings(row: PlatformBillingGstSettings | None = None) -> dict[str, Any]:
    settings = row or get_billing_gst_settings()
    return {
        "legal_name": settings.legal_name,
        "gstin": settings.gstin,
        "address_line1": settings.address_line1,
        "address_line2": settings.address_line2,
        "city": settings.city,
        "state_code": settings.state_code,
        "postal_code": settings.postal_code,
        "sac_code": settings.sac_code or "998314",
        "gst_percent": float(settings.gst_percent),
        "invoice_prefix": settings.invoice_prefix or "IEO-INV-",
        "credit_note_prefix": settings.credit_note_prefix or "IEO-CN-",
    }


def _seller_snapshot(settings: PlatformBillingGstSettings) -> dict[str, Any]:
    return {
        "legal_name": settings.legal_name,
        "gstin": settings.gstin,
        "address_line1": settings.address_line1,
        "address_line2": settings.address_line2,
        "city": settings.city,
        "state_code": settings.state_code,
        "postal_code": settings.postal_code,
    }


def _buyer_snapshot(business: Business) -> dict[str, Any]:
    return {
        "legal_name": (business.billing_legal_name or business.display_name or "").strip(),
        "gstin": (business.gst_tax_number or "").strip(),
        "address_line1": business.address_line1 or "",
        "address_line2": business.address_line2 or "",
        "city": business.city or "",
        "state": business.state or "",
        "state_code": (business.billing_state_code or "").strip(),
        "postal_code": business.postal_code or "",
        "email": business.email or "",
    }


def _next_document_number(*, credit_note: bool) -> tuple[str, PlatformBillingGstSettings]:
    settings = PlatformBillingGstSettings.objects.select_for_update().get_or_create(key="default")[0]
    if credit_note:
        seq = int(settings.next_credit_note_seq or 1)
        prefix = settings.credit_note_prefix or "IEO-CN-"
        settings.next_credit_note_seq = seq + 1
        settings.save(update_fields=["next_credit_note_seq", "updated_at", "version"])
    else:
        seq = int(settings.next_invoice_seq or 1)
        prefix = settings.invoice_prefix or "IEO-INV-"
        settings.next_invoice_seq = seq + 1
        settings.save(update_fields=["next_invoice_seq", "updated_at", "version"])
    return f"{prefix}{seq:06d}", settings


def _description_for_session(session: BillingCheckoutSession) -> str:
    meta = session.metadata or {}
    kind = str(meta.get("kind") or meta.get("claim_intent") or "").strip().lower()
    if kind == "assistant_top_up":
        return "IE Orbit Assistant wallet top-up"
    if kind == "smart_lookup_top_up":
        return "IE Orbit Smart Lookup wallet top-up"
    plan = session.plan_code or "subscription"
    product = session.product_code or "product"
    return f"IE Orbit subscription · {product} · {plan}"


def serialize_tax_invoice(invoice: PlatformLedgerInvoice) -> dict[str, Any]:
    return {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "document_type": invoice.document_type,
        "amount_paise": invoice.amount_paise,
        "taxable_paise": invoice.taxable_paise,
        "cgst_paise": invoice.cgst_paise,
        "sgst_paise": invoice.sgst_paise,
        "igst_paise": invoice.igst_paise,
        "gst_rate_percent": float(invoice.gst_rate_percent),
        "is_interstate": bool(invoice.is_interstate),
        "place_of_supply": invoice.place_of_supply,
        "sac_code": invoice.sac_code,
        "currency": invoice.currency,
        "status": invoice.status,
        "line_items": invoice.line_items or [],
        "seller_snapshot": invoice.seller_snapshot or {},
        "buyer_snapshot": invoice.buyer_snapshot or {},
        "checkout_session_id": str(invoice.checkout_session_id) if invoice.checkout_session_id else None,
        "original_invoice_id": str(invoice.original_invoice_id) if invoice.original_invoice_id else None,
        "original_invoice_number": (
            invoice.original_invoice.invoice_number if invoice.original_invoice_id else None
        ),
        "razorpay_payment_id": invoice.razorpay_payment_id or "",
        "refunded_paise": invoice.refunded_paise,
        "issued_at": invoice.issued_at.isoformat() if invoice.issued_at else None,
        "created_at": invoice.created_at.isoformat(),
        "business_id": str(invoice.business_id) if invoice.business_id else None,
        "tenant_id": str(invoice.tenant_id) if invoice.tenant_id else None,
        "payment_ref": str((invoice.metadata or {}).get("payment_ref") or ""),
        "notes": str((invoice.metadata or {}).get("notes") or ""),
        "gst_inclusive": True,
    }


class TaxInvoiceService:
    @transaction.atomic
    def issue_tax_invoice_for_session(self, session: BillingCheckoutSession) -> PlatformLedgerInvoice | None:
        if session.business_id is None or session.tenant_id is None:
            return None
        existing = (
            PlatformLedgerInvoice.objects.filter(
                checkout_session=session,
                document_type=PlatformLedgerInvoice.DocumentType.TAX_INVOICE,
            )
            .order_by("created_at")
            .first()
        )
        if existing is not None:
            return existing

        settings = get_billing_gst_settings()
        business = session.business
        seller_state = (settings.state_code or "").strip()
        buyer_state = (business.billing_state_code or "").strip()
        interstate = bool(seller_state and buyer_state and seller_state != buyer_state)
        split = split_inclusive_gst(
            int(session.amount_paise),
            gst_rate_percent=settings.gst_percent or Decimal("18"),
            interstate=interstate,
        )
        number, settings = _next_document_number(credit_note=False)
        meta = session.metadata or {}
        payment_ref = str(meta.get("upi_utr") or meta.get("payment_id") or session.razorpay_order_id or "")
        description = _description_for_session(session)
        invoice = PlatformLedgerInvoice.objects.create(
            tenant=session.tenant,
            business=business,
            invoice_number=number,
            document_type=PlatformLedgerInvoice.DocumentType.TAX_INVOICE,
            amount_paise=split["amount_paise"],
            taxable_paise=split["taxable_paise"],
            cgst_paise=split["cgst_paise"],
            sgst_paise=split["sgst_paise"],
            igst_paise=split["igst_paise"],
            gst_rate_percent=Decimal(str(split["gst_rate_percent"])),
            is_interstate=interstate,
            place_of_supply=buyer_state or seller_state,
            sac_code=settings.sac_code or "998314",
            seller_snapshot=_seller_snapshot(settings),
            buyer_snapshot=_buyer_snapshot(business),
            currency=session.currency or "INR",
            status="paid",
            line_items=[
                {
                    "description": description,
                    "sac_code": settings.sac_code or "998314",
                    "amount_paise": split["amount_paise"],
                    "taxable_paise": split["taxable_paise"],
                    "cgst_paise": split["cgst_paise"],
                    "sgst_paise": split["sgst_paise"],
                    "igst_paise": split["igst_paise"],
                }
            ],
            checkout_session=session,
            razorpay_payment_id=str(meta.get("payment_id") or ""),
            issued_at=timezone.now(),
            metadata={
                "payment_ref": payment_ref,
                "notes": "Amounts are GST-inclusive.",
                "kind": str(meta.get("kind") or meta.get("claim_intent") or "subscription"),
            },
        )
        return invoice

    @transaction.atomic
    def issue_credit_note_for_refund(
        self,
        *,
        session: BillingCheckoutSession,
        amount_paise: int,
        reason: str = "",
        reference: str = "",
    ) -> PlatformLedgerInvoice | None:
        if session.business_id is None or session.tenant_id is None or amount_paise <= 0:
            return None
        original = (
            PlatformLedgerInvoice.objects.filter(
                checkout_session=session,
                document_type=PlatformLedgerInvoice.DocumentType.TAX_INVOICE,
            )
            .order_by("created_at")
            .first()
        )
        settings = get_billing_gst_settings()
        business = session.business
        interstate = bool(original.is_interstate) if original else False
        if original is None:
            seller_state = (settings.state_code or "").strip()
            buyer_state = (business.billing_state_code or "").strip()
            interstate = bool(seller_state and buyer_state and seller_state != buyer_state)
        rate = original.gst_rate_percent if original else (settings.gst_percent or Decimal("18"))
        split = split_inclusive_gst(int(amount_paise), gst_rate_percent=rate, interstate=interstate)
        number, settings = _next_document_number(credit_note=True)
        credit = PlatformLedgerInvoice.objects.create(
            tenant=session.tenant,
            business=business,
            invoice_number=number,
            document_type=PlatformLedgerInvoice.DocumentType.CREDIT_NOTE,
            amount_paise=split["amount_paise"],
            taxable_paise=split["taxable_paise"],
            cgst_paise=split["cgst_paise"],
            sgst_paise=split["sgst_paise"],
            igst_paise=split["igst_paise"],
            gst_rate_percent=Decimal(str(split["gst_rate_percent"])),
            is_interstate=interstate,
            place_of_supply=(original.place_of_supply if original else (business.billing_state_code or settings.state_code)),
            sac_code=(original.sac_code if original else (settings.sac_code or "998314")),
            seller_snapshot=original.seller_snapshot if original else _seller_snapshot(settings),
            buyer_snapshot=original.buyer_snapshot if original else _buyer_snapshot(business),
            currency=session.currency or "INR",
            status="issued",
            line_items=[
                {
                    "description": f"Credit note · {reason[:120]}" if reason else "Credit note for refund",
                    "sac_code": (original.sac_code if original else (settings.sac_code or "998314")),
                    "amount_paise": split["amount_paise"],
                    "taxable_paise": split["taxable_paise"],
                    "cgst_paise": split["cgst_paise"],
                    "sgst_paise": split["sgst_paise"],
                    "igst_paise": split["igst_paise"],
                }
            ],
            checkout_session=session,
            original_invoice=original,
            razorpay_payment_id=str((session.metadata or {}).get("payment_id") or ""),
            issued_at=timezone.now(),
            metadata={
                "payment_ref": reference or str((session.metadata or {}).get("upi_utr") or ""),
                "notes": "Amounts are GST-inclusive. Issued against refund.",
                "reason": reason[:500],
            },
        )
        return credit


def render_tax_invoice_text(invoice: PlatformLedgerInvoice) -> str:
    seller = invoice.seller_snapshot or {}
    buyer = invoice.buyer_snapshot or {}
    doc_label = "TAX INVOICE" if invoice.document_type == "tax_invoice" else "CREDIT NOTE"
    lines = [
        f"IE Orbit — {doc_label}",
        f"Document: {invoice.invoice_number}",
        f"Issued: {(invoice.issued_at or invoice.created_at).isoformat()}",
        "",
        "Seller",
        f"  {seller.get('legal_name') or 'IE Orbit'}",
        f"  GSTIN: {seller.get('gstin') or '—'}",
        f"  {seller.get('address_line1') or ''}",
        f"  {seller.get('city') or ''} {seller.get('state_code') or ''} {seller.get('postal_code') or ''}",
        "",
        "Buyer",
        f"  {buyer.get('legal_name') or '—'}",
        f"  GSTIN: {buyer.get('gstin') or '—'}",
        f"  {buyer.get('address_line1') or ''}",
        f"  Place of supply: {invoice.place_of_supply or '—'}",
        "",
        f"SAC: {invoice.sac_code}",
        f"GST rate: {invoice.gst_rate_percent}% (inclusive)",
        "",
        f"Taxable value: Rs {invoice.taxable_paise / 100:.2f}",
    ]
    if invoice.is_interstate:
        lines.append(f"IGST: Rs {invoice.igst_paise / 100:.2f}")
    else:
        lines.append(f"CGST: Rs {invoice.cgst_paise / 100:.2f}")
        lines.append(f"SGST: Rs {invoice.sgst_paise / 100:.2f}")
    lines.extend(
        [
            f"Grand total: Rs {invoice.amount_paise / 100:.2f}",
            f"Payment ref: {(invoice.metadata or {}).get('payment_ref') or '—'}",
            "",
            "Note: Listed prices are GST-inclusive.",
        ]
    )
    if invoice.original_invoice_id:
        lines.append(f"Against invoice: {invoice.original_invoice.invoice_number}")
    for item in invoice.line_items or []:
        if isinstance(item, dict) and item.get("description"):
            lines.append(f"Line: {item['description']}")
    return "\n".join(lines) + "\n"


def _pdf_escape(text: str) -> str:
    import re

    return re.sub(r"[\\()]", "", str(text or "")).replace("\n", " ")[:140]


def _pdf_money(paise: int) -> str:
    return f"Rs {paise / 100:,.2f}"


def build_tax_invoice_pdf(invoice: PlatformLedgerInvoice) -> bytes:
    """Attractive single-page tax invoice / credit note PDF (no external deps)."""
    seller = invoice.seller_snapshot or {}
    buyer = invoice.buyer_snapshot or {}
    meta = invoice.metadata or {}
    is_credit = invoice.document_type == PlatformLedgerInvoice.DocumentType.CREDIT_NOTE
    doc_label = "CREDIT NOTE" if is_credit else "TAX INVOICE"
    issued = invoice.issued_at or invoice.created_at
    issued_label = issued.strftime("%d %b %Y") if issued else "—"
    payment_ref = str(meta.get("payment_ref") or "—")
    description = "IE Orbit SaaS"
    for item in invoice.line_items or []:
        if isinstance(item, dict) and item.get("description"):
            description = str(item["description"])
            break
    against = ""
    if invoice.original_invoice_id and getattr(invoice, "original_invoice", None):
        against = f"Against: {invoice.original_invoice.invoice_number}"

    seller_lines = [
        str(seller.get("legal_name") or "IE Orbit"),
        f"GSTIN: {seller.get('gstin') or '—'}",
        str(seller.get("address_line1") or ""),
        " ".join(
            str(part)
            for part in (seller.get("city"), seller.get("state_code"), seller.get("postal_code"))
            if part
        ).strip(),
    ]
    buyer_lines = [
        str(buyer.get("legal_name") or "—"),
        f"GSTIN: {buyer.get('gstin') or '—'}",
        str(buyer.get("address_line1") or ""),
        f"Place of supply: {invoice.place_of_supply or '—'}",
    ]

    # Brand teal header; credit notes use a warmer accent.
    header_rgb = (0.12, 0.45, 0.48) if not is_credit else (0.55, 0.28, 0.18)
    accent_rgb = (0.08, 0.32, 0.34) if not is_credit else (0.42, 0.20, 0.12)

    ops: list[str] = []

    def fill_rect(x: float, y: float, w: float, h: float, rgb: tuple[float, float, float]) -> None:
        ops.append(f"{rgb[0]:.3f} {rgb[1]:.3f} {rgb[2]:.3f} rg")
        ops.append(f"{x:.1f} {y:.1f} {w:.1f} {h:.1f} re f")

    def stroke_rect(x: float, y: float, w: float, h: float) -> None:
        ops.append("0.78 0.82 0.84 RG 1.2 w")
        ops.append(f"{x:.1f} {y:.1f} {w:.1f} {h:.1f} re S")

    def line(x1: float, y1: float, x2: float, y2: float, gray: float = 0.75) -> None:
        ops.append(f"{gray:.2f} {gray:.2f} {gray:.2f} RG 0.8 w")
        ops.append(f"{x1:.1f} {y1:.1f} m {x2:.1f} {y2:.1f} l S")

    def text_at(x: float, y: float, content: str, *, size: float = 10, bold: bool = False) -> None:
        font = "/F2" if bold else "/F1"
        ops.append("BT")
        ops.append(f"{font} {size:.1f} Tf")
        ops.append("0 0 0 rg" if not bold else f"{accent_rgb[0]:.3f} {accent_rgb[1]:.3f} {accent_rgb[2]:.3f} rg")
        ops.append(f"1 0 0 1 {x:.1f} {y:.1f} Tm ({_pdf_escape(content)}) Tj")
        ops.append("ET")

    def text_white(x: float, y: float, content: str, *, size: float = 11, bold: bool = False) -> None:
        font = "/F2" if bold else "/F1"
        ops.append("BT")
        ops.append(f"{font} {size:.1f} Tf")
        ops.append("1 1 1 rg")
        ops.append(f"1 0 0 1 {x:.1f} {y:.1f} Tm ({_pdf_escape(content)}) Tj")
        ops.append("ET")

    # Page background wash
    fill_rect(0, 0, 612, 792, (0.97, 0.98, 0.98))
    # Header band
    fill_rect(0, 720, 612, 72, header_rgb)
    text_white(40, 758, "IE Orbit", size=18, bold=True)
    text_white(40, 738, "Software subscription billing", size=9)
    text_white(360, 758, doc_label, size=16, bold=True)
    text_white(360, 738, invoice.invoice_number, size=11)

    text_at(40, 698, f"Issued  {issued_label}", size=10)
    text_at(320, 698, f"Payment ref  {payment_ref}", size=10)
    if against:
        text_at(40, 682, against, size=9)

    # Party cards
    stroke_rect(40, 560, 250, 100)
    stroke_rect(322, 560, 250, 100)
    text_at(52, 642, "Bill from", size=9, bold=True)
    text_at(334, 642, "Bill to", size=9, bold=True)
    y_s = 624
    for line_text in seller_lines:
        if line_text:
            text_at(52, y_s, line_text, size=9)
            y_s -= 14
    y_b = 624
    for line_text in buyer_lines:
        if line_text:
            text_at(334, y_b, line_text, size=9)
            y_b -= 14

    # Line items table
    fill_rect(40, 520, 532, 28, (0.90, 0.94, 0.94) if not is_credit else (0.96, 0.92, 0.88))
    text_at(52, 530, "Description", size=9, bold=True)
    text_at(360, 530, "SAC", size=9, bold=True)
    text_at(460, 530, "Amount", size=9, bold=True)
    text_at(52, 498, description[:70], size=10)
    text_at(360, 498, str(invoice.sac_code or "998314"), size=10)
    text_at(460, 498, _pdf_money(invoice.amount_paise), size=10, bold=True)
    line(40, 480, 572, 480, 0.82)
    text_at(52, 462, f"GST {invoice.gst_rate_percent}% inclusive", size=9)

    # Totals panel
    fill_rect(340, 300, 232, 150, (1, 1, 1))
    stroke_rect(340, 300, 232, 150)
    totals: list[tuple[str, str, bool]] = [
        ("Taxable value", _pdf_money(invoice.taxable_paise), False),
    ]
    if invoice.is_interstate:
        totals.append(("IGST", _pdf_money(invoice.igst_paise), False))
    else:
        totals.append(("CGST", _pdf_money(invoice.cgst_paise), False))
        totals.append(("SGST", _pdf_money(invoice.sgst_paise), False))
    totals.append(("Grand total", _pdf_money(invoice.amount_paise), True))
    y_t = 420
    for label, value, emphasize in totals:
        text_at(352, y_t, label, size=10, bold=emphasize)
        text_at(470, y_t, value, size=10, bold=emphasize)
        y_t -= 22
        if emphasize:
            line(352, y_t + 14, 556, y_t + 14, 0.7)

    text_at(40, 280, "Note: Listed prices are GST-inclusive.", size=9)
    text_at(40, 262, "This is a computer-generated document for IE Orbit SaaS charges.", size=8)
    text_at(40, 40, "ieorbit.com", size=8)

    stream = "\n".join(ops).encode("latin-1", errors="replace")
    objects = [
        b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
        b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
        (
            b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>endobj\n"
        ),
        f"4 0 obj<< /Length {len(stream)} >>stream\n".encode() + stream + b"\nendstream\nendobj\n",
        b"5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
        b"6 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj\n",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n".encode())
    out.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.extend(f"{offset:010d} 00000 n \n".encode())
    out.extend(
        f"trailer<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
    )
    return bytes(out)
