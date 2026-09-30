from __future__ import annotations

import re
import secrets
from datetime import timedelta
from decimal import Decimal
from typing import Any
from urllib.parse import quote
from uuid import UUID

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.html import escape

from apps.businesses.models import Business
from apps.common.upi import build_upi_pay_url
from apps.customers.models import Customer
from apps.customers.services.contact import (
    format_contact_phone,
    resolve_customer_phone,
    resolve_order_contact_phone,
)
from apps.notifications.services.record_links import frontend_base_url
from apps.shopie.models import (
    ShopBooksDocument,
    ShopBooksVoucher,
    ShopDocumentKind,
    ShopDocumentShareLink,
    ShopQuotation,
    ShopSupplier,
    VoucherType,
)
from apps.tenancy.models import Tenant

DOCUMENT_KINDS = frozenset(
    {
        ShopDocumentKind.SALE,
        ShopDocumentKind.QUOTATION,
        ShopDocumentKind.DELIVERY_CHALLAN,
        ShopDocumentKind.CREDIT_NOTE,
        ShopDocumentKind.DEBIT_NOTE,
    }
)
_VOUCHER_DOCUMENT_KINDS = frozenset(
    {
        ShopDocumentKind.SALE,
        ShopDocumentKind.CREDIT_NOTE,
        ShopDocumentKind.DEBIT_NOTE,
    }
)
_VOUCHER_TYPE_BY_DOC_KIND = {
    ShopDocumentKind.SALE: VoucherType.SALE,
    ShopDocumentKind.CREDIT_NOTE: VoucherType.CREDIT_NOTE,
    ShopDocumentKind.DEBIT_NOTE: VoucherType.DEBIT_NOTE,
}
LAYOUT_A4 = "a4"
LAYOUT_THERMAL = "thermal"
SHARE_TOKEN_BYTES = 24
DEFAULT_SHARE_DAYS = 30


def _q(value: Any) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.01"))


def _money(value: Any) -> str:
    return f"{_q(value):,.2f}"


def _currency_symbol(currency: Any) -> str:
    key = str(currency or "INR").strip().upper()
    return {
        "INR": "₹",
        "RS": "₹",
        "RUPEE": "₹",
        "RUPEES": "₹",
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "AED": "AED ",
        "SGD": "S$",
        "AUD": "A$",
        "CAD": "C$",
    }.get(key, f"{key} ")


def _money_with_currency(value: Any, currency: Any = "INR", *, for_pdf: bool = False) -> str:
    if for_pdf:
        # Built-in PDF fonts (Helvetica) cannot render ₹ reliably.
        key = str(currency or "INR").strip().upper()
        if key in {"INR", "RS", "RUPEE", "RUPEES"}:
            return f"Rs {_money(value)}"
        return f"{key} {_money(value)}"
    return f"{_currency_symbol(currency)}{_money(value)}"


