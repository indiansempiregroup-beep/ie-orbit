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
from apps.customers.models import Customer, CustomerLoyaltyAccount
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


# Adobe Helvetica / Helvetica-Bold advance widths (1/1000 em). Used so right-aligned
# column headers and money values share the same edge in hand-built PDFs.
_HELVETICA_WIDTHS: dict[str, int] = {
    " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191,
    "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
    "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
    "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556,
    "@": 1015, "A": 667, "B": 667, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778,
    "H": 722, "I": 278, "J": 500, "K": 667, "L": 556, "M": 833, "N": 722, "O": 778,
    "P": 667, "Q": 778, "R": 722, "S": 667, "T": 611, "U": 722, "V": 667, "W": 944,
    "X": 667, "Y": 667, "Z": 611, "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556,
    "`": 333, "a": 556, "b": 556, "c": 500, "d": 556, "e": 556, "f": 278, "g": 556,
    "h": 556, "i": 222, "j": 222, "k": 500, "l": 222, "m": 833, "n": 556, "o": 556,
    "p": 556, "q": 556, "r": 333, "s": 500, "t": 278, "u": 556, "v": 500, "w": 722,
    "x": 500, "y": 500, "z": 500, "{": 334, "|": 260, "}": 334, "~": 584,
}
_HELVETICA_BOLD_WIDTHS: dict[str, int] = {
    " ": 278, "!": 333, '"': 474, "#": 556, "$": 556, "%": 889, "&": 722, "'": 238,
    "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
    "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
    "8": 556, "9": 556, ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611,
    "@": 975, "A": 722, "B": 722, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778,
    "H": 722, "I": 278, "J": 556, "K": 722, "L": 611, "M": 833, "N": 722, "O": 778,
    "P": 667, "Q": 778, "R": 722, "S": 667, "T": 611, "U": 722, "V": 667, "W": 944,
    "X": 667, "Y": 667, "Z": 611, "[": 333, "\\": 278, "]": 333, "^": 584, "_": 556,
    "`": 333, "a": 556, "b": 611, "c": 556, "d": 611, "e": 556, "f": 333, "g": 611,
    "h": 611, "i": 278, "j": 278, "k": 556, "l": 278, "m": 889, "n": 611, "o": 611,
    "p": 611, "q": 611, "r": 389, "s": 556, "t": 333, "u": 611, "v": 556, "w": 778,
    "x": 556, "y": 556, "z": 500, "{": 389, "|": 280, "}": 389, "~": 584,
}


def _pdf_text_width(content: str, size: float, *, bold: bool = False) -> float:
    """Exact-ish Helvetica advance width for right-aligned PDF columns."""
    table = _HELVETICA_BOLD_WIDTHS if bold else _HELVETICA_WIDTHS
    total = 0
    for ch in str(content or ""):
        total += table.get(ch, 556)
    return total * size / 1000.0


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


def _pdf_wrap_to_width(
    text: str,
    *,
    size: float,
    max_w: float,
    bold: bool = False,
) -> list[str]:
    """Word-wrap using Helvetica advance width so PDF columns do not overflow."""
    raw = re.sub(r"\s+", " ", str(text or "").strip())
    if not raw:
        return []
    if _pdf_text_width(raw, size, bold=bold) <= max_w:
        return [raw]

    def _fit_prefix(chunk: str) -> str:
        if _pdf_text_width(chunk, size, bold=bold) <= max_w:
            return chunk
        lo, hi, best = 1, len(chunk), 1
        while lo <= hi:
            mid = (lo + hi) // 2
            if _pdf_text_width(chunk[:mid], size, bold=bold) <= max_w:
                best = mid
                lo = mid + 1
            else:
                hi = mid - 1
        return chunk[:best]

    words = raw.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip() if current else word
        if _pdf_text_width(candidate, size, bold=bold) <= max_w:
            current = candidate
            continue
        if current:
            lines.append(current)
            current = ""
        while word and _pdf_text_width(word, size, bold=bold) > max_w:
            piece = _fit_prefix(word)
            if not piece:
                break
            lines.append(piece)
            word = word[len(piece) :]
        current = word
    if current:
        lines.append(current)
    return lines


def _pdf_party_detail_rows(
    party: dict[str, Any],
    address: str,
    *,
    size: float,
    max_w: float,
    max_addr_lines: int = 8,
) -> list[tuple[str, str, bool]]:
    """Labeled party rows for PDF/thermal: (label, value, bold_value)."""
    rows: list[tuple[str, str, bool]] = []
    if party.get("gstin"):
        rows.append(("GSTIN", str(party.get("gstin") or "").strip(), True))
    if party.get("phone"):
        rows.append(("Phone", str(party.get("phone") or "").strip(), True))
    if party.get("email"):
        rows.append(("Email", str(party.get("email") or "").strip(), True))
    if address:
        addr_chunks = _pdf_wrap_to_width(address, size=size, max_w=max_w, bold=True)[:max_addr_lines]
        for idx, chunk in enumerate(addr_chunks):
            rows.append(("Address" if idx == 0 else "", chunk, True))
    return rows


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


_PLUS_CODE_RE = re.compile(r"\b[A-Z0-9]{2,8}\+[A-Z0-9]{2,3}\b,?\s*", re.IGNORECASE)


def _strip_plus_codes(text: str) -> str:
    """Remove Google Open Location Codes (e.g. FR5W+JFH) from display addresses."""
    cleaned = _PLUS_CODE_RE.sub("", str(text or "").strip())
    cleaned = re.sub(r"\s*,\s*,+", ", ", cleaned)
    return cleaned.strip(" ,")


def _address_part_present(haystack: str, needle: str) -> bool:
    part = str(needle or "").strip().lower()
    if not part:
        return True
    return part in str(haystack or "").lower()


def _format_address_parts(
    *,
    line1: str = "",
    line2: str = "",
    city: str = "",
    state: str = "",
    postal_code: str = "",
    country: str = "",
) -> str:
    """Build a readable single-line address for invoices.

    Prefers door-level detail (line2) the customer typed, strips map plus-codes,
    and avoids repeating city/state/PIN/country when the street line already has them.
    """
    street_main = _strip_plus_codes(line1)
    door = str(line2 or "").strip()
    if door and street_main and door.lower() in street_main.lower():
        street = street_main
    else:
        street = ", ".join(p for p in [door, street_main] if p)

    locality_parts: list[str] = []
    for part in (city, state, postal_code):
        value = str(part or "").strip()
        if value and not _address_part_present(street, value):
            locality_parts.append(value)
    locality = ", ".join(locality_parts)

    country_part = str(country or "").strip()
    if country_part and (
        _address_part_present(street, country_part) or _address_part_present(locality, country_part)
    ):
        country_part = ""

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


def _lines_with_product_discount_only(
    lines: list[dict[str, Any]],
    *,
    product_discount_total: Decimal,
    bill_level_discount: Decimal,
) -> list[dict[str, Any]]:
    """Show only product-level ₹ in the Disc column; bill/coupon stay in the summary."""
    if _q(bill_level_discount) <= 0:
        return lines
    folded = sum((_q(line.get("discount") or "0") for line in lines), Decimal("0.00"))
    if folded <= 0:
        return lines
    product_total = max(Decimal("0.00"), _q(product_discount_total))
    remaining = product_total
    adjusted: list[dict[str, Any]] = []
    for index, line in enumerate(lines):
        folded_disc = _q(line.get("discount") or "0")
        if index == len(lines) - 1:
            product_part = remaining
        elif product_total > 0 and folded > 0:
            product_part = (product_total * folded_disc / folded).quantize(Decimal("0.01"))
            remaining -= product_part
        else:
            product_part = Decimal("0.00")
        if product_part < 0:
            product_part = Decimal("0.00")
        if product_part > folded_disc:
            product_part = folded_disc
        adjusted.append({**line, "discount": _dec_str(product_part)})
    return adjusted