_ONES = (
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
)
_TENS = ("", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety")


def _two_digits(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return f"{_TENS[n // 10]}{_ONES[n % 10] and ' ' + _ONES[n % 10] or ''}".strip()


def _amount_in_words(value: Any, currency: str = "INR") -> str:
    amount = _q(value)
    rupees = int(amount)
    paise = int(round((amount - rupees) * 100))
    if rupees == 0 and paise == 0:
        return "Zero only"

    def chunk(n: int) -> str:
        if n == 0:
            return ""
        parts: list[str] = []
        crore, n = divmod(n, 10000000)
        lakh, n = divmod(n, 100000)
        thousand, n = divmod(n, 1000)
        hundred, n = divmod(n, 100)
        if crore:
            parts.append(f"{_two_digits(crore)} Crore")
        if lakh:
            parts.append(f"{_two_digits(lakh)} Lakh")
        if thousand:
            parts.append(f"{_two_digits(thousand)} Thousand")
        if hundred:
            parts.append(f"{_ONES[hundred]} Hundred")
        if n:
            parts.append(_two_digits(n))
        return " ".join(parts)

    unit = "Rupees" if str(currency).upper() in {"INR", "RS", "₹"} else str(currency)
    words = chunk(rupees) or "Zero"
    result = f"{unit} {words}"
    if paise:
        result += f" and {_two_digits(paise)} Paise"
    return f"{result} only"


def _pdf_escape(text: str) -> str:
    return re.sub(r"[\\()]", "", str(text or "")).replace("\n", " ")[:200]


def _pdf_text_width(content: str, size: float) -> float:
    """Approximate Helvetica advance width."""
    return max(0.0, len(str(content or "")) * size * 0.52)


def _pdf_wrap(text: str, *, width: int) -> list[str]:
    raw = re.sub(r"\s+", " ", str(text or "").strip())
    if not raw:
        return []
    if len(raw) <= width:
        return [raw]
    words = raw.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= width:
            current = candidate
            continue
        if current:
            lines.append(current)
        while len(word) > width:
            lines.append(word[:width])
            word = word[width:]
        current = word
    if current:
        lines.append(current)
    return lines


def _dec_str(value: Any) -> str:
    return str(_q(value))


def _party_name(customer: Customer | None) -> str:
    if customer is None:
        return "Walk-in customer"
    return (
        str(customer.display_name or "").strip()
        or f"{customer.first_name or ''} {customer.last_name or ''}".strip()
        or "Customer"
    )


def _format_address_parts(
    *,
    line1: str = "",
    line2: str = "",
    city: str = "",
    state: str = "",
    postal_code: str = "",
    country: str = "",
) -> str:
    street = ", ".join(p for p in [str(line1 or "").strip(), str(line2 or "").strip()] if p)
    locality = ", ".join(
        p
        for p in [
            str(city or "").strip(),
            str(state or "").strip(),
            str(postal_code or "").strip(),
        ]
        if p
    )
    country_part = str(country or "").strip()
    return " · ".join(p for p in [street, locality, country_part] if p)


def _seller_snapshot(business: Business) -> dict[str, Any]:
    return {
        "name": str(business.billing_legal_name or business.display_name or business.business_name or "").strip(),
        "display_name": str(business.display_name or "").strip(),
        "gstin": str(business.gst_tax_number or "").strip(),
        "phone": str(business.primary_contact or "").strip(),
        "email": str(business.email or "").strip(),
        "address_line1": str(business.address_line1 or "").strip(),
        "address_line2": str(business.address_line2 or "").strip(),
        "city": str(business.city or "").strip(),
        "state": str(business.state or "").strip(),
        "postal_code": str(business.postal_code or "").strip(),
        "country": str(getattr(business, "country", "") or "").strip(),
        "address": _format_address_parts(
            line1=str(business.address_line1 or ""),
            line2=str(business.address_line2 or ""),
            city=str(business.city or ""),
            state=str(business.state or ""),
            postal_code=str(business.postal_code or ""),
            country=str(getattr(business, "country", "") or ""),
        ),
        "logo": str(business.logo or "").strip(),
        "upi_vpa": str(business.upi_vpa or "").strip(),
        "payment_qr_url": str(business.payment_qr_url or "").strip(),
        "state_code": str(business.billing_state_code or "").strip(),
    }


def _buyer_from_customer(
    customer: Customer | None,
    *,
    gstin_override: str = "",
    name_override: str = "",
) -> dict[str, Any]:
    base = {
        "name": "Walk-in customer",
        "phone": "",
        "email": "",
        "gstin": "",
        "billing_state": "",
        "address_line1": "",
        "address_line2": "",
        "city": "",
        "state": "",
        "postal_code": "",
        "country": "",
        "address": "",
        "customer_id": None,
    }
    if customer is None:
        if name_override:
            base["name"] = name_override
        if gstin_override:
            base["gstin"] = str(gstin_override).strip().upper()
        return base
    phone = resolve_customer_phone(customer)
    if not phone:
        phone = str(getattr(customer, "phone_number", "") or getattr(customer, "alternate_phone", "") or "").strip()
    address = (
        customer.addresses.filter(is_default=True).first()
        or customer.addresses.order_by("created_at").first()
    )
    line1 = str(getattr(address, "line1", "") or "")
    line2 = str(getattr(address, "line2", "") or "")
    city = str(getattr(address, "city", "") or "")
    state = str(getattr(address, "state", "") or getattr(customer, "billing_state", "") or "")
    postal = str(getattr(address, "postal_code", "") or "")
    country = str(getattr(address, "country", "") or "")
    gstin = str(gstin_override or customer.gstin or "").strip().upper()
    return {
        "name": (name_override or _party_name(customer) or "Customer").strip(),
        "phone": phone,
        "email": str(customer.email or "").strip(),
        "gstin": gstin,
        "billing_state": str(customer.billing_state or "").strip(),
        "address_line1": line1.strip(),
        "address_line2": line2.strip(),
        "city": city.strip(),
        "state": state.strip(),
        "postal_code": postal.strip(),
        "country": country.strip(),
        "address": _format_address_parts(
            line1=line1,
            line2=line2,
            city=city,
            state=state,
            postal_code=postal,
            country=country,
        ),
        "customer_id": str(customer.id),
    }


def _normalize_lines(raw_lines: list[Any] | None) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    for raw in raw_lines or []:
        if not isinstance(raw, dict):
            continue
        qty = Decimal(str(raw.get("qty") or raw.get("quantity") or "0"))
        rate = Decimal(str(raw.get("rate") or raw.get("unit_price") or "0"))
        discount_raw = raw.get("discount")
        if discount_raw in (None, ""):
            discount_raw = raw.get("discount_amount") or raw.get("line_discount") or "0"
        discount = Decimal(str(discount_raw or "0"))
        gst_rate = Decimal(str(raw.get("gst_rate") or raw.get("tax_rate") or "0"))
        taxable = raw.get("taxable") or raw.get("line_subtotal")
        tax = raw.get("tax") or raw.get("line_tax")
        if tax in (None, ""):
            split_tax = _q(raw.get("cgst") or "0") + _q(raw.get("sgst") or "0") + _q(raw.get("igst") or "0")
            if split_tax > 0:
                tax = split_tax
        total = raw.get("line_total") or raw.get("total")
        if taxable is None:
            base = (qty * rate) - discount
            if bool(raw.get("tax_inclusive")) and gst_rate > 0:
                taxable = base * Decimal("100") / (Decimal("100") + gst_rate)
            else:
                taxable = base
        if tax is None and gst_rate > 0:
            tax = _q(taxable) * gst_rate / Decimal("100")
        if total is None:
            total = _q(taxable) + _q(tax or "0")
        lines.append(
            {
                "name": str(raw.get("name") or raw.get("product_name") or "Item").strip(),
                "hsn_sac": str(raw.get("hsn_sac") or "").strip(),
                "qty": str(qty.quantize(Decimal("0.001"))),
                "rate": _dec_str(rate),
                "discount": _dec_str(discount),
                "gst_rate": _dec_str(gst_rate),
                "taxable": _dec_str(taxable),
                "tax": _dec_str(tax or "0"),
                "cgst": _dec_str(raw.get("cgst") or "0"),
                "sgst": _dec_str(raw.get("sgst") or "0"),
                "igst": _dec_str(raw.get("igst") or "0"),
                "total": _dec_str(total),
                "gross": _dec_str(qty * rate),
            }
        )
    return lines


def _line_rollups(lines: list[dict[str, Any]]) -> dict[str, Decimal]:
    merchandise_gross = Decimal("0.00")
    discount_total = Decimal("0.00")
    taxable_value = Decimal("0.00")
    tax_total = Decimal("0.00")
    for line in lines:
        merchandise_gross += _q(line.get("gross") or "0")
        discount_total += _q(line.get("discount") or "0")
        taxable_value += _q(line.get("taxable") or "0")
        tax_total += _q(line.get("tax") or "0")
    return {
        "merchandise_gross": _q(merchandise_gross),
        "discount_total": _q(discount_total),
        "taxable_value": _q(taxable_value),
        "tax_total": _q(tax_total),
    }


def _loyalty_from_metadata(metadata: Any) -> dict[str, Any]:
    meta = metadata if isinstance(metadata, dict) else {}
    loyalty = meta.get("loyalty") if isinstance(meta.get("loyalty"), dict) else {}
    reward_discount = _q(loyalty.get("discount_amount") or "0")
    reward_points = int(loyalty.get("points_redeemed") or 0)
    return {
        "reward_discount": reward_discount,
        "reward_points": max(0, reward_points),
    }

def _doc_labels(kind: str) -> dict[str, str]:
    if kind == ShopDocumentKind.QUOTATION:
        return {"title": "QUOTATION", "short": "Quotation", "number_label": "Quote no."}
    if kind == ShopDocumentKind.DELIVERY_CHALLAN:
        return {"title": "DELIVERY CHALLAN", "short": "Delivery challan", "number_label": "Challan no."}
    if kind == ShopDocumentKind.CREDIT_NOTE:
        return {"title": "CREDIT NOTE", "short": "Credit note", "number_label": "Credit note no."}
    if kind == ShopDocumentKind.DEBIT_NOTE:
        return {"title": "DEBIT NOTE", "short": "Debit note", "number_label": "Debit note no."}
    return {"title": "TAX INVOICE", "short": "Sale invoice", "number_label": "Invoice no."}


def _buyer_from_supplier(
    supplier: ShopSupplier | None,
    *,
    gstin_override: str = "",
    name_override: str = "",
) -> dict[str, Any]:
    base = {
        "name": "Supplier",
        "phone": "",
        "email": "",
        "gstin": "",
        "billing_state": "",
        "address_line1": "",
        "address_line2": "",
        "city": "",
        "state": "",
        "postal_code": "",
        "country": "",
        "address": "",
        "customer_id": None,
    }
    if supplier is None:
        if name_override:
            base["name"] = name_override
        if gstin_override:
            base["gstin"] = str(gstin_override).strip().upper()
        return base
    address = str(supplier.billing_address or "").strip()
    return {
        "name": (name_override or supplier.name or "Supplier").strip(),
        "phone": str(supplier.phone or "").strip(),
        "email": str(supplier.email or "").strip(),
        "gstin": str(gstin_override or supplier.gstin or "").strip().upper(),
        "billing_state": str(supplier.billing_state or "").strip(),
        "address_line1": address,
        "address_line2": "",
        "city": "",
        "state": str(supplier.billing_state or "").strip(),
        "postal_code": "",
        "country": "",
        "address": address,
        "customer_id": None,
    }


def _payload_from_voucher(
    *,
    kind_key: str,
    voucher: ShopBooksVoucher,
    business: Business,
    seller: dict[str, Any],
    labels: dict[str, str],
    public_url: str = "",
) -> dict[str, Any]:
    metadata = voucher.metadata if isinstance(voucher.metadata, dict) else {}
    linked_order = getattr(voucher, "linked_order", None)
    order_meta = (
        linked_order.metadata
        if linked_order is not None and isinstance(getattr(linked_order, "metadata", None), dict)
        else {}
    )
    gst_meta = metadata.get("gst") if isinstance(metadata.get("gst"), dict) else {}
    order_gst = order_meta.get("gst") if isinstance(order_meta.get("gst"), dict) else {}

    if kind_key == ShopDocumentKind.DEBIT_NOTE:
        gstin_override = str(
            metadata.get("supplier_gstin")
            or gst_meta.get("supplier_gstin")
            or metadata.get("customer_gstin")
            or gst_meta.get("customer_gstin")
            or ""
        ).strip().upper()
        name_override = str(metadata.get("supplier_name") or "").strip()
        buyer = _buyer_from_supplier(
            voucher.supplier,
            gstin_override=gstin_override,
            name_override=name_override,
        )
    else:
        gstin_override = str(
            metadata.get("customer_gstin")
            or order_meta.get("customer_gstin")
            or gst_meta.get("customer_gstin")
            or order_gst.get("customer_gstin")
            or ""
        ).strip().upper()
        name_override = str(metadata.get("customer_name") or order_meta.get("customer_name") or "").strip()
        buyer = _buyer_from_customer(
            voucher.customer,
            gstin_override=gstin_override,
            name_override=name_override,
        )
        if linked_order is not None:
            order_phone = resolve_order_contact_phone(linked_order, customer=voucher.customer)
            if order_phone:
                buyer["phone"] = order_phone
            delivery_line = str(getattr(linked_order, "delivery_address", "") or "").strip()
            if delivery_line:
                door = str(order_meta.get("delivery_address_line2") or "").strip()
                buyer["address_line1"] = delivery_line
                buyer["address_line2"] = door
                buyer["city"] = str(order_meta.get("delivery_city") or buyer.get("city") or "")
                buyer["state"] = str(order_meta.get("delivery_state") or buyer.get("state") or "")
                buyer["postal_code"] = str(
                    order_meta.get("delivery_postal_code") or buyer.get("postal_code") or ""
                )
                buyer["address"] = _format_address_parts(
                    line1=delivery_line,
                    line2=door,
                    city=buyer["city"],
                    state=buyer["state"],
                    postal_code=buyer["postal_code"],
                    country=str(buyer.get("country") or ""),
                )

    total = _q(voucher.total)
    paid = _q(voucher.amount_paid)
    due = _amount_due(total, paid)
    date_value = voucher.voucher_date.isoformat() if voucher.voucher_date else ""
    number = voucher.voucher_number
    lines = _normalize_lines(voucher.line_items if isinstance(voucher.line_items, list) else [])
    rollups = _line_rollups(lines)
    loyalty = _loyalty_from_metadata(metadata)
    if loyalty["reward_discount"] <= 0:
        loyalty = _loyalty_from_metadata(order_meta)
    cgst = _q(voucher.cgst_total)
    sgst = _q(voucher.sgst_total)
    igst = _q(voucher.igst_total)
    tax_total = _q(voucher.tax_total) or rollups["tax_total"]
    is_interstate = bool(
        voucher.is_interstate
        or gst_meta.get("is_interstate")
        or order_gst.get("is_interstate")
    )
    if cgst + sgst + igst <= 0 and tax_total > 0:
        from apps.shopie.services.gst import split_stored_tax_total

        split = split_stored_tax_total(tax_total, interstate=is_interstate or igst > 0)
        cgst, sgst, igst = split["cgst"], split["sgst"], split["igst"]
        is_interstate = is_interstate or igst > 0
    taxable_value = rollups["taxable_value"]
    if taxable_value <= 0:
        taxable_value = max(Decimal("0.00"), _q(voucher.subtotal) - _q(voucher.discount_total))
    merchandise_gross = rollups["merchandise_gross"] or _q(voucher.subtotal)
    discount_total = rollups["discount_total"] or _q(voucher.discount_total)
    reward_discount = loyalty["reward_discount"]
    product_discount = max(Decimal("0.00"), discount_total - reward_discount)
    irn = ""
    try:
        einvoice = voucher.einvoice
    except Exception:
        einvoice = None
    if einvoice is not None:
        irn = str(getattr(einvoice, "irn", "") or "")
    # Credit/debit notes do not collect payment via UPI on the document itself.
    upi_url = ""
    if kind_key == ShopDocumentKind.SALE and due > 0 and seller.get("upi_vpa"):
        upi_url = build_upi_pay_url(
            vpa=seller["upi_vpa"],
            payee_name=seller["name"] or seller["display_name"] or "Shop",
            amount=due,
            note=number,
            currency=voucher.currency or business.currency or "INR",
        )
    place_of_supply = str(
        voucher.place_of_supply
        or gst_meta.get("place_of_supply")
        or order_gst.get("place_of_supply")
        or ""
    )
    return {
        "kind": kind_key,
        "id": str(voucher.id),
        "title": labels["title"],
        "short_title": labels["short"],
        "number_label": labels["number_label"],
        "number": number,
        "date": date_value,
        "status": voucher.status,
        "currency": voucher.currency or business.currency or "INR",
        "seller": seller,
        "buyer": buyer,
        "lines": lines,
        "merchandise_gross": _dec_str(merchandise_gross),
        "subtotal": _dec_str(taxable_value),
        "taxable_value": _dec_str(taxable_value),
        "discount_total": _dec_str(discount_total),
        "product_discount_total": _dec_str(product_discount),
        "reward_discount": _dec_str(reward_discount),
        "reward_points": loyalty["reward_points"],
        "tax_total": _dec_str(tax_total),
        "cgst_total": _dec_str(cgst),
        "sgst_total": _dec_str(sgst),
        "igst_total": _dec_str(igst),
        "total": _dec_str(total),
        "amount_paid": _dec_str(paid),
        "amount_due": _dec_str(due),
        "is_interstate": is_interstate or igst > 0,
        "place_of_supply": place_of_supply,
        "invoice_type": "B2B" if buyer.get("gstin") else "B2C",
        "notes": voucher.notes or "",
        "irn": irn,
        "upi_pay_url": upi_url,
        "payment_qr_url": seller.get("payment_qr_url") or "" if kind_key == ShopDocumentKind.SALE else "",
        "public_url": public_url,
        "customer_id": buyer.get("customer_id"),
        "customer_phone": buyer.get("phone") or "",
        "customer_email": buyer.get("email") or "",
    }


def _amount_due(total: Decimal, amount_paid: Decimal) -> Decimal:
    return max(Decimal("0.00"), _q(total) - _q(amount_paid))


class ShopDocumentService:
    """Normalize, render, share, and send shop customer documents."""

    def resolve(
        self,
        *,
        tenant: Tenant,
        business: Business,
        kind: str,
        document_id: UUID | str,
    ) -> tuple[str, Any]:
        kind_key = str(kind or "").strip().lower()
        if kind_key not in DOCUMENT_KINDS:
            raise ValidationError({"kind": f"Unsupported document kind '{kind}'."})
        if kind_key in _VOUCHER_DOCUMENT_KINDS:
            voucher_type = _VOUCHER_TYPE_BY_DOC_KIND[kind_key]
            related = ("customer", "supplier", "business", "linked_order")
            voucher = get_object_or_404(
                ShopBooksVoucher.objects.select_related(*related).prefetch_related(
                    "customer__addresses"
                ),
                tenant=tenant,
                business=business,
                id=document_id,
                voucher_type=voucher_type,
            )
            return kind_key, voucher
        if kind_key == ShopDocumentKind.QUOTATION:
            quotation = get_object_or_404(
                ShopQuotation.objects.select_related("customer", "business").prefetch_related(
                    "customer__addresses"
                ),
                tenant=tenant,
                business=business,
                id=document_id,
            )
            return kind_key, quotation
        document = get_object_or_404(
            ShopBooksDocument.objects.select_related("customer", "business").prefetch_related(
                "customer__addresses"
            ),
            tenant=tenant,
            business=business,
            id=document_id,
            doc_type=ShopDocumentKind.DELIVERY_CHALLAN,
        )
        return kind_key, document

    def build_payload(
        self,
        *,
        tenant: Tenant,
        business: Business,
        kind: str,
        document_id: UUID | str,
        public_url: str = "",
    ) -> dict[str, Any]:
        kind_key, obj = self.resolve(
            tenant=tenant, business=business, kind=kind, document_id=document_id
        )
        labels = _doc_labels(kind_key)
        seller = _seller_snapshot(business)
        if kind_key in _VOUCHER_DOCUMENT_KINDS:
            return _payload_from_voucher(
                kind_key=kind_key,
                voucher=obj,
                business=business,
                seller=seller,
                labels=labels,
                public_url=public_url,
            )

        if kind_key == ShopDocumentKind.QUOTATION:
            quotation: ShopQuotation = obj
            buyer = _buyer_from_customer(quotation.customer)
            lines = _normalize_lines(quotation.line_items if isinstance(quotation.line_items, list) else [])
            valid_until = quotation.valid_until.isoformat() if quotation.valid_until else ""
            return {
                "kind": kind_key,
                "id": str(quotation.id),
                "title": labels["title"],
                "short_title": labels["short"],
                "number_label": labels["number_label"],
                "number": quotation.quotation_number,
                "date": quotation.created_at.date().isoformat() if quotation.created_at else "",
                "status": quotation.status,
                "currency": quotation.currency or business.currency or "INR",
                "seller": seller,
                "buyer": buyer,
                "lines": lines,
                "subtotal": _dec_str(quotation.subtotal),
                "discount_total": "0.00",
                "tax_total": _dec_str(quotation.tax_total),
                "cgst_total": "0.00",
                "sgst_total": "0.00",
                "igst_total": "0.00",
                "total": _dec_str(quotation.total),
                "amount_paid": "0.00",
                "amount_due": _dec_str(quotation.total),
                "is_interstate": False,
                "place_of_supply": "",
                "notes": quotation.notes or "",
                "irn": "",
                "valid_until": valid_until,
                "upi_pay_url": "",
                "payment_qr_url": "",
                "public_url": public_url,
                "customer_id": buyer.get("customer_id"),
                "customer_phone": buyer.get("phone") or "",
                "customer_email": buyer.get("email") or "",
            }

        document: ShopBooksDocument = obj
        buyer = _buyer_from_customer(document.customer)
        lines = _normalize_lines(document.line_items if isinstance(document.line_items, list) else [])
        return {
            "kind": kind_key,
            "id": str(document.id),
            "title": labels["title"],
            "short_title": labels["short"],
            "number_label": labels["number_label"],
            "number": document.document_number,
            "date": document.document_date.isoformat() if document.document_date else "",
            "status": document.status,
            "currency": document.currency or business.currency or "INR",
            "seller": seller,
            "buyer": buyer,
            "lines": lines,
            "subtotal": _dec_str(document.subtotal),
            "discount_total": "0.00",
            "tax_total": _dec_str(document.tax_total),
            "cgst_total": "0.00",
            "sgst_total": "0.00",
            "igst_total": "0.00",
            "total": _dec_str(document.total),
            "amount_paid": "0.00",
            "amount_due": "0.00",
            "is_interstate": False,
            "place_of_supply": "",
            "notes": document.notes or "",
            "irn": "",
            "upi_pay_url": "",
            "payment_qr_url": "",
            "public_url": public_url,
            "customer_id": buyer.get("customer_id"),
            "customer_phone": buyer.get("phone") or "",
            "customer_email": buyer.get("email") or "",
        }

    def render_html(self, payload: dict[str, Any], *, layout: str = LAYOUT_A4) -> str:
        layout_key = LAYOUT_THERMAL if str(layout).lower() == LAYOUT_THERMAL else LAYOUT_A4
        seller = payload.get("seller") or {}
        buyer = payload.get("buyer") or {}
        lines = payload.get("lines") or []
        currency = escape(str(payload.get("currency") or "INR"))
        currency_sym = escape(_currency_symbol(payload.get("currency") or "INR"))
        title = escape(str(payload.get("title") or "DOCUMENT"))
        number = escape(str(payload.get("number") or ""))
        date = escape(str(payload.get("date") or ""))
        business_name = escape(str(seller.get("name") or seller.get("display_name") or "Shop"))
        logo = escape(str(seller.get("logo") or ""))
        due = _q(payload.get("amount_due"))
        paid = _q(payload.get("amount_paid"))
        total = _q(payload.get("total"))
        upi_url = str(payload.get("upi_pay_url") or "")
        qr_url = str(payload.get("payment_qr_url") or "")
        if due > 0 and upi_url and not qr_url:
            qr_url = (
                "https://api.qrserver.com/v1/create-qr-code/?size=148x148&data="
                + quote(upi_url, safe="")
            )

        line_rows = ""
        thermal_line_rows = ""
        for idx, line in enumerate(lines, start=1):
            hsn = escape(str(line.get("hsn_sac") or ""))
            hsn_html = f'<div class="muted">HSN {hsn}</div>' if hsn else ""
            disc = _q(line.get("discount"))
            name = escape(str(line.get("name") or ""))
            qty = escape(str(line.get("qty") or ""))
            rate = escape(_money(line.get("rate")))
            disc_s = escape(_money(disc))
            taxable = escape(_money(line.get("taxable")))
            tax = escape(_money(line.get("tax")))
            total_s = escape(_money(line.get("total")))
            line_rows += (
                "<tr>"
                f"<td class='idx'>{idx}</td>"
                f"<td><div class='item-name'>{name}</div>{hsn_html}</td>"
                f"<td class='num'>{qty}</td>"
                f"<td class='num'>{currency_sym}{rate}</td>"
                f"<td class='num'>{currency_sym}{disc_s}</td>"
                f"<td class='num hide-sm'>{currency_sym}{taxable}</td>"
                f"<td class='num hide-sm'>{currency_sym}{tax}</td>"
                f"<td class='num amount'>{currency_sym}{total_s}</td>"
                "</tr>"
            )
            disc_note = f" · disc {currency_sym}{disc_s}" if disc > 0 else ""
            thermal_line_rows += (
                "<tr>"
                f"<td><div class='item-name'>{name}</div>"
                f"<div class='muted'>{qty} × {currency_sym}{rate}{disc_note}</div></td>"
                f"<td class='num amount'>{currency_sym}{total_s}</td>"
                "</tr>"
            )

        gst_rows = ""
        if _q(payload.get("igst_total")) > 0 or bool(payload.get("is_interstate")):
            gst_rows += (
                f"<div class='tot-row'><span>IGST</span>"
                f"<span>{currency_sym}{_money(payload.get('igst_total') or payload.get('tax_total'))}</span></div>"
            )
        else:
            if _q(payload.get("cgst_total")) > 0:
                gst_rows += (
                    f"<div class='tot-row'><span>CGST</span>"
                    f"<span>{currency_sym}{_money(payload.get('cgst_total'))}</span></div>"
                )
            if _q(payload.get("sgst_total")) > 0:
                gst_rows += (
                    f"<div class='tot-row'><span>SGST</span>"
                    f"<span>{currency_sym}{_money(payload.get('sgst_total'))}</span></div>"
                )

        status_label = escape(str(payload.get("status") or "").replace("_", " ").title())
        paid_badge = ""
        if total > 0 and due <= 0:
            paid_badge = "<span class='badge badge-paid'>Paid</span>"
        elif due > 0:
            paid_badge = f"<span class='badge badge-due'>Due {currency_sym}{_money(due)}</span>"

        due_block = ""
        if due > 0:
            due_block = (
                "<div class='pay-card'>"
                f"<div class='pay-title'>Amount due</div>"
                f"<div class='pay-amount'>{currency_sym}{_money(due)}</div>"
            )
            if qr_url:
                due_block += (
                    f"<img class='qr-img' src='{escape(qr_url)}' alt='UPI QR'/>"
                    f"<div class='muted'>Scan to pay · {escape(str(seller.get('upi_vpa') or ''))}</div>"
                )
            elif upi_url:
                due_block += f"<div class='muted break'>{escape(upi_url)}</div>"
            due_block += "</div>"

        thermal_class = " thermal" if layout_key == LAYOUT_THERMAL else ""
        logo_html = f"<img class='logo' src='{logo}' alt=''/>" if logo else ""
        notes = escape(str(payload.get("notes") or ""))
        irn = escape(str(payload.get("irn") or ""))
        public_url = escape(str(payload.get("public_url") or ""))
        seller_addr = escape(
            str(seller.get("address") or "").strip()
            or _format_address_parts(
                line1=str(seller.get("address_line1") or ""),
                line2=str(seller.get("address_line2") or ""),
                city=str(seller.get("city") or ""),
                state=str(seller.get("state") or ""),
                postal_code=str(seller.get("postal_code") or ""),
                country=str(seller.get("country") or ""),
            )
        )
        seller_gstin = escape(str(seller.get("gstin") or ""))
        seller_phone = escape(str(seller.get("phone") or ""))
        seller_email = escape(str(seller.get("email") or ""))
        buyer_name = escape(str(buyer.get("name") or ""))
        buyer_gstin = escape(str(buyer.get("gstin") or ""))
        buyer_phone = escape(str(buyer.get("phone") or ""))
        buyer_email = escape(str(buyer.get("email") or ""))
        buyer_addr = escape(
            str(buyer.get("address") or "").strip()
            or _format_address_parts(
                line1=str(buyer.get("address_line1") or ""),
                line2=str(buyer.get("address_line2") or ""),
                city=str(buyer.get("city") or ""),
                state=str(buyer.get("state") or ""),
                postal_code=str(buyer.get("postal_code") or ""),
                country=str(buyer.get("country") or ""),
            )
        )
        number_label = escape(str(payload.get("number_label") or "No."))
        words = escape(_amount_in_words(total, str(payload.get("currency") or "INR")))
        col_span = 8
        is_thermal = layout_key == LAYOUT_THERMAL

        def _party_contact_html(*, phone: str, email: str, address: str, gstin: str) -> str:
            rows = [
                f'<div class="contact-row"><span>GSTIN</span><strong>{gstin or "—"}</strong></div>',
            ]
            if phone:
                rows.append(f'<div class="contact-row"><span>Phone</span><strong>{phone}</strong></div>')
            if email:
                rows.append(f'<div class="contact-row"><span>Email</span><strong>{email}</strong></div>')
            if address:
                rows.append(f'<div class="contact-row"><span>Address</span><strong>{address}</strong></div>')
            return "".join(rows)

        seller_contacts = _party_contact_html(
            phone=seller_phone, email=seller_email, address=seller_addr, gstin=seller_gstin
        )
        buyer_contacts = _party_contact_html(
            phone=buyer_phone, email=buyer_email, address=buyer_addr, gstin=buyer_gstin
        )
        seller_gst_badge = f'<span class="gst-badge">GSTIN {seller_gstin or "—"}</span>'
        merchandise_gross = _q(payload.get("merchandise_gross") or "0")
        taxable_value = _q(payload.get("taxable_value") or payload.get("subtotal") or "0")
        product_discount = _q(
            payload.get("product_discount_total")
            if payload.get("product_discount_total") is not None
            else (payload.get("discount_total") or "0")
        )
        reward_discount = _q(payload.get("reward_discount") or "0")
        reward_points = int(payload.get("reward_points") or 0)
        place_of_supply = escape(str(payload.get("place_of_supply") or ""))
        invoice_type = escape(str(payload.get("invoice_type") or "B2C"))
        totals_html = ""
        if merchandise_gross > 0:
            totals_html += (
                f"<div class='tot-row'><span>Items</span>"
                f"<span>{currency_sym}{_money(merchandise_gross)}</span></div>"
            )
        if product_discount > 0:
            totals_html += (
                f"<div class='tot-row'><span>Discount</span>"
                f"<span>-{currency_sym}{_money(product_discount)}</span></div>"
            )
        if reward_discount > 0:
            pts = f" ({reward_points} pts)" if reward_points > 0 else ""
            totals_html += (
                f"<div class='tot-row'><span>Reward points{escape(pts)}</span>"
                f"<span>-{currency_sym}{_money(reward_discount)}</span></div>"
            )
        totals_html += (
            f"<div class='tot-row'><span>Taxable value</span>"
            f"<span>{currency_sym}{_money(taxable_value)}</span></div>"
        )
        totals_html += gst_rows
        if not gst_rows and _q(payload.get("tax_total")) > 0:
            totals_html += (
                f"<div class='tot-row'><span>GST</span>"
                f"<span>{currency_sym}{_money(payload.get('tax_total'))}</span></div>"
            )
        totals_html += (
            f"<div class='tot-row grand'><span>Total</span>"
            f"<span>{currency_sym}{_money(total)}</span></div>"
            f"<div class='tot-row'><span>Paid</span>"
            f"<span>{currency_sym}{_money(paid)}</span></div>"
            f"<div class='tot-row'><span>Balance due</span>"
            f"<span>{currency_sym}{_money(due)}</span></div>"
        )
        supply_meta = ""
        if place_of_supply or buyer_gstin or invoice_type == "B2B":
            bits = [invoice_type]
            if place_of_supply:
                bits.append(f"Place of supply {place_of_supply}")
            supply_meta = f"<div class='footer'>{' · '.join(bits)}</div>"
        tax_total_row = ""  # kept for template compat; totals now use totals_html

        if is_thermal:
            items_table = f"""
      <table class="thermal-items">
        <thead>
          <tr><th>Item</th><th class="num">Amount</th></tr>
        </thead>
        <tbody>{thermal_line_rows or "<tr><td colspan='2'>No line items</td></tr>"}</tbody>
      </table>"""
            head_block = f"""
    <div class="head thermal-head">
      {logo_html}
      <div class="shop-name">{business_name}</div>
      {seller_gst_badge}
      <div class="thermal-doc-title">{title}</div>
      <div class="thermal-doc-meta">
        <div><strong>{number or '—'}</strong></div>
        <div>Date {date or '—'}</div>
        <div>{status_label or '—'}{paid_badge}</div>
      </div>
    </div>"""
            parties_block = f"""
      <div class="parties thermal-parties">
        <div class="party">
          <h3>Bill to</h3>
          <div class="party-name">{buyer_name or 'Walk-in customer'}</div>
          {buyer_contacts}
        </div>
      </div>"""
        else:
            items_table = f"""
      <table>
        <thead>
          <tr>
            <th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th>
            <th class="num">Disc</th>
            <th class="num hide-sm">Taxable</th><th class="num hide-sm">Tax</th><th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>{line_rows or f"<tr><td colspan='{col_span}'>No line items</td></tr>"}</tbody>
      </table>"""
            head_block = f"""
    <div class="head">
      <div>
        {logo_html}
        <div class="shop-name">{business_name}</div>
      </div>
      <div class="doc-meta">
        {seller_gst_badge}
        <div class="label">{title}</div>
        <h1>{number or '—'}</h1>
        <dl>
          <div><dt>Date</dt><dd>{date or '—'}</dd></div>
          <div><dt>Status</dt><dd>{status_label or '—'}{paid_badge}</dd></div>
        </dl>
      </div>
    </div>"""
            parties_block = f"""
      <div class="parties">
        <div class="party">
          <h3>Bill from</h3>
          <div class="party-name">{business_name}</div>
          {seller_contacts}
        </div>
        <div class="party">
          <h3>Bill to</h3>
          <div class="party-name">{buyer_name or 'Walk-in customer'}</div>
          {buyer_contacts}
        </div>
      </div>"""

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{title} {number}</title>
  <style>
    :root {{
      --ink:#15202b; --muted:#667085; --line:#e3e8ee; --brand:#0f766e;
      --brand-soft:#e8f6f4; --paper:#fff; --wash:#f4f6f8;
    }}
    * {{ box-sizing:border-box; }}
    body {{
      margin:0; color:var(--ink); background:var(--wash);
      font: 14px/1.45 "IBM Plex Sans", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      -webkit-font-smoothing:antialiased;
    }}
    .toolbar {{
      position:sticky; top:0; z-index:5; display:flex; gap:8px; justify-content:flex-end;
      padding:12px 16px; background:rgba(244,246,248,.94); backdrop-filter:blur(8px);
      border-bottom:1px solid var(--line);
    }}
    .toolbar button {{
      border:1px solid var(--line); background:#fff; color:var(--ink); border-radius:8px;
      padding:8px 14px; font:600 13px/1 inherit; cursor:pointer;
    }}
    .toolbar button.primary {{ background:var(--brand); border-color:var(--brand); color:#fff; }}
    .toolbar a.button {{
      border:1px solid var(--line); background:#fff; color:var(--ink); border-radius:8px;
      padding:8px 14px; font:600 13px/1 inherit; cursor:pointer; text-decoration:none;
      display:inline-flex; align-items:center;
    }}
    .toolbar a.button.primary {{ background:var(--brand); border-color:var(--brand); color:#fff; }}
    .toolbar-hint {{
      display:none; margin:0 16px 10px; padding:8px 12px; border-radius:8px;
      background:#fff7e8; border:1px solid #f0d7a4; color:#92400e; font-size:12.5px;
    }}
    .toolbar-hint.show {{ display:block; }}
    .sheet {{
      max-width:820px; margin:24px auto 48px; background:var(--paper);
      border:1px solid var(--line); border-radius:12px; overflow:hidden;
      box-shadow:0 1px 2px rgba(16,24,40,.04), 0 16px 40px rgba(16,24,40,.07);
    }}
    .sheet.thermal {{
      max-width:340px; font-size:12.5px; border-radius:8px;
      box-shadow:0 1px 2px rgba(16,24,40,.04), 0 10px 24px rgba(16,24,40,.06);
    }}
    .head {{
      display:grid; grid-template-columns:1.2fr 1fr; gap:20px; align-items:start;
      padding:26px 32px; background:linear-gradient(135deg, #0f766e 0%, #0b5a55 100%);
      color:#fff;
    }}
    .thermal-head {{
      display:flex; flex-direction:column; align-items:center; text-align:center;
      gap:6px; padding:20px 18px 16px;
    }}
    .logo {{
      max-height:48px; max-width:150px; display:block; margin-bottom:12px;
      background:#fff; border-radius:8px; padding:4px;
    }}
    .thermal-head .logo {{ margin:0 auto 8px; max-height:40px; }}
    .shop-name {{ font-size:24px; font-weight:700; letter-spacing:-.02em; margin:0; }}
    .thermal-head .shop-name {{ font-size:18px; }}
    .gst-badge {{
      display:inline-flex; align-items:center; font-size:12px; font-weight:700;
      letter-spacing:.03em; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.28);
      padding:5px 10px; border-radius:999px; margin-bottom:10px;
    }}
    .thermal-head .gst-badge {{ margin:0; }}
    .thermal-doc-title {{
      margin-top:6px; font-size:11px; font-weight:700; letter-spacing:.12em;
      text-transform:uppercase; opacity:.92;
    }}
    .thermal-doc-meta {{ font-size:12px; opacity:.95; line-height:1.45; }}
    .doc-meta {{ text-align:right; display:grid; justify-items:end; gap:6px; }}
    .doc-meta .label {{
      display:inline-block; font-size:11px; font-weight:700; letter-spacing:.1em;
      text-transform:uppercase; color:#fff; background:rgba(255,255,255,.18);
      padding:4px 10px; border-radius:999px;
    }}
    .doc-meta h1 {{ margin:0; font-size:26px; letter-spacing:-.02em; font-weight:700; }}
    .doc-meta dl {{ margin:0; display:grid; gap:4px; font-size:13px; opacity:.95; }}
    .doc-meta dt {{ opacity:.8; display:inline; }}
    .doc-meta dd {{ display:inline; margin:0 0 0 6px; font-weight:600; }}
    .badge {{
      display:inline-flex; align-items:center; border-radius:999px; padding:3px 9px;
      font-size:11px; font-weight:700; margin-left:6px; vertical-align:middle;
    }}
    .badge-paid {{ background:#dcfce7; color:#166534; }}
    .badge-due {{ background:#fef3c7; color:#92400e; }}
    .body {{ padding:24px 32px 32px; }}
    .sheet.thermal .body {{ padding:14px 14px 20px; }}
    .parties {{
      display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:22px;
    }}
    .thermal-parties {{ grid-template-columns:1fr; margin-bottom:14px; }}
    .party {{
      border:1px solid var(--line); border-radius:10px; padding:14px 16px;
      background:linear-gradient(180deg, #fbfcfd 0%, #fff 100%);
    }}
    .sheet.thermal .party {{ padding:10px 12px; border-radius:8px; }}
    .party h3 {{
      margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:.08em;
      color:var(--brand); font-weight:700;
    }}
    .party .party-name {{ font-size:15px; font-weight:700; margin-bottom:4px; }}
    .contact-row {{
      display:grid; grid-template-columns:68px 1fr; gap:8px; margin-top:6px; font-size:12.5px;
    }}
    .sheet.thermal .contact-row {{ grid-template-columns:56px 1fr; gap:6px; font-size:11.5px; }}
    .contact-row span {{ color:var(--muted); }}
    .contact-row strong {{ font-weight:600; word-break:break-word; }}
    table {{
      width:100%; border-collapse:collapse; margin:4px 0 18px;
      border:1px solid var(--line); border-radius:10px; overflow:hidden;
    }}
    .thermal-items {{ border-radius:8px; margin:0 0 12px; }}
    th, td {{ padding:11px 10px; font-size:13px; vertical-align:top; }}
    .thermal-items th, .thermal-items td {{ padding:8px 8px; font-size:12px; }}
    th {{
      text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.06em;
      color:var(--muted); font-weight:700; border-bottom:1px solid var(--line); background:#f7faf9;
    }}
    td {{ border-bottom:1px solid #eef2f6; }}
    tr:last-child td {{ border-bottom:none; }}
    .idx {{ width:36px; color:var(--muted); }}
    .item-name {{ font-weight:600; }}
    .num {{ text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }}
    .amount {{ font-weight:700; }}
    .muted {{ color:var(--muted); font-size:11.5px; margin-top:3px; }}
    .summary {{
      display:grid; grid-template-columns:1.15fr .85fr; gap:20px; align-items:start;
    }}
    .sheet.thermal .summary {{ grid-template-columns:1fr; gap:12px; }}
    .words {{
      font-size:12.5px; color:var(--muted); line-height:1.5; padding:12px 14px;
      background:var(--brand-soft); border-radius:8px; border-left:3px solid var(--brand);
    }}
    .sheet.thermal .words {{ font-size:11.5px; padding:10px 12px; }}
    .words strong {{ color:var(--ink); }}
    .totals {{
      font-size:13.5px; border:1px solid var(--line); border-radius:10px; padding:12px 14px;
      background:#fbfcfd;
    }}
    .sheet.thermal .totals {{ font-size:12.5px; padding:10px 12px; border-radius:8px; }}
    .tot-row {{ display:flex; justify-content:space-between; padding:6px 0; gap:16px; }}
    .tot-row.grand {{
      font-size:17px; font-weight:800; border-top:2px solid var(--ink); margin-top:8px;
      padding-top:10px; color:var(--ink);
    }}
    .sheet.thermal .tot-row.grand {{ font-size:15px; }}
    .pay-card {{
      margin-top:12px; border-radius:10px; padding:14px; background:#fffbeb;
      border:1px solid #f5e0b0; text-align:center;
    }}
    .pay-title {{ font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#92400e; font-weight:700; }}
    .pay-amount {{ font-size:22px; font-weight:800; margin:6px 0 10px; color:#78350f; }}
    .qr-img {{ width:140px; height:140px; border-radius:8px; background:#fff; padding:6px; border:1px solid #f5e0b0; }}
    .sheet.thermal .qr-img {{ width:120px; height:120px; }}
    .footer {{ margin-top:14px; font-size:11.5px; color:var(--muted); line-height:1.5; }}
    .sheet.thermal .footer {{ font-size:11px; text-align:center; }}
    .break {{ word-break:break-all; }}
    @media screen and (max-width:720px) {{
      .head:not(.thermal-head), .body {{ padding:18px; }}
      .head:not(.thermal-head), .parties:not(.thermal-parties), .summary {{ grid-template-columns:1fr; }}
      .doc-meta {{ text-align:left; justify-items:start; }}
      .hide-sm {{ display:none; }}
    }}
    @media print {{
      body {{ background:#fff; }}
      .toolbar, .toolbar-hint {{ display:none !important; }}
      .sheet {{
        margin:0; box-shadow:none; border:none; border-radius:0; max-width:none;
      }}
      .sheet.thermal {{ max-width:80mm; margin:0 auto; }}
      .head:not(.thermal-head) {{
        display:grid !important;
        grid-template-columns:1.2fr 1fr !important;
        -webkit-print-color-adjust:exact;
        print-color-adjust:exact;
      }}
      .doc-meta {{ text-align:right !important; justify-items:end !important; }}
      .parties:not(.thermal-parties) {{
        display:grid !important;
        grid-template-columns:1fr 1fr !important;
        gap:14px !important;
      }}
      .summary {{
        display:grid !important;
        grid-template-columns:1.15fr .85fr !important;
      }}
      .sheet.thermal .summary {{ grid-template-columns:1fr !important; }}
      .hide-sm {{ display:table-cell !important; }}
      .sheet.thermal .hide-sm {{ display:none !important; }}
    }}
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" class="primary" id="btn-print">Print</button>
    <a class="button" id="btn-pdf" href="#">Download PDF</a>
    <button type="button" id="btn-done">Done</button>
  </div>
  <div class="toolbar-hint no-print" id="toolbar-hint"></div>
  <div class="sheet{thermal_class}">
    {head_block}
    <div class="body">
      {parties_block}
      {items_table}
      <div class="summary">
        <div>
          <div class="words"><strong>Amount in words:</strong> {words}</div>
          {due_block}
          {f'<div class="footer">Notes: {notes}</div>' if notes else ''}
          {supply_meta}
          {f'<div class="footer">IRN: {irn}</div>' if irn else ''}
          {f'<div class="footer">Online copy: {public_url}</div>' if public_url and not is_thermal else ''}
          <div class="footer">This is a computer-generated document.</div>
        </div>
        <div class="totals">
          {totals_html}
        </div>
      </div>
    </div>
  </div>
  <script>
    (function () {{
      function hint(msg) {{
        var el = document.getElementById('toolbar-hint');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
      }}
      function pdfHref() {{
        try {{
          var url = new URL(window.location.href);
          if (url.pathname.indexOf('/public/shop-docs/') !== -1) {{
            if (url.pathname.slice(-4) === '/pdf') return url.pathname + url.search;
            url.searchParams.set('format', 'pdf');
            return url.pathname + '?' + url.searchParams.toString();
          }}
          url.searchParams.set('format', 'pdf');
          return url.pathname + '?' + url.searchParams.toString();
        }} catch (e) {{
          return '?format=pdf';
        }}
      }}
      var pdfBtn = document.getElementById('btn-pdf');
      if (pdfBtn) pdfBtn.setAttribute('href', pdfHref());
      var printBtn = document.getElementById('btn-print');
      if (printBtn) {{
        printBtn.addEventListener('click', function () {{
          try {{
            window.print();
            setTimeout(function () {{
              hint('If print did not open, tap Download PDF and print from your files app.');
            }}, 700);
          }} catch (e) {{
            hint('Printing is not available here. Tap Download PDF instead.');
          }}
        }});
      }}
      var doneBtn = document.getElementById('btn-done');
      if (doneBtn) {{
        doneBtn.addEventListener('click', function () {{
          try {{ window.close(); }} catch (e) {{}}
          try {{
            if (window.history.length > 1) {{
              window.history.back();
              return;
            }}
          }} catch (e) {{}}
          hint('Tap Done in the top browser bar to return to the app.');
        }});
      }}
    }})();
  </script>
</body>
</html>"""



    def build_pdf(self, payload: dict[str, Any], *, layout: str = LAYOUT_A4) -> bytes:
        layout_key = LAYOUT_THERMAL if str(layout).lower() == LAYOUT_THERMAL else LAYOUT_A4
        if layout_key == LAYOUT_THERMAL:
            return self._build_thermal_pdf(payload)
        return self._build_a4_pdf(payload)

    def _build_a4_pdf(self, payload: dict[str, Any]) -> bytes:
        """A4 PDF aligned with the HTML invoice layout (also used for email attachments)."""
        seller = payload.get("seller") or {}
        buyer = payload.get("buyer") or {}
        lines = payload.get("lines") or []
        currency = str(payload.get("currency") or "INR")
        header_rgb = (0.059, 0.463, 0.431)  # #0f766e
        accent_rgb = (0.059, 0.463, 0.431)
        ink_rgb = (0.082, 0.125, 0.169)
        muted_rgb = (0.400, 0.439, 0.522)
        line_rgb = (0.890, 0.910, 0.933)
        soft_rgb = (0.969, 0.980, 0.976)
        page_w, page_h = 612.0, 792.0
        margin_x = 36.0
        content_w = page_w - (margin_x * 2)
        right_edge = page_w - margin_x
        ops: list[str] = []

        def set_rgb(rgb: tuple[float, float, float], *, fill: bool = True) -> None:
            op = "rg" if fill else "RG"
            ops.append(f"{rgb[0]:.3f} {rgb[1]:.3f} {rgb[2]:.3f} {op}")

        def fill_rect(x: float, y: float, w: float, h: float, rgb: tuple[float, float, float]) -> None:
            set_rgb(rgb)
            ops.append(f"{x:.1f} {y:.1f} {w:.1f} {h:.1f} re f")

        def stroke_rect(
            x: float, y: float, w: float, h: float, rgb: tuple[float, float, float] = line_rgb
        ) -> None:
            set_rgb(rgb, fill=False)
            ops.append("0.8 w")
            ops.append(f"{x:.1f} {y:.1f} {w:.1f} {h:.1f} re S")

        def hline(x1: float, x2: float, y: float, rgb: tuple[float, float, float] = line_rgb) -> None:
            set_rgb(rgb, fill=False)
            ops.append("0.6 w")
            ops.append(f"{x1:.1f} {y:.1f} m {x2:.1f} {y:.1f} l S")

        def text_at(
            x: float,
            y: float,
            content: str,
            *,
            size: float = 10,
            bold: bool = False,
            rgb: tuple[float, float, float] | None = None,
        ) -> None:
            font = "/F2" if bold else "/F1"
            ops.append("BT")
            ops.append(f"{font} {size:.1f} Tf")
            set_rgb(rgb or ink_rgb)
            ops.append(f"1 0 0 1 {x:.1f} {y:.1f} Tm ({_pdf_escape(content)}) Tj")
            ops.append("ET")

        def text_right(
            x_right: float,
            y: float,
            content: str,
            *,
            size: float = 10,
            bold: bool = False,
            rgb: tuple[float, float, float] | None = None,
        ) -> None:
            text_at(
                x_right - _pdf_text_width(content, size),
                y,
                content,
                size=size,
                bold=bold,
                rgb=rgb,
            )

        def money(value: Any) -> str:
            return _money_with_currency(value, currency, for_pdf=True)

        seller_name = str(seller.get("name") or seller.get("display_name") or "Shop")
        buyer_name = str(buyer.get("name") or "Walk-in customer")
        seller_addr = str(
            seller.get("address")
            or _format_address_parts(
                line1=str(seller.get("address_line1") or ""),
                line2=str(seller.get("address_line2") or ""),
                city=str(seller.get("city") or ""),
                state=str(seller.get("state") or ""),
                postal_code=str(seller.get("postal_code") or ""),
                country=str(seller.get("country") or ""),
            )
        )
        buyer_addr = str(
            buyer.get("address")
            or _format_address_parts(
                line1=str(buyer.get("address_line1") or ""),
                line2=str(buyer.get("address_line2") or ""),
                city=str(buyer.get("city") or ""),
                state=str(buyer.get("state") or ""),
                postal_code=str(buyer.get("postal_code") or ""),
                country=str(buyer.get("country") or ""),
            )
        )

        fill_rect(0, 0, page_w, page_h, (0.957, 0.965, 0.973))
        fill_rect(margin_x - 8, 20, content_w + 16, page_h - 40, (1, 1, 1))
        stroke_rect(margin_x - 8, 20, content_w + 16, page_h - 40)

        # Header band
        header_top = page_h - 28
        fill_rect(margin_x - 8, header_top - 78, content_w + 16, 78, header_rgb)
        text_at(margin_x + 8, header_top - 28, seller_name[:40], size=16, bold=True, rgb=(1, 1, 1))
        if seller.get("phone"):
            text_at(
                margin_x + 8,
                header_top - 44,
                f"Ph {str(seller.get('phone'))[:28]}",
                size=8,
                rgb=(0.90, 0.97, 0.95),
            )
        text_right(right_edge - 8, header_top - 18, f"GSTIN {seller.get('gstin') or '—'}", size=9, bold=True, rgb=(1, 1, 1))
        text_right(
            right_edge - 8,
            header_top - 36,
            str(payload.get("title") or "TAX INVOICE"),
            size=10,
            bold=True,
            rgb=(1, 1, 1),
        )
        text_right(right_edge - 8, header_top - 54, str(payload.get("number") or "—"), size=13, bold=True, rgb=(1, 1, 1))
        status = str(payload.get("status") or "").replace("_", " ").title()
        meta_line = f"Date {payload.get('date') or '—'}"
        if status:
            meta_line = f"{meta_line}  ·  {status[:16]}"
        text_right(right_edge - 8, header_top - 70, meta_line, size=8, rgb=(0.90, 0.97, 0.95))

        def party_rows(party: dict[str, Any], address: str) -> list[tuple[str, str]]:
            rows: list[tuple[str, str]] = [("GSTIN", str(party.get("gstin") or "—"))]
            if party.get("phone"):
                rows.append(("Phone", str(party.get("phone"))))
            if party.get("email"):
                rows.append(("Email", str(party.get("email"))))
            addr_lines = _pdf_wrap(address, width=34)[:3]
            for idx, chunk in enumerate(addr_lines):
                rows.append(("Address" if idx == 0 else "", chunk))
            return rows

        left_rows = party_rows(seller, seller_addr)
        right_rows = party_rows(buyer, buyer_addr)
        party_lines = max(len(left_rows), len(right_rows), 3)
        party_box_h = 36 + (party_lines * 12)
        party_top = header_top - 96
        party_bottom = party_top - party_box_h
        col_gap = 12.0
        col_w = (content_w - col_gap) / 2
        left_x = margin_x
        right_x = margin_x + col_w + col_gap

        fill_rect(left_x, party_bottom, col_w, party_box_h, soft_rgb)
        stroke_rect(left_x, party_bottom, col_w, party_box_h)
        fill_rect(right_x, party_bottom, col_w, party_box_h, soft_rgb)
        stroke_rect(right_x, party_bottom, col_w, party_box_h)
        text_at(left_x + 10, party_top - 14, "BILL FROM", size=8, bold=True, rgb=accent_rgb)
        text_at(right_x + 10, party_top - 14, "BILL TO", size=8, bold=True, rgb=accent_rgb)
        text_at(left_x + 10, party_top - 30, seller_name[:36], size=11, bold=True)
        text_at(right_x + 10, party_top - 30, buyer_name[:36], size=11, bold=True)

        def draw_party_details(x: float, rows: list[tuple[str, str]]) -> None:
            y = party_top - 46
            for label, value in rows:
                if label:
                    text_at(x + 10, y, label, size=7, rgb=muted_rgb)
                    text_at(x + 52, y, value[:36], size=8)
                else:
                    text_at(x + 52, y, value[:36], size=8)
                y -= 12

        draw_party_details(left_x, left_rows)
        draw_party_details(right_x, right_rows)

        # Table
        cols = {
            "idx": margin_x + 4,
            "item": margin_x + 28,
            "qty": margin_x + 250,
            "rate": margin_x + 310,
            "disc": margin_x + 372,
            "tax": margin_x + 434,
            "amt": right_edge - 4,
        }
        table_top = party_bottom - 18
        fill_rect(margin_x, table_top - 18, content_w, 20, soft_rgb)
        stroke_rect(margin_x, table_top - 18, content_w, 20)
        text_at(cols["idx"], table_top - 12, "#", size=8, bold=True, rgb=muted_rgb)
        text_at(cols["item"], table_top - 12, "ITEM", size=8, bold=True, rgb=muted_rgb)
        text_right(cols["qty"], table_top - 12, "QTY", size=8, bold=True, rgb=muted_rgb)
        text_right(cols["rate"], table_top - 12, "RATE", size=8, bold=True, rgb=muted_rgb)
        text_right(cols["disc"], table_top - 12, "DISC", size=8, bold=True, rgb=muted_rgb)
        text_right(cols["tax"], table_top - 12, "TAX", size=8, bold=True, rgb=muted_rgb)
        text_right(cols["amt"], table_top - 12, "AMOUNT", size=8, bold=True, rgb=muted_rgb)

        y = table_top - 34
        max_lines = 16
        for idx, line_row in enumerate(lines[:max_lines], start=1):
            text_at(cols["idx"], y, str(idx), size=8, rgb=muted_rgb)
            text_at(cols["item"], y, str(line_row.get("name") or "")[:30], size=9, bold=True)
            text_right(cols["qty"], y, str(line_row.get("qty") or ""), size=8)
            text_right(cols["rate"], y, money(line_row.get("rate")), size=8)
            text_right(cols["disc"], y, money(line_row.get("discount") or "0.00"), size=8)
            text_right(cols["tax"], y, money(line_row.get("tax")), size=8)
            text_right(cols["amt"], y, money(line_row.get("total")), size=9, bold=True)
            y -= 15
            if y < 220:
                break
        if len(lines) > max_lines:
            text_at(cols["item"], y, f"+ {len(lines) - max_lines} more items", size=8, rgb=muted_rgb)
            y -= 14
        hline(margin_x, right_edge, y + 6)

        # Totals + words
        totals_box_w = 230.0
        totals_x = right_edge - totals_box_w
        totals_rows: list[tuple[str, str, bool]] = []
        merchandise_gross = _q(payload.get("merchandise_gross") or "0")
        taxable_value = _q(payload.get("taxable_value") or payload.get("subtotal") or "0")
        product_discount = _q(
            payload.get("product_discount_total")
            if payload.get("product_discount_total") is not None
            else (payload.get("discount_total") or "0")
        )
        reward_discount = _q(payload.get("reward_discount") or "0")
        reward_points = int(payload.get("reward_points") or 0)
        if merchandise_gross > 0:
            totals_rows.append(("Items", money(merchandise_gross), False))
        if product_discount > 0:
            totals_rows.append(("Discount", f"-{money(product_discount)}", False))
        if reward_discount > 0:
            label = "Reward points"
            if reward_points > 0:
                label = f"Reward ({reward_points} pts)"
            totals_rows.append((label, f"-{money(reward_discount)}", False))
        totals_rows.append(("Taxable value", money(taxable_value), False))
        has_gst_split = False
        if _q(payload.get("igst_total")) > 0 or bool(payload.get("is_interstate")):
            totals_rows.append(
                ("IGST", money(payload.get("igst_total") or payload.get("tax_total")), False)
            )
            has_gst_split = True
        else:
            if _q(payload.get("cgst_total")) > 0:
                totals_rows.append(("CGST", money(payload.get("cgst_total")), False))
                has_gst_split = True
            if _q(payload.get("sgst_total")) > 0:
                totals_rows.append(("SGST", money(payload.get("sgst_total")), False))
                has_gst_split = True
        if not has_gst_split and _q(payload.get("tax_total")) > 0:
            totals_rows.append(("GST", money(payload.get("tax_total")), False))
        totals_rows.extend(
            [
                ("Total", money(payload.get("total")), True),
                ("Paid", money(payload.get("amount_paid")), False),
                ("Balance due", money(payload.get("amount_due")), True),
            ]
        )
        totals_h = 18 + (len(totals_rows) * 14)
        totals_top = y - 8
        totals_bottom = totals_top - totals_h
        fill_rect(totals_x, totals_bottom, totals_box_w, totals_h, soft_rgb)
        stroke_rect(totals_x, totals_bottom, totals_box_w, totals_h)
        y_t = totals_top - 14
        for label, value, emphasize in totals_rows:
            text_at(
                totals_x + 12,
                y_t,
                label,
                size=9,
                bold=emphasize,
                rgb=accent_rgb if emphasize else ink_rgb,
            )
            text_right(right_edge - 10, y_t, value, size=9, bold=emphasize)
            y_t -= 14

        words = _amount_in_words(payload.get("total"), currency)
        words_lines = _pdf_wrap(words, width=46)[:4]
        words_h = 28 + (len(words_lines) * 11)
        words_w = content_w - totals_box_w - 14
        words_bottom = totals_top - words_h
        fill_rect(margin_x, words_bottom, words_w, words_h, (0.910, 0.965, 0.957))
        stroke_rect(margin_x, words_bottom, words_w, words_h, accent_rgb)
        text_at(margin_x + 10, totals_top - 14, "Amount in words", size=8, bold=True, rgb=accent_rgb)
        wy = totals_top - 28
        for chunk in words_lines:
            text_at(margin_x + 10, wy, chunk, size=8)
            wy -= 11

        footer_y = min(words_bottom, totals_bottom) - 24
        due = _q(payload.get("amount_due"))
        if due > 0:
            text_at(margin_x, footer_y, f"Amount due  {money(due)}", size=11, bold=True, rgb=(0.47, 0.21, 0.0))
            footer_y -= 14
            if seller.get("upi_vpa"):
                text_at(margin_x, footer_y, f"Pay via UPI: {seller.get('upi_vpa')}", size=9, bold=True)
                footer_y -= 14
        if payload.get("notes"):
            text_at(margin_x, footer_y, f"Notes: {str(payload.get('notes'))[:95]}", size=8, rgb=muted_rgb)
            footer_y -= 12
        if payload.get("irn"):
            text_at(margin_x, footer_y, f"IRN: {payload.get('irn')}", size=8, rgb=muted_rgb)
            footer_y -= 12
        text_at(margin_x, 36, "This is a computer-generated document.", size=8, rgb=muted_rgb)

        return _pdf_bytes(ops, width=int(page_w), height=int(page_h))

    def _build_thermal_pdf(self, payload: dict[str, Any]) -> bytes:
        seller = payload.get("seller") or {}
        buyer = payload.get("buyer") or {}
        lines = list(payload.get("lines") or [])
        currency = str(payload.get("currency") or "INR")
        width = 226.0
        left = 12.0
        right = width - 12.0
        center = width / 2.0

        # Estimate height so long bills are not clipped.
        estimated = 170
        estimated += min(len(lines), 30) * 22
        if buyer.get("phone") or buyer.get("email") or buyer.get("address") or buyer.get("gstin"):
            estimated += 40
        if _q(payload.get("amount_due")) > 0 and seller.get("upi_vpa"):
            estimated += 20
        if payload.get("notes"):
            estimated += 16
        height = float(max(420, min(estimated, 1400)))
        ops: list[str] = []

        def text_at(
            x: float,
            y: float,
            content: str,
            *,
            size: float = 8,
            bold: bool = False,
        ) -> None:
            font = "/F2" if bold else "/F1"
            ops.append("BT")
            ops.append(f"{font} {size:.1f} Tf")
            ops.append("0 0 0 rg")
            ops.append(f"1 0 0 1 {x:.1f} {y:.1f} Tm ({_pdf_escape(content)}) Tj")
            ops.append("ET")

        def text_center(y: float, content: str, *, size: float = 8, bold: bool = False) -> None:
            text_at(center - (_pdf_text_width(content, size) / 2), y, content, size=size, bold=bold)

        def text_right(y: float, content: str, *, size: float = 8, bold: bool = False) -> None:
            text_at(right - _pdf_text_width(content, size), y, content, size=size, bold=bold)

        def rule(y: float, *, dashed: bool = False) -> None:
            ops.append("0.45 0.45 0.45 RG 0.8 w")
            if dashed:
                # Even dash pattern across the full printable width (visually centered).
                ops.append("[2.5 2] 0 d")
            else:
                ops.append("[] 0 d")
            ops.append(f"{left:.1f} {y:.1f} m {right:.1f} {y:.1f} l S")
            ops.append("[] 0 d")

        def money(value: Any) -> str:
            return _money_with_currency(value, currency, for_pdf=True)

        y = height - 18
        shop = str(seller.get("name") or seller.get("display_name") or "Shop")
        text_center(y, shop[:28], size=11, bold=True)
        y -= 12
        text_center(y, f"GSTIN {seller.get('gstin') or '—'}"[:34], size=7)
        y -= 10
        if seller.get("phone"):
            text_center(y, f"Ph {str(seller.get('phone'))[:26]}", size=7)
            y -= 10
        if seller.get("address"):
            for chunk in _pdf_wrap(str(seller.get("address")), width=30)[:2]:
                text_center(y, chunk, size=7)
                y -= 9
        y -= 2
        rule(y)
        y -= 12
        text_center(y, str(payload.get("title") or "INVOICE"), size=9, bold=True)
        y -= 11
        text_center(y, str(payload.get("number") or "—"), size=8, bold=True)
        y -= 10
        text_center(y, f"Date {payload.get('date') or '—'}", size=7)
        y -= 12
        rule(y, dashed=True)
        y -= 12
        text_at(left, y, "Bill to", size=7, bold=True)
        y -= 10
        text_at(left, y, str(buyer.get("name") or "Walk-in customer")[:30], size=8, bold=True)
        y -= 10
        if buyer.get("gstin"):
            text_at(left, y, f"GSTIN {str(buyer.get('gstin'))[:24]}", size=7)
            y -= 9
        if buyer.get("phone"):
            text_at(left, y, f"Ph {str(buyer.get('phone'))[:26]}", size=7)
            y -= 9
        if buyer.get("email"):
            text_at(left, y, str(buyer.get("email"))[:30], size=7)
            y -= 9
        if buyer.get("address"):
            for chunk in _pdf_wrap(str(buyer.get("address")), width=30)[:2]:
                text_at(left, y, chunk, size=7)
                y -= 9
        y -= 2
        rule(y)
        y -= 12
        text_at(left, y, "ITEM", size=7, bold=True)
        text_right(y, "AMOUNT", size=7, bold=True)
        y -= 10
        rule(y, dashed=True)
        y -= 12

        for line_row in lines[:30]:
            name = str(line_row.get("name") or "")
            for i, chunk in enumerate(_pdf_wrap(name, width=28)[:2]):
                text_at(left, y, chunk, size=8, bold=i == 0)
                y -= 9
            disc = _q(line_row.get("discount"))
            detail = f"{line_row.get('qty')} x {money(line_row.get('rate'))}"
            if disc > 0:
                detail += f" disc {money(disc)}"
            text_at(left, y, detail[:32], size=7)
            text_right(y, money(line_row.get("total")), size=8, bold=True)
            y -= 12
            if y < 90:
                text_at(left, y, "...", size=8)
                y -= 10
                break

        rule(y)
        y -= 12

        def tot(label: str, value: Any, *, bold: bool = False) -> None:
            nonlocal y
            text_at(left, y, label, size=8, bold=bold)
            text_right(y, money(value), size=8, bold=bold)
            y -= 11

        merchandise_gross = _q(payload.get("merchandise_gross") or "0")
        product_discount = _q(
            payload.get("product_discount_total")
            if payload.get("product_discount_total") is not None
            else (payload.get("discount_total") or "0")
        )
        reward_discount = _q(payload.get("reward_discount") or "0")
        reward_points = int(payload.get("reward_points") or 0)
        if merchandise_gross > 0:
            tot("Items", merchandise_gross)
        if product_discount > 0:
            tot("Discount", -product_discount)
        if reward_discount > 0:
            label = f"Rewards ({reward_points} pts)" if reward_points > 0 else "Reward points"
            tot(label, -reward_discount)
        tot("Taxable", payload.get("taxable_value") or payload.get("subtotal"))
        if _q(payload.get("igst_total")) > 0 or bool(payload.get("is_interstate")):
            tot("IGST", payload.get("igst_total") or payload.get("tax_total"))
        else:
            if _q(payload.get("cgst_total")) > 0:
                tot("CGST", payload.get("cgst_total"))
            if _q(payload.get("sgst_total")) > 0:
                tot("SGST", payload.get("sgst_total"))
            elif _q(payload.get("tax_total")) > 0 and _q(payload.get("cgst_total")) <= 0:
                tot("GST", payload.get("tax_total"))
        rule(y, dashed=True)
        y -= 12
        tot("TOTAL", payload.get("total"), bold=True)
        tot("Paid", payload.get("amount_paid"))
        tot("Due", payload.get("amount_due"), bold=True)
        if _q(payload.get("amount_due")) > 0 and seller.get("upi_vpa"):
            y -= 2
            text_center(y, f"UPI {seller.get('upi_vpa')}", size=8, bold=True)
            y -= 12
        if payload.get("notes"):
            for chunk in _pdf_wrap(f"Note: {payload.get('notes')}", width=30)[:2]:
                text_at(left, y, chunk, size=7)
                y -= 9
        y -= 4
        rule(y, dashed=True)
        y -= 14
        text_center(y, "Thank you!", size=9, bold=True)
        return _pdf_bytes(ops, width=int(width), height=int(height))

    @transaction.atomic
    def create_share_link(
        self,
        *,
        tenant: Tenant,
        business: Business,
        kind: str,
        document_id: UUID | str,
        expires_days: int = DEFAULT_SHARE_DAYS,
        created_by_user_id: UUID | str | None = None,
    ) -> ShopDocumentShareLink:
        kind_key, _obj = self.resolve(
            tenant=tenant, business=business, kind=kind, document_id=document_id
        )
        existing = (
            ShopDocumentShareLink.objects.filter(
                tenant=tenant,
                business=business,
                kind=kind_key,
                document_id=document_id,
                deleted_at__isnull=True,
            )
            .order_by("-created_at")
            .first()
        )
        if existing is not None and not self._share_expired(existing):
            return existing
        expires_at = timezone.now() + timedelta(days=max(1, int(expires_days or DEFAULT_SHARE_DAYS)))
        return ShopDocumentShareLink.objects.create(
            tenant=tenant,
            business=business,
            kind=kind_key,
            document_id=document_id,
            token=secrets.token_urlsafe(SHARE_TOKEN_BYTES),
            expires_at=expires_at,
            created_by_user_id=created_by_user_id,
        )

    def public_url_for(self, link: ShopDocumentShareLink) -> str:
        base = frontend_base_url() or str(getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
        return f"{base}/open/shop-doc/{link.token}"

    def api_public_url_for(self, link: ShopDocumentShareLink) -> str:
        api = str(getattr(settings, "API_BASE_URL", "") or "").rstrip("/")
        if not api:
            api = str(getattr(settings, "BACKEND_PUBLIC_URL", "") or "").rstrip("/")
        if not api:
            return f"/api/v1/public/shop-docs/{link.token}"
        return f"{api}/api/v1/public/shop-docs/{link.token}"

    def get_share_by_token(self, token: str) -> ShopDocumentShareLink:
        link = get_object_or_404(ShopDocumentShareLink, token=str(token or "").strip())
        if self._share_expired(link):
            raise ValidationError({"token": "This share link has expired."})
        if link.max_views is not None and link.view_count >= link.max_views:
            raise ValidationError({"token": "This share link has reached its view limit."})
        return link

    def touch_share_view(self, link: ShopDocumentShareLink) -> None:
        ShopDocumentShareLink.objects.filter(id=link.id).update(view_count=link.view_count + 1)

    @staticmethod
    def _share_expired(link: ShopDocumentShareLink) -> bool:
        if link.expires_at is None:
            return False
        return link.expires_at <= timezone.now()

    def share_message(self, payload: dict[str, Any], *, remind_payment: bool = False) -> str:
        business = str((payload.get("seller") or {}).get("display_name") or (payload.get("seller") or {}).get("name") or "Shop")
        number = str(payload.get("number") or "")
        total = _money(payload.get("total"))
        currency = str(payload.get("currency") or "INR")
        url = str(payload.get("public_url") or "")
        title = str(payload.get("short_title") or "Document")
        if remind_payment and _q(payload.get("amount_due")) > 0:
            due = _money(payload.get("amount_due"))
            base = f"{business}: payment reminder for {title} {number}. Due {currency} {due}."
        else:
            base = f"{business}: your {title} {number} for {currency} {total}."
        if url:
            return f"{base} View: {url}"
        return base

    def send_document(
        self,
        *,
        tenant: Tenant,
        business: Business,
        kind: str,
        document_id: UUID | str,
        channels: list[str],
        to_phone: str = "",
        to_email: str = "",
        remind_payment: bool = False,
        user=None,
    ) -> dict[str, Any]:
        link = self.create_share_link(
            tenant=tenant,
            business=business,
            kind=kind,
            document_id=document_id,
            created_by_user_id=getattr(user, "id", None),
        )
        public_url = self.public_url_for(link)
        payload = self.build_payload(
            tenant=tenant,
            business=business,
            kind=kind,
            document_id=document_id,
            public_url=public_url,
        )
        wanted = {str(c).strip().lower() for c in (channels or []) if str(c).strip()}
        results: dict[str, Any] = {"public_url": public_url, "channels": {}}
        message = self.share_message(payload, remind_payment=remind_payment)
        phone = format_contact_phone(to_phone or payload.get("customer_phone") or "", e164=True)
        email = str(to_email or payload.get("customer_email") or "").strip()

        if "sms" in wanted:
            results["channels"]["sms"] = {
                "status": "device_only",
                "detail": "SMS provider is not enabled. Use device SMS share with the link.",
                "message": message,
                "phone": phone,
            }

        if "email" in wanted:
            if not email:
                results["channels"]["email"] = {"status": "skipped", "detail": "No email address."}
            else:
                results["channels"]["email"] = self._send_email(
                    tenant=tenant,
                    business=business,
                    payload=payload,
                    email=email,
                    message=message,
                    remind_payment=remind_payment,
                )

        if "whatsapp" in wanted:
            results["channels"]["whatsapp"] = self._send_whatsapp(
                tenant=tenant,
                business=business,
                payload=payload,
                phone=phone,
                message=message,
                public_url=public_url,
            )

        return results

    def _send_email(
        self,
        *,
        tenant: Tenant,
        business: Business,
        payload: dict[str, Any],
        email: str,
        message: str,
        remind_payment: bool,
    ) -> dict[str, Any]:
        from django.core.mail import EmailMultiAlternatives

        from apps.notifications.services.branding import business_email_brand
        from apps.notifications.services.providers.email import build_branded_email_html

        brand = business_email_brand(business)
        subject = (
            f"Payment reminder · {payload.get('number')}"
            if remind_payment
            else f"{payload.get('short_title')} {payload.get('number')} from {brand.get('business_name') or business.display_name}"
        )
        html_body = build_branded_email_html(
            subject=subject,
            body=message,
            business_name=str(brand.get("business_name") or business.display_name or ""),
            logo_url=str(brand.get("business_logo") or ""),
            accent_color=str(brand.get("accent_color") or "#0f6b72"),
            cta_label="View document",
            cta_url=str(payload.get("public_url") or ""),
            headline=str(payload.get("title") or "Document"),
        )
        pdf = self.build_pdf(payload, layout=LAYOUT_A4)
        message_obj = EmailMultiAlternatives(
            subject=subject,
            body=message,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            to=[email],
        )
        message_obj.attach_alternative(html_body, "text/html")
        filename = f"{payload.get('number') or 'document'}.pdf".replace(" ", "_")
        message_obj.attach(filename, pdf, "application/pdf")
        message_obj.send(fail_silently=False)
        return {"status": "sent", "to": email}

    def _send_whatsapp(
        self,
        *,
        tenant: Tenant,
        business: Business,
        payload: dict[str, Any],
        phone: str,
        message: str,
        public_url: str,
    ) -> dict[str, Any]:
        from apps.notifications.services.whatsapp_send import send_whatsapp_for_event

        kind = str(payload.get("kind") or "")
        event_map = {
            ShopDocumentKind.SALE: "ShopSaleInvoiceShared",
            ShopDocumentKind.QUOTATION: "ShopQuotationShared",
            ShopDocumentKind.DELIVERY_CHALLAN: "ShopDeliveryChallanShared",
        }
        event_type = event_map.get(kind, "ShopSaleInvoiceShared")
        customer = None
        customer_id = payload.get("customer_id")
        if customer_id:
            customer = Customer.objects.filter(tenant=tenant, business=business, id=customer_id).first()

        notification = send_whatsapp_for_event(
            tenant=tenant,
            business=business,
            event_type=event_type,
            audience="customer",
            customer=customer,
            context={
                "customer_name": str((payload.get("buyer") or {}).get("name") or "Customer"),
                "business_name": str((payload.get("seller") or {}).get("display_name") or business.display_name),
                "document_number": str(payload.get("number") or ""),
                "amount": f"{payload.get('currency') or 'INR'} {_money(payload.get('total'))}",
                "document_link": public_url,
            },
            extra_metadata={"kind": kind, "document_id": str(payload.get("id") or "")},
        )
        if notification is None:
            return {
                "status": "device_fallback",
                "detail": "WhatsApp template not configured or not opted in. Use device WhatsApp share.",
                "message": message,
                "phone": phone,
            }
        status_value = getattr(notification, "status", None)
        return {
            "status": "sent" if str(status_value) == "sent" else str(status_value or "queued"),
            "phone": phone,
            "notification_id": str(notification.id),
        }


def _pdf_bytes(ops: list[str], *, width: int, height: int) -> bytes:
    stream = "\n".join(ops).encode("latin-1", errors="replace")
    objects = [
        b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
        b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
        (
            f"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] "
            "/Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>endobj\n"
        ).encode(),
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