def _loyalty_from_metadata(metadata: Any) -> dict[str, Any]:
    meta = metadata if isinstance(metadata, dict) else {}
    loyalty = meta.get("loyalty") if isinstance(meta.get("loyalty"), dict) else {}
    billing = meta.get("billing") if isinstance(meta.get("billing"), dict) else {}
    pos = meta.get("pos") if isinstance(meta.get("pos"), dict) else {}
    reward_discount = _q(loyalty.get("discount_amount") or billing.get("reward_discount") or "0")
    reward_points = int(loyalty.get("points_redeemed") or billing.get("reward_points") or 0)
    points_earned = int(loyalty.get("points_earned") or billing.get("points_earned") or 0)
    points_to_earn = int(billing.get("points_to_earn") or pos.get("points_to_earn") or 0)
    award = billing.get("award_loyalty_points")
    if award is None:
        award = pos.get("award_loyalty_points")
    award_loyalty = award is not False
    return {
        "reward_discount": reward_discount,
        "reward_points": max(0, reward_points),
        "points_earned": max(0, points_earned),
        "points_to_earn": max(0, points_to_earn),
        "award_loyalty_points": award_loyalty,
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
            order_mode = str(getattr(linked_order, "fulfillment_mode", "") or "").strip().lower()
            # Online delivery: selected checkout address. POS: stamped default from
            # customer details (or live default when older POS orders have none).
            delivery_line = str(getattr(linked_order, "delivery_address", "") or "").strip()
            use_order_address = bool(delivery_line) and (
                order_mode == "delivery" or order_mode == "pos"
            )
            if use_order_address:
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
    payment_meta = metadata.get("payment") if isinstance(metadata.get("payment"), dict) else {}
    order_pos = order_meta.get("pos") if isinstance(order_meta.get("pos"), dict) else {}
    payment_method = str(
        payment_meta.get("method")
        or order_pos.get("payment_method")
        or ""
    ).strip().lower()
    payment_label = {
        "cash": "Cash",
        "upi": "UPI",
        "card": "Card",
        "borrow": "Credit",
        "razorpay": "Online (Razorpay)",
        "cashfree": "Online (Cashfree)",
    }.get(payment_method, payment_method.upper() if payment_method else "")
    date_value = voucher.voucher_date.isoformat() if voucher.voucher_date else ""
    number = voucher.voucher_number
    lines = _normalize_lines(voucher.line_items if isinstance(voucher.line_items, list) else [])
    rollups = _line_rollups(lines)
    loyalty = _loyalty_from_metadata(metadata)
    order_loyalty = _loyalty_from_metadata(order_meta)
    if loyalty["reward_discount"] <= 0 and order_loyalty["reward_discount"] > 0:
        loyalty = {**loyalty, **order_loyalty}
    else:
        if int(loyalty.get("points_earned") or 0) <= 0:
            loyalty["points_earned"] = int(order_loyalty.get("points_earned") or 0)
        if int(loyalty.get("points_to_earn") or 0) <= 0:
            loyalty["points_to_earn"] = int(order_loyalty.get("points_to_earn") or 0)
        if int(loyalty.get("reward_points") or 0) <= 0:
            loyalty["reward_points"] = int(order_loyalty.get("reward_points") or 0)
            if loyalty["reward_discount"] <= 0:
                loyalty["reward_discount"] = order_loyalty["reward_discount"]
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
    billing_meta = metadata.get("billing") if isinstance(metadata.get("billing"), dict) else {}
    # Prefer persisted POS billing snapshot (product vs bill discount split).
    if billing_meta.get("merchandise_gross") not in (None, ""):
        merchandise_gross = _q(billing_meta.get("merchandise_gross"))
    line_discount_total = _q(
        billing_meta.get("line_discount_total")
        if billing_meta.get("line_discount_total") not in (None, "")
        else order_pos.get("line_discount_total")
        or "0"
    )
    if billing_meta.get("bill_discount_amount") not in (None, ""):
        bill_discount_total = _q(billing_meta.get("bill_discount_amount"))
    else:
        combined_bill = _q(order_pos.get("bill_discount_amount") or "0")
        bill_discount_total = max(Decimal("0.00"), combined_bill - reward_discount)
    if billing_meta.get("reward_discount") not in (None, ""):
        reward_discount = _q(billing_meta.get("reward_discount"))
    if billing_meta.get("reward_points") not in (None, ""):
        loyalty = {
            **loyalty,
            "reward_points": int(billing_meta.get("reward_points") or 0),
            "reward_discount": reward_discount,
        }
    # Prefer credited earn; for paid bills fall back to expected earn from POS.
    points_earned = int(loyalty.get("points_earned") or 0)
    points_to_earn = int(loyalty.get("points_to_earn") or 0)
    if points_to_earn <= 0:
        points_to_earn = int(order_pos.get("points_to_earn") or billing_meta.get("points_to_earn") or 0)
    pay_status = str(
        payment_meta.get("status")
        or order_pos.get("payment_status")
        or ("paid" if due <= 0 else "partially_paid" if paid > 0 else "due")
    ).lower()
    award_loyalty = loyalty.get("award_loyalty_points")
    if award_loyalty is None:
        award_loyalty = order_pos.get("award_loyalty_points")
    award_loyalty = award_loyalty is not False

    loyalty_enabled = False
    points_balance = 0
    source_booking_id = str(metadata.get("source_booking_id") or "").strip()
    try:
        from apps.customers.services.loyalty import LoyaltyService

        loyalty_svc = LoyaltyService()
        loyalty_enabled = loyalty_svc.is_program_active(business=business)
        if loyalty_enabled:
            customer = getattr(voucher, "customer", None)
            if customer is None and linked_order is not None:
                customer = getattr(linked_order, "customer", None)
            if customer is not None:
                account = (
                    CustomerLoyaltyAccount.objects.filter(
                        tenant=voucher.tenant,
                        business=business,
                        customer=customer,
                    )
                    .only("points_balance")
                    .first()
                )
                if account is not None:
                    points_balance = int(account.points_balance or 0)
            # Booking invoices earn from service.loyalty_points_earn, not shop spend rate.
            if source_booking_id:
                booking_earn = int(
                    loyalty_svc.credited_earn_for_booking(
                        tenant=voucher.tenant, booking_id=source_booking_id
                    )
                    or 0
                )
                if booking_earn <= 0:
                    try:
                        from apps.bookings.models import Booking

                        booking = (
                            Booking.objects.require_tenant(voucher.tenant)
                            .prefetch_related("line_items")
                            .filter(id=source_booking_id, business=business)
                            .first()
                        )
                        if booking is not None:
                            booking_earn = int(
                                loyalty_svc.expected_earn_for_booking(
                                    tenant=voucher.tenant,
                                    business=business,
                                    booking=booking,
                                )
                                or 0
                            )
                    except Exception:
                        booking_earn = 0
                if booking_earn > 0:
                    points_earned = booking_earn
                    points_to_earn = booking_earn
    except Exception:
        loyalty_enabled = False
        points_balance = 0

    if not loyalty_enabled:
        points_earned = 0
        points_to_earn = 0
        pending_earn = 0
        award_loyalty = False
    else:
        if points_earned <= 0 and award_loyalty and points_to_earn > 0 and pay_status in {"paid", "settled"}:
            points_earned = points_to_earn
        pending_earn = 0
        if (
            points_earned <= 0
            and award_loyalty
            and points_to_earn > 0
            and pay_status not in {"paid", "settled"}
        ):
            pending_earn = points_to_earn
        # Booking sale vouchers are marked paid at completion — never leave pending earn.
        if source_booking_id and points_earned > 0:
            pending_earn = 0
    coupon_meta = metadata.get("coupon") if isinstance(metadata.get("coupon"), dict) else {}
    if not coupon_meta and isinstance(order_meta.get("coupon"), dict):
        coupon_meta = order_meta.get("coupon") or {}
    coupon_code = str(coupon_meta.get("code") or "").strip()
    coupon_discount = _q(coupon_meta.get("discount_amount") or "0")
    line_total_sum = sum((_q(line.get("total") or "0") for line in lines), Decimal("0.00"))
    (
        line_discount_total,
        bill_discount_total,
        coupon_discount,
        reward_discount,
    ) = _reconcile_discount_parts(
        merchandise_gross=merchandise_gross,
        line_total_sum=line_total_sum,
        line_discount_total=line_discount_total,
        bill_discount_total=bill_discount_total,
        coupon_discount=coupon_discount,
        coupon_code=coupon_code,
        reward_discount=reward_discount,
        voucher_discount_total=discount_total,
    )
    loyalty = {**loyalty, "reward_discount": reward_discount}
    merchandise_after_line = max(Decimal("0.00"), merchandise_gross - line_discount_total)
    bill_level_discount = bill_discount_total + coupon_discount + reward_discount
    lines = _lines_with_product_discount_only(
        lines,
        product_discount_total=line_discount_total,
        bill_level_discount=bill_level_discount,
    )
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
        "merchandise_after_line_discount": _dec_str(merchandise_after_line),
        "subtotal": _dec_str(taxable_value),
        "taxable_value": _dec_str(taxable_value),
        "discount_total": _dec_str(discount_total),
        "line_discount_total": _dec_str(line_discount_total),
        "product_discount_total": _dec_str(line_discount_total),
        "bill_discount_total": _dec_str(bill_discount_total),
        "coupon_code": coupon_code,
        "coupon_discount": _dec_str(coupon_discount),
        "reward_discount": _dec_str(reward_discount),
        "reward_points": loyalty["reward_points"],
        "points_used": loyalty["reward_points"],
        "points_earned": int(points_earned),
        "points_to_earn": int(pending_earn),
        "loyalty_enabled": bool(loyalty_enabled),
        "points_balance": int(points_balance),
        "tax_total": _dec_str(tax_total),
        "cgst_total": _dec_str(cgst),
        "sgst_total": _dec_str(sgst),
        "igst_total": _dec_str(igst),
        "total": _dec_str(total),
        "amount_paid": _dec_str(paid),
        "amount_due": _dec_str(due),
        "payment_method": payment_method,
        "payment_label": payment_label,
        "payment_status": str(
            payment_meta.get("status")
            or order_pos.get("payment_status")
            or ("paid" if due <= 0 else "partially_paid" if paid > 0 else "due")
        ),
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


def _reconcile_discount_parts(
    *,
    merchandise_gross: Decimal,
    line_total_sum: Decimal,
    line_discount_total: Decimal,
    bill_discount_total: Decimal,
    coupon_discount: Decimal,
    coupon_code: str,
    reward_discount: Decimal,
    voucher_discount_total: Decimal,
) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    """Split discounts for invoice display without double-counting.

    POS stores coupon savings inside ``pos.bill_discount_amount`` (coupon replaces
    bill discount at create time). Older orders may also store a percent coupon
    against exclusive merchandise while the line fold uses inclusive savings.
    Always anchor to actual shelf savings: gross items − sum(line totals).
    """
    actual = max(Decimal("0.00"), _q(merchandise_gross) - _q(line_total_sum))
    if actual <= 0:
        actual = max(Decimal("0.00"), _q(voucher_discount_total))

    line_disc = max(Decimal("0.00"), _q(line_discount_total))
    if line_disc > actual:
        line_disc = actual
    remaining = max(Decimal("0.00"), actual - line_disc)

    reward = max(Decimal("0.00"), min(_q(reward_discount), remaining))
    remaining_after_reward = max(Decimal("0.00"), remaining - reward)

    has_coupon = bool(str(coupon_code or "").strip()) or _q(coupon_discount) > 0
    if has_coupon:
        # Coupon is the bill-level reduction; never also show bill discount.
        bill = Decimal("0.00")
        coupon = remaining_after_reward
    else:
        bill = max(Decimal("0.00"), min(_q(bill_discount_total), remaining_after_reward))
        coupon = Decimal("0.00")
        if bill <= 0 and remaining_after_reward > 0:
            # Legacy lumped bill/product discount with no line split.
            if line_disc <= 0:
                bill = remaining_after_reward
            else:
                # Keep product discount; leftover is bill.
                bill = remaining_after_reward

    return line_disc, bill, coupon, reward


def _pos_bill_summary_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize POS-style bill summary fields for HTML / PDF / thermal."""
    merchandise_gross = _q(payload.get("merchandise_gross") or "0")
    line_discount = _q(
        payload.get("line_discount_total")
        if payload.get("line_discount_total") is not None
        else (
            payload.get("product_discount_total")
            if payload.get("product_discount_total") is not None
            else "0"
        )
    )
    after_line = _q(
        payload.get("merchandise_after_line_discount")
        if payload.get("merchandise_after_line_discount") not in (None, "")
        else max(Decimal("0.00"), merchandise_gross - line_discount)
    )
    bill_discount = _q(payload.get("bill_discount_total") or "0")
    coupon_discount = _q(payload.get("coupon_discount") or "0")
    coupon_code = str(payload.get("coupon_code") or "").strip()
    reward_discount = _q(payload.get("reward_discount") or "0")
    reward_points = int(payload.get("points_used") or payload.get("reward_points") or 0)
    loyalty_enabled = bool(payload.get("loyalty_enabled"))
    points_balance = max(0, int(payload.get("points_balance") or 0))
    points_earned = int(payload.get("points_earned") or 0) if loyalty_enabled else 0
    points_to_earn = int(payload.get("points_to_earn") or 0) if loyalty_enabled else 0
    taxable_value = _q(payload.get("taxable_value") or payload.get("subtotal") or "0")
    line_total_sum = sum(
        (_q(line.get("total") or "0") for line in (payload.get("lines") or []) if isinstance(line, dict)),
        Decimal("0.00"),
    )
    line_discount, bill_discount, coupon_discount, reward_discount = _reconcile_discount_parts(
        merchandise_gross=merchandise_gross,
        line_total_sum=line_total_sum if line_total_sum > 0 else max(Decimal("0.00"), merchandise_gross - _q(payload.get("discount_total") or "0")),
        line_discount_total=line_discount,
        bill_discount_total=bill_discount,
        coupon_discount=coupon_discount,
        coupon_code=coupon_code,
        reward_discount=reward_discount,
        voucher_discount_total=_q(payload.get("discount_total") or "0"),
    )
    after_line = max(Decimal("0.00"), merchandise_gross - line_discount)
    return {
        "merchandise_gross": merchandise_gross,
        "line_discount": line_discount,
        "after_line": after_line,
        "bill_discount": bill_discount,
        "coupon_discount": coupon_discount,
        "coupon_code": coupon_code,
        "reward_discount": reward_discount,
        "reward_points": reward_points,
        "points_earned": points_earned,
        "points_to_earn": points_to_earn,
        "loyalty_enabled": loyalty_enabled,
        "points_balance": points_balance,
        "taxable_value": taxable_value,
        "payment_label": str(payload.get("payment_label") or "").strip(),
        "amount_paid": _q(payload.get("amount_paid") or "0"),
        "amount_due": _q(payload.get("amount_due") or "0"),
        "total": _q(payload.get("total") or "0"),
    }


def _loyalty_highlight_text(
    *,
    points_earned: int,
    points_to_earn: int,
    points_balance: int,
    compact: bool = False,
) -> str:
    """Single-line loyalty callout for invoices. Empty when nothing to show."""
    earned = max(0, int(points_earned or 0))
    pending = max(0, int(points_to_earn or 0))
    balance = max(0, int(points_balance or 0))
    if earned <= 0 and pending <= 0:
        return ""
    tag = "Enjoy rewards on next visit!"
    if compact:
        if earned > 0:
            head = f"+{earned} pts" + (f" · {balance} total" if balance > 0 else "")
        else:
            head = f"+{pending} pts on pay" + (f" · {balance} total" if balance > 0 else "")
        return f"{head} · {tag}"
    if earned > 0:
        head = f"+{earned} points earned" + (f" · {balance} pts total" if balance > 0 else "")
    else:
        head = f"+{pending} points to earn" + (f" · {balance} pts total" if balance > 0 else "")
    return f"{head} · {tag}"


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
            rows: list[str] = []
            if gstin:
                rows.append(
                    f'<div class="contact-row"><span class="contact-label">GSTIN</span>'
                    f'<strong>{gstin}</strong></div>'
                )
            if phone:
                rows.append(
                    f'<div class="contact-row"><span class="contact-label">Phone</span>'
                    f'<strong>{phone}</strong></div>'
                )
            if email:
                rows.append(
                    f'<div class="contact-row"><span class="contact-label">Email</span>'
                    f'<strong>{email}</strong></div>'
                )
            if address:
                rows.append(
                    f'<div class="contact-row contact-row-address">'
                    f'<span class="contact-label">Address</span>'
                    f'<strong>{address}</strong></div>'
                )
            return "".join(rows)

        seller_contacts = _party_contact_html(
            phone=seller_phone, email=seller_email, address=seller_addr, gstin=seller_gstin
        )
        buyer_contacts = _party_contact_html(
            phone=buyer_phone, email=buyer_email, address=buyer_addr, gstin=buyer_gstin
        )
        seller_gst_badge = (
            f'<span class="gst-badge">GSTIN {seller_gstin}</span>' if seller_gstin else ""
        )
        bill = _pos_bill_summary_from_payload(payload)
        place_of_supply = escape(str(payload.get("place_of_supply") or ""))
        invoice_type = escape(str(payload.get("invoice_type") or "B2C"))
        totals_html = ""
        if bill["merchandise_gross"] > 0:
            totals_html += (
                f"<div class='tot-row'><span>Items</span>"
                f"<span>{currency_sym}{_money(bill['merchandise_gross'])}</span></div>"
            )
        if bill["line_discount"] > 0:
            totals_html += (
                f"<div class='tot-row'><span>Product discount</span>"
                f"<span>-{currency_sym}{_money(bill['line_discount'])}</span></div>"
            )
        if bill["merchandise_gross"] > 0 or bill["after_line"] > 0:
            totals_html += (
                f"<div class='tot-row'><span>Subtotal</span>"
                f"<span>{currency_sym}{_money(bill['after_line'])}</span></div>"
            )
        if bill["bill_discount"] > 0:
            totals_html += (
                f"<div class='tot-row'><span>Bill discount</span>"
                f"<span>-{currency_sym}{_money(bill['bill_discount'])}</span></div>"
            )
        if bill["coupon_discount"] > 0:
            coupon_label = "Coupon"
            if bill["coupon_code"]:
                coupon_label = f"Coupon {escape(bill['coupon_code'])}"
            totals_html += (
                f"<div class='tot-row'><span>{coupon_label}</span>"
                f"<span>-{currency_sym}{_money(bill['coupon_discount'])}</span></div>"
            )
        if bill["reward_discount"] > 0 or (bill.get("loyalty_enabled") and bill["reward_points"] > 0):
            if bill.get("loyalty_enabled") and bill["reward_points"] > 0:
                reward_label = f"Points used ({bill['reward_points']} pts)"
            elif bill.get("loyalty_enabled"):
                reward_label = "Points used"
            else:
                reward_label = "Discount"
            totals_html += (
                f"<div class='tot-row'><span>{escape(reward_label)}</span>"
                f"<span>-{currency_sym}{_money(bill['reward_discount'])}</span></div>"
            )
        totals_html += (
            f"<div class='tot-row'><span>Taxable</span>"
            f"<span>{currency_sym}{_money(bill['taxable_value'])}</span></div>"
        )
        totals_html += gst_rows
        if not gst_rows and _q(payload.get("tax_total")) > 0:
            totals_html += (
                f"<div class='tot-row'><span>GST</span>"
                f"<span>{currency_sym}{_money(payload.get('tax_total'))}</span></div>"
            )
        payment_label = escape(bill["payment_label"])
        totals_html += (
            f"<div class='tot-row grand'><span>Total</span>"
            f"<span>{currency_sym}{_money(total)}</span></div>"
        )
        loyalty_highlight_html = ""
        if bill.get("loyalty_enabled"):
            highlight = _loyalty_highlight_text(
                points_earned=int(bill.get("points_earned") or 0),
                points_to_earn=int(bill.get("points_to_earn") or 0),
                points_balance=int(bill.get("points_balance") or 0),
                compact=bool(is_thermal),
            )
            if highlight:
                pending_cls = " pending" if int(bill.get("points_earned") or 0) <= 0 else ""
                loyalty_highlight_html = (
                    f"<div class='loyalty-highlight{pending_cls}'>"
                    f"<strong class='loyalty-value'>{escape(highlight)}</strong>"
                    "</div>"
                )
        if payment_label:
            totals_html += (
                f"<div class='tot-row'><span>Payment</span>"
                f"<span>{payment_label}</span></div>"
            )
        totals_html += (
            f"<div class='tot-row'><span>Received</span>"
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
          <tr><th class="item">Item</th><th class="num amt">Amt</th></tr>
        </thead>
        <tbody>{thermal_line_rows or "<tr><td colspan='2'>No line items</td></tr>"}</tbody>
      </table>"""
            head_block = f"""
    <div class="head thermal-head">
      {logo_html}
      <div class="shop-name">{business_name}</div>
      {seller_gst_badge}
      <div class="thermal-doc-meta">
        <strong>{title}</strong> · {number or '—'} · {date or '—'}{paid_badge}
      </div>
    </div>"""
            parties_block = f"""
      <div class="parties thermal-parties">
        <div class="party">
          <div class="party-line"><span class="party-kicker">Bill to</span>
            <strong class="party-name">{buyer_name or 'Walk-in customer'}</strong></div>
          {buyer_contacts}
        </div>
      </div>"""
        else:
            items_table = f"""
      <table class="items">
        <thead>
          <tr>
            <th class="idx">#</th><th class="item">Item</th><th class="num qty">Qty</th>
            <th class="num rate">Rate</th><th class="num disc">Disc</th>
            <th class="num hide-sm taxable">Taxable</th><th class="num hide-sm tax">Tax</th>
            <th class="num amt">Amt</th>
          </tr>
        </thead>
        <tbody>{line_rows or f"<tr><td colspan='{col_span}'>No line items</td></tr>"}</tbody>
      </table>"""
            head_block = f"""
    <div class="head">
      <div class="head-left">
        {logo_html}
        <div>
          <div class="shop-name">{business_name}</div>
          <div class="head-sub">{seller_gst_badge}{f'<span class="head-meta"><span class="head-meta-label">Phone</span> {seller_phone}</span>' if seller_phone else ''}{f'<span class="head-meta"><span class="head-meta-label">Email</span> {seller_email}</span>' if seller_email else ''}</div>
        </div>
      </div>
      <div class="doc-meta">
        <div class="label">{title}</div>
        <div class="doc-number">{number or '—'}</div>
        <div class="doc-sub">Date {date or '—'} · {status_label or '—'}{paid_badge}</div>
      </div>
    </div>"""
            parties_block = f"""
      <div class="parties">
        <div class="party">
          <div class="party-line"><span class="party-kicker">From</span>
            <strong class="party-name">{business_name}</strong></div>
          {seller_contacts}
        </div>
        <div class="party">
          <div class="party-line"><span class="party-kicker">To</span>
            <strong class="party-name">{buyer_name or 'Walk-in customer'}</strong></div>
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
      display:grid; grid-template-columns:1.35fr 1fr; gap:12px; align-items:center;
      padding:14px 20px; background:linear-gradient(135deg, #0f766e 0%, #0b5a55 100%);
      color:#fff;
    }}
    .head-left {{ display:flex; align-items:center; gap:12px; min-width:0; }}
    .head-sub {{
      display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; margin-top:4px;
    }}
    .head-meta {{
      display:inline-flex; align-items:baseline; gap:5px; font-size:12px; opacity:.95;
    }}
    .head-meta-label {{
      font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; opacity:.8;
    }}
    .thermal-head {{
      display:flex; flex-direction:column; align-items:center; text-align:center;
      gap:4px; padding:12px 14px 10px;
    }}
    .logo {{
      max-height:36px; max-width:110px; display:block; margin:0;
      background:#fff; border-radius:6px; padding:3px; flex:0 0 auto;
    }}
    .thermal-head .logo {{ margin:0 auto 2px; max-height:32px; }}
    .shop-name {{
      font-size:18px; font-weight:700; letter-spacing:-.02em; margin:0;
      line-height:1.2; overflow-wrap:anywhere;
    }}
    .thermal-head .shop-name {{ font-size:15px; }}
    .gst-badge {{
      display:inline-flex; align-items:center; font-size:11px; font-weight:700;
      letter-spacing:.02em; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.28);
      padding:2px 8px; border-radius:999px; margin:0;
    }}
    .thermal-head .gst-badge {{ margin:0; font-size:10px; }}
    .thermal-doc-meta {{ font-size:11px; opacity:.95; line-height:1.35; }}
    .doc-meta {{ text-align:right; display:grid; justify-items:end; gap:3px; }}
    .doc-meta .label {{
      display:inline-block; font-size:10px; font-weight:700; letter-spacing:.08em;
      text-transform:uppercase; color:#fff; background:rgba(255,255,255,.18);
      padding:2px 8px; border-radius:999px;
    }}
    .doc-number {{ margin:0; font-size:18px; letter-spacing:-.02em; font-weight:700; line-height:1.15; }}
    .doc-sub {{ font-size:12px; opacity:.95; }}
    .badge {{
      display:inline-flex; align-items:center; border-radius:999px; padding:2px 7px;
      font-size:10px; font-weight:700; margin-left:6px; vertical-align:middle;
    }}
    .badge-paid {{ background:#dcfce7; color:#166534; }}
    .badge-due {{ background:#fef3c7; color:#92400e; }}
    .body {{ padding:14px 20px 22px; }}
    .sheet.thermal .body {{ padding:10px 12px 14px; }}
    .parties {{
      display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;
    }}
    .thermal-parties {{ grid-template-columns:1fr; margin-bottom:10px; }}
    .party {{
      border:1px solid var(--line); border-radius:8px; padding:8px 10px;
      background:#fbfcfd;
    }}
    .sheet.thermal .party {{ padding:8px 10px; border-radius:6px; }}
    .party-line {{
      display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 8px; margin-bottom:2px;
    }}
    .party-kicker {{
      font-size:10px; text-transform:uppercase; letter-spacing:.08em;
      color:var(--brand); font-weight:700;
    }}
    .party .party-name {{ font-size:13px; font-weight:700; margin:0; }}
    .contact-row {{
      display:grid; grid-template-columns:52px 1fr; gap:6px; align-items:baseline;
      margin-top:3px; font-size:12px; line-height:1.35;
    }}
    .contact-row-address {{ align-items:start; }}
    .sheet.thermal .contact-row {{ grid-template-columns:48px 1fr; font-size:11.5px; }}
    .contact-label {{
      color:var(--muted); font-size:10px; font-weight:700; letter-spacing:.05em;
      text-transform:uppercase;
    }}
    .contact-row strong {{
      color:var(--ink); font-weight:600; word-break:break-word; overflow-wrap:anywhere;
      white-space:normal;
    }}
    table {{
      width:100%; border-collapse:collapse; margin:4px 0 18px;
      border:1px solid var(--line); border-radius:10px; overflow:hidden;
    }}
    table.items {{ table-layout:fixed; }}
    .thermal-items {{ border-radius:8px; margin:0 0 12px; table-layout:fixed; width:100%; }}
    th, td {{ padding:11px 8px; font-size:13px; vertical-align:top; }}
    .thermal-items th, .thermal-items td {{ padding:8px 6px; font-size:12px; }}
    th {{
      text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.04em;
      color:var(--muted); font-weight:700; border-bottom:1px solid var(--line); background:#f7faf9;
    }}
    th.num {{ text-align:right; }}
    td {{ border-bottom:1px solid #eef2f6; }}
    tr:last-child td {{ border-bottom:none; }}
    table.items th.idx, table.items td.idx {{ width:6%; color:var(--muted); padding-left:10px; }}
    table.items th.item, table.items td:nth-child(2) {{ width:28%; }}
    table.items th.qty, table.items td:nth-child(3) {{ width:8%; }}
    table.items th.rate, table.items td:nth-child(4) {{ width:12%; }}
    table.items th.disc, table.items td:nth-child(5) {{ width:11%; }}
    table.items th.taxable, table.items td:nth-child(6) {{ width:12%; }}
    table.items th.tax, table.items td:nth-child(7) {{ width:10%; }}
    table.items th.amt, table.items td.amount {{
      width:13%; padding-right:10px; overflow:hidden; text-overflow:ellipsis;
    }}
    .idx {{ color:var(--muted); }}
    .item-name {{ font-weight:600; overflow-wrap:anywhere; }}
    .num {{ text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }}
    .thermal-items th.amt, .thermal-items td.amount {{
      width:32%; max-width:36%; padding-left:4px; padding-right:8px;
      overflow:hidden; text-overflow:ellipsis; text-align:right;
    }}
    .thermal-items th:first-child, .thermal-items td:first-child {{ width:68%; }}
    .thermal-items th:last-child {{ text-align:right; }}
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
    .tot-row {{ display:flex; justify-content:space-between; align-items:baseline; padding:6px 0; gap:12px; }}
    .tot-row span:first-child {{
      min-width:0; flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }}
    .tot-row span:last-child {{
      flex:0 0 auto; min-width:6.75em; white-space:nowrap; text-align:right;
      font-variant-numeric:tabular-nums;
    }}
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
    .loyalty-highlight {{
      margin-top:14px; display:flex; flex-wrap:nowrap; align-items:baseline; justify-content:center;
      gap:6px; text-align:center; padding:10px 12px; border-radius:10px;
      background:linear-gradient(135deg, #ecfdf5 0%, #e8f6f4 100%);
      border:1px solid #a7f3d0; color:#065f46; white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis;
      -webkit-print-color-adjust:exact; print-color-adjust:exact;
    }}
    .loyalty-highlight.pending {{
      background:linear-gradient(135deg, #fffbeb 0%, #fef9c3 100%);
      border-color:#fde68a; color:#92400e;
    }}
    .loyalty-value {{ font-size:14px; font-weight:800; letter-spacing:-.01em; }}
    .sheet.thermal .loyalty-highlight {{ margin-top:10px; padding:8px 10px; border-radius:8px; }}
    .sheet.thermal .loyalty-value {{ font-size:12.5px; }}
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
        gap:8px !important;
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
      {loyalty_highlight_html}
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
                x_right - _pdf_text_width(content, size, bold=bold),
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

        # Compact header band (shop + invoice meta in ~48pt).
        header_top = page_h - 24
        header_h = 48.0
        fill_rect(margin_x - 8, header_top - header_h, content_w + 16, header_h, header_rgb)
        text_at(margin_x + 8, header_top - 18, seller_name[:42], size=13, bold=True, rgb=(1, 1, 1))
        seller_bits: list[str] = []
        if seller.get("gstin"):
            seller_bits.append(f"GSTIN {str(seller.get('gstin'))[:18]}")
        if seller.get("phone"):
            seller_bits.append(f"Phone {str(seller.get('phone'))[:16]}")
        if seller.get("email"):
            seller_bits.append(f"Email {str(seller.get('email'))[:26]}")
        if seller_bits:
            text_at(
                margin_x + 8,
                header_top - 34,
                " · ".join(seller_bits)[:72],
                size=8,
                rgb=(0.90, 0.97, 0.95),
            )
        text_right(
            right_edge - 8,
            header_top - 16,
            str(payload.get("title") or "TAX INVOICE"),
            size=9,
            bold=True,
            rgb=(1, 1, 1),
        )
        text_right(
            right_edge - 8,
            header_top - 30,
            str(payload.get("number") or "—")[:28],
            size=11,
            bold=True,
            rgb=(1, 1, 1),
        )
        status = str(payload.get("status") or "").replace("_", " ").title()
        meta_line = f"Date {payload.get('date') or '—'}"
        if status:
            meta_line = f"{meta_line} · {status[:14]}"
        text_right(right_edge - 8, header_top - 44, meta_line[:42], size=8, rgb=(0.90, 0.97, 0.95))

        col_gap = 8.0
        col_w = (content_w - col_gap) / 2
        left_x = margin_x
        right_x = margin_x + col_w + col_gap
        party_pad = 8.0
        label_w = 44.0
        value_max_w = max(80.0, col_w - party_pad * 2 - label_w - 4)
        name_max_w = max(80.0, col_w - party_pad * 2)
        detail_size = 8.0
        name_size = 9.0

        left_name_lines = _pdf_wrap_to_width(seller_name, size=name_size, max_w=name_max_w, bold=True)[:2]
        right_name_lines = _pdf_wrap_to_width(buyer_name, size=name_size, max_w=name_max_w, bold=True)[:2]
        left_detail = _pdf_party_detail_rows(
            seller, seller_addr, size=detail_size, max_w=value_max_w, max_addr_lines=6
        )
        right_detail = _pdf_party_detail_rows(
            buyer, buyer_addr, size=detail_size, max_w=value_max_w, max_addr_lines=6
        )

        def _party_content_h(name_lines: list[str], details: list[tuple[str, str, bool]]) -> float:
            # kicker + names + detail rows + padding
            return 14 + (max(len(name_lines), 1) * 11) + (max(len(details), 0) * 11) + 10

        party_box_h = max(
            _party_content_h(left_name_lines, left_detail),
            _party_content_h(right_name_lines, right_detail),
            56.0,
        )
        party_top = header_top - header_h - 10
        party_bottom = party_top - party_box_h

        fill_rect(left_x, party_bottom, col_w, party_box_h, soft_rgb)
        stroke_rect(left_x, party_bottom, col_w, party_box_h)
        fill_rect(right_x, party_bottom, col_w, party_box_h, soft_rgb)
        stroke_rect(right_x, party_bottom, col_w, party_box_h)

        def draw_party_block(
            x: float,
            *,
            kicker: str,
            name_lines: list[str],
            details: list[tuple[str, str, bool]],
        ) -> None:
            y = party_top - 12
            text_at(x + party_pad, y, kicker, size=8, bold=True, rgb=accent_rgb)
            y -= 12
            for line in name_lines or ["—"]:
                text_at(x + party_pad, y, line, size=name_size, bold=True, rgb=ink_rgb)
                y -= 11
            for label, value, value_bold in details:
                if label:
                    text_at(x + party_pad, y, label, size=7, bold=True, rgb=muted_rgb)
                text_at(
                    x + party_pad + label_w,
                    y,
                    value,
                    size=detail_size,
                    bold=value_bold,
                    rgb=ink_rgb,
                )
                y -= 11

        draw_party_block(left_x, kicker="FROM", name_lines=left_name_lines, details=left_detail)
        draw_party_block(right_x, kicker="TO", name_lines=right_name_lines, details=right_detail)

        # Table — shared right edge per numeric column (headers + values).
        gutter = 6.0
        # Widths sized for Helvetica "Rs 99999.99" at 8pt (~41pt) plus padding.
        amt_w, tax_w, disc_w, rate_w, qty_w = 56.0, 50.0, 50.0, 52.0, 34.0
        amt_right = right_edge - 8
        tax_right = amt_right - amt_w - gutter
        disc_right = tax_right - tax_w - gutter
        rate_right = disc_right - disc_w - gutter
        qty_right = rate_right - rate_w - gutter
        cols = {
            "idx": margin_x + 8,
            "item": margin_x + 26,
            "qty": qty_right,
            "rate": rate_right,
            "disc": disc_right,
            "tax": tax_right,
            "amt": amt_right,
        }
        item_max_w = max(60.0, qty_right - qty_w - gutter - cols["item"])
        num_size = 8.0

        def fit_width(content: str, *, size: float, max_w: float, bold: bool = False) -> str:
            text = str(content or "")
            while text and _pdf_text_width(text, size, bold=bold) > max_w:
                text = text[:-1]
            return text

        table_top = party_bottom - 18
        fill_rect(margin_x, table_top - 18, content_w, 20, soft_rgb)
        stroke_rect(margin_x, table_top - 18, content_w, 20)
        header_y = table_top - 12
        text_at(cols["idx"], header_y, "#", size=num_size, bold=True, rgb=muted_rgb)
        text_at(cols["item"], header_y, "ITEM", size=num_size, bold=True, rgb=muted_rgb)
        text_right(cols["qty"], header_y, "QTY", size=num_size, bold=True, rgb=muted_rgb)
        text_right(cols["rate"], header_y, "RATE", size=num_size, bold=True, rgb=muted_rgb)
        text_right(cols["disc"], header_y, "DISC", size=num_size, bold=True, rgb=muted_rgb)
        text_right(cols["tax"], header_y, "TAX", size=num_size, bold=True, rgb=muted_rgb)
        text_right(cols["amt"], header_y, "AMT", size=num_size, bold=True, rgb=muted_rgb)

        y = table_top - 34
        max_lines = 16
        for idx, line_row in enumerate(lines[:max_lines], start=1):
            name = fit_width(str(line_row.get("name") or ""), size=9, max_w=item_max_w, bold=True)
            text_at(cols["idx"], y, str(idx), size=num_size, rgb=muted_rgb)
            text_at(cols["item"], y, name, size=9, bold=True)
            text_right(
                cols["qty"],
                y,
                fit_width(str(line_row.get("qty") or ""), size=num_size, max_w=qty_w),
                size=num_size,
            )
            text_right(
                cols["rate"],
                y,
                fit_width(money(line_row.get("rate")), size=num_size, max_w=rate_w),
                size=num_size,
            )
            text_right(
                cols["disc"],
                y,
                fit_width(money(line_row.get("discount") or "0.00"), size=num_size, max_w=disc_w),
                size=num_size,
            )
            text_right(
                cols["tax"],
                y,
                fit_width(money(line_row.get("tax")), size=num_size, max_w=tax_w),
                size=num_size,
            )
            text_right(
                cols["amt"],
                y,
                fit_width(money(line_row.get("total")), size=num_size, max_w=amt_w, bold=True),
                size=num_size,
                bold=True,
            )
            y -= 15
            if y < 220:
                break
        if len(lines) > max_lines:
            text_at(cols["item"], y, f"+ {len(lines) - max_lines} more items", size=8, rgb=muted_rgb)
            y -= 14
        hline(margin_x, right_edge, y + 6)

        # Totals + words — one value_right for every summary amount / payment label.
        totals_box_w = 260.0
        totals_x = right_edge - totals_box_w
        value_right = right_edge - 12
        value_max_w = 96.0
        totals_rows: list[tuple[str, str, bool]] = []
        bill = _pos_bill_summary_from_payload(payload)
        if bill["merchandise_gross"] > 0:
            totals_rows.append(("Items", money(bill["merchandise_gross"]), False))
        if bill["line_discount"] > 0:
            totals_rows.append(
                ("Product discount", f"-{money(bill['line_discount'])}", False)
            )
        totals_rows.append(("Subtotal", money(bill["after_line"]), False))
        if bill["bill_discount"] > 0:
            totals_rows.append(("Bill discount", f"-{money(bill['bill_discount'])}", False))
        if bill["coupon_discount"] > 0:
            label = f"Coupon {bill['coupon_code']}" if bill["coupon_code"] else "Coupon"
            totals_rows.append((label, f"-{money(bill['coupon_discount'])}", False))
        if bill["reward_discount"] > 0 or (bill.get("loyalty_enabled") and bill["reward_points"] > 0):
            if bill.get("loyalty_enabled") and bill["reward_points"] > 0:
                label = f"Points used ({bill['reward_points']})"
            elif bill.get("loyalty_enabled"):
                label = "Points used"
            else:
                label = "Discount"
            totals_rows.append((label, f"-{money(bill['reward_discount'])}", False))
        totals_rows.append(("Taxable", money(bill["taxable_value"]), False))
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
        totals_rows.append(("Total", money(payload.get("total")), True))
        if bill["payment_label"]:
            totals_rows.append(("Payment", bill["payment_label"], False))
        totals_rows.extend(
            [
                ("Received", money(payload.get("amount_paid")), False),
                ("Balance due", money(payload.get("amount_due")), True),
            ]
        )
        totals_h = 18 + (len(totals_rows) * 14)
        totals_top = y - 8
        totals_bottom = totals_top - totals_h
        fill_rect(totals_x, totals_bottom, totals_box_w, totals_h, soft_rgb)
        stroke_rect(totals_x, totals_bottom, totals_box_w, totals_h)
        y_t = totals_top - 14
        label_max_w = totals_box_w - value_max_w - 28
        for label, value, emphasize in totals_rows:
            label_text = fit_width(str(label), size=9, max_w=label_max_w, bold=emphasize)
            value_text = fit_width(str(value), size=9, max_w=value_max_w, bold=emphasize)
            text_at(
                totals_x + 12,
                y_t,
                label_text,
                size=9,
                bold=emphasize,
                rgb=accent_rgb if emphasize else ink_rgb,
            )
            text_right(value_right, y_t, value_text, size=9, bold=emphasize)
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

        footer_y = min(words_bottom, totals_bottom) - 18
        loyalty_fill = (0.925, 0.990, 0.961)
        loyalty_ink = (0.024, 0.373, 0.275)
        loyalty_border = (0.655, 0.953, 0.816)
        loyalty_line = ""
        if bill.get("loyalty_enabled"):
            loyalty_line = _loyalty_highlight_text(
                points_earned=int(bill.get("points_earned") or 0),
                points_to_earn=int(bill.get("points_to_earn") or 0),
                points_balance=int(bill.get("points_balance") or 0),
            )
            if loyalty_line and int(bill.get("points_earned") or 0) <= 0:
                loyalty_fill = (1.0, 0.980, 0.922)
                loyalty_ink = (0.573, 0.251, 0.055)
                loyalty_border = (0.992, 0.906, 0.541)
        if loyalty_line:
            loyalty_h = 26.0
            loyalty_bottom = footer_y - loyalty_h
            fill_rect(margin_x, loyalty_bottom, content_w, loyalty_h, loyalty_fill)
            stroke_rect(margin_x, loyalty_bottom, content_w, loyalty_h, loyalty_border)
            line_text = fit_width(loyalty_line, size=10, max_w=content_w - 24, bold=True)
            text_w = _pdf_text_width(line_text, 10, bold=True)
            text_at(
                margin_x + max(12.0, (content_w - text_w) / 2),
                footer_y - 17,
                line_text,
                size=10,
                bold=True,
                rgb=loyalty_ink,
            )
            footer_y = loyalty_bottom - 16
        else:
            footer_y -= 6

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

        seller_addr = (
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
        buyer_addr = (
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
        thermal_text_w = max(120.0, right - left)
        thermal_label_w = 40.0
        thermal_value_w = max(80.0, thermal_text_w - thermal_label_w - 2)
        seller_detail = _pdf_party_detail_rows(
            seller, seller_addr, size=7, max_w=thermal_value_w, max_addr_lines=4
        )
        buyer_detail = _pdf_party_detail_rows(
            buyer, buyer_addr, size=7, max_w=thermal_value_w, max_addr_lines=6
        )
        shop = str(seller.get("name") or seller.get("display_name") or "Shop")
        shop_name_lines = _pdf_wrap_to_width(shop, size=10, max_w=thermal_text_w, bold=True)[:2]
        buyer_name_lines = _pdf_wrap_to_width(
            str(buyer.get("name") or "Walk-in customer"),
            size=8,
            max_w=thermal_text_w,
            bold=True,
        )[:2]

        # Estimate height so long bills are not clipped.
        estimated = 170
        estimated += min(len(lines), 30) * 22
        estimated += len(shop_name_lines) * 11
        estimated += len(seller_detail) * 10
        estimated += len(buyer_name_lines) * 10
        estimated += len(buyer_detail) * 10
        if _q(payload.get("amount_due")) > 0 and seller.get("upi_vpa"):
            estimated += 20
        if payload.get("loyalty_enabled") and (
            int(payload.get("points_earned") or 0) > 0 or int(payload.get("points_to_earn") or 0) > 0
        ):
            estimated += 28
        if payload.get("notes"):
            estimated += 16
        height = float(max(420, min(estimated, 1600)))
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
            text_at(
                center - (_pdf_text_width(content, size, bold=bold) / 2),
                y,
                content,
                size=size,
                bold=bold,
            )

        def text_right(y: float, content: str, *, size: float = 8, bold: bool = False) -> None:
            text_at(
                right - _pdf_text_width(content, size, bold=bold),
                y,
                content,
                size=size,
                bold=bold,
            )

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

        def draw_labeled_rows(start_y: float, rows: list[tuple[str, str, bool]]) -> float:
            y_pos = start_y
            for label, value, value_bold in rows:
                if label:
                    text_at(left, y_pos, label, size=7, bold=True)
                text_at(left + thermal_label_w, y_pos, value, size=7, bold=value_bold)
                y_pos -= 10
            return y_pos

        y = height - 14
        text_center(y, "FROM", size=7, bold=True)
        y -= 10
        for line in shop_name_lines:
            text_center(y, line, size=10, bold=True)
            y -= 11
        y = draw_labeled_rows(y, seller_detail)
        y -= 2
        inv_meta = _pdf_wrap_to_width(
            f"{str(payload.get('title') or 'INVOICE')} · {str(payload.get('number') or '—')}",
            size=8,
            max_w=thermal_text_w,
            bold=True,
        )[:2]
        for line in inv_meta:
            text_center(y, line, size=8, bold=True)
            y -= 10
        text_center(y, f"Date {payload.get('date') or '—'}", size=7)
        y -= 8
        rule(y, dashed=True)
        y -= 10
        text_at(left, y, "TO", size=7, bold=True)
        y -= 10
        for line in buyer_name_lines:
            text_at(left, y, line, size=8, bold=True)
            y -= 10
        y = draw_labeled_rows(y, buyer_detail)
        rule(y)
        y -= 10
        amt_col_w = 70.0
        item_col_w = max(80.0, right - left - amt_col_w - 6)
        text_at(left, y, "ITEM", size=7, bold=True)
        text_right(y, "AMT", size=7, bold=True)
        y -= 10
        rule(y, dashed=True)
        y -= 12

        def fit_thermal(content: str, *, size: float, max_w: float, bold: bool = False) -> str:
            text = str(content or "")
            while text and _pdf_text_width(text, size, bold=bold) > max_w:
                text = text[:-1]
            return text

        for line_row in lines[:30]:
            name = str(line_row.get("name") or "")
            amt_text = fit_thermal(
                money(line_row.get("total")), size=8, max_w=amt_col_w - 2, bold=True
            )
            name_line = fit_thermal(name, size=8, max_w=item_col_w, bold=True)
            text_at(left, y, name_line, size=8, bold=True)
            text_right(y, amt_text, size=8, bold=True)
            y -= 9
            # Second name line only when truncated and remainder fits.
            if len(name_line) < len(name):
                rest = fit_thermal(name[len(name_line) :].lstrip(), size=8, max_w=item_col_w)
                if rest:
                    text_at(left, y, rest, size=8)
                    y -= 9
            disc = _q(line_row.get("discount"))
            detail = f"{line_row.get('qty')} x {money(line_row.get('rate'))}"
            if disc > 0:
                detail += f" disc {money(disc)}"
            text_at(left, y, fit_thermal(detail, size=7, max_w=item_col_w), size=7)
            y -= 12
            if y < 90:
                text_at(left, y, "...", size=8)
                y -= 10
                break

        rule(y)
        y -= 12

        def tot(label: str, value: Any, *, bold: bool = False) -> None:
            nonlocal y
            label_text = fit_thermal(str(label), size=8, max_w=(right - left) * 0.55, bold=bold)
            if isinstance(value, str):
                value_text = fit_thermal(value, size=8, max_w=amt_col_w, bold=bold)
            else:
                value_text = fit_thermal(money(value), size=8, max_w=amt_col_w, bold=bold)
            text_at(left, y, label_text, size=8, bold=bold)
            text_right(y, value_text, size=8, bold=bold)
            y -= 11

        bill = _pos_bill_summary_from_payload(payload)
        if bill["merchandise_gross"] > 0:
            tot("Items", bill["merchandise_gross"])
        if bill["line_discount"] > 0:
            tot("Prod disc", -bill["line_discount"])
        tot("Subtotal", bill["after_line"])
        if bill["bill_discount"] > 0:
            tot("Bill disc", -bill["bill_discount"])
        if bill["coupon_discount"] > 0:
            label = f"Cpn {bill['coupon_code']}" if bill["coupon_code"] else "Coupon"
            tot(label, -bill["coupon_discount"])
        if bill["reward_discount"] > 0 or (bill.get("loyalty_enabled") and bill["reward_points"] > 0):
            if bill.get("loyalty_enabled") and bill["reward_points"] > 0:
                label = f"Used ({bill['reward_points']})"
            elif bill.get("loyalty_enabled"):
                label = "Pts used"
            else:
                label = "Disc"
            tot(label, -bill["reward_discount"])
        tot("Taxable", bill["taxable_value"])
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
        if bill["payment_label"]:
            tot("Payment", bill["payment_label"])
        tot("Received", payload.get("amount_paid"))
        tot("Due", payload.get("amount_due"), bold=True)
        if bill.get("loyalty_enabled"):
            loyalty_line = _loyalty_highlight_text(
                points_earned=int(bill.get("points_earned") or 0),
                points_to_earn=int(bill.get("points_to_earn") or 0),
                points_balance=int(bill.get("points_balance") or 0),
                compact=True,
            )
            if loyalty_line:
                y -= 4
                rule(y, dashed=True)
                y -= 12
                text_center(
                    y,
                    fit_thermal(loyalty_line, size=8, max_w=right - left, bold=True),
                    size=8,
                    bold=True,
                )
                y -= 12
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
        paid = _money(payload.get("amount_paid"))
        due_amt = _q(payload.get("amount_due"))
        due = _money(payload.get("amount_due"))
        currency = str(payload.get("currency") or "INR")
        url = str(payload.get("public_url") or "")
        title = str(payload.get("short_title") or "Document")
        payment_label = str(payload.get("payment_label") or "").strip()
        if remind_payment and due_amt > 0:
            base = f"{business}: payment reminder for {title} {number}. Due {currency} {due}."
        else:
            parts = [f"{business}: your {title} {number} for {currency} {total}"]
            if payment_label:
                parts.append(f"Payment: {payment_label}")
            if _q(payload.get("amount_paid")) > 0 or due_amt > 0:
                parts.append(f"Received {currency} {paid}")
                parts.append(f"Due {currency} {due}")
            base = ". ".join(parts) + "."
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
