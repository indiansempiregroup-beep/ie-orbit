from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any, TypedDict

CENTS = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)


class GstSplit(TypedDict):
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    tax_total: Decimal


def split_gst(taxable: Decimal, rate: Decimal, *, interstate: bool) -> GstSplit:
    """Split a taxable amount into CGST/SGST (intra-state) or IGST (inter-state)."""
    taxable = Decimal(str(taxable or "0"))
    rate = Decimal(str(rate or "0"))
    zero = Decimal("0.00")
    if taxable <= 0 or rate <= 0:
        return {"cgst": zero, "sgst": zero, "igst": zero, "tax_total": zero}

    tax_total = _q(taxable * rate / Decimal("100"))
    if interstate:
        return {"cgst": zero, "sgst": zero, "igst": tax_total, "tax_total": tax_total}

    half = _q(tax_total / 2)
    remainder = tax_total - half
    return {"cgst": half, "sgst": remainder, "igst": Decimal("0.00"), "tax_total": tax_total}


class LineComputation(TypedDict):
    product_id: str | None
    name: str
    hsn_sac: str
    qty: Decimal
    rate: Decimal
    discount: Decimal
    gst_rate: Decimal
    tax_inclusive: bool
    taxable: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    total: Decimal


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def compute_line(raw: dict[str, Any], *, interstate: bool) -> LineComputation:
    """Compute one voucher line's taxable base, GST split, and line total.

    `raw` is a caller-provided dict — typically from a request payload or built
    from a `ShopProduct` — containing at least `qty` and `rate`.

    When `tax_inclusive` is true, `rate` is treated as GST-inclusive (MRP-style)
    and taxable + tax are extracted from the inclusive amount after discount.
    """
    qty_raw = raw.get("qty") if raw.get("qty") is not None else raw.get("quantity") or "0"
    rate_raw = raw.get("rate") if raw.get("rate") is not None else raw.get("unit_price") or "0"
    gst_rate_raw = (
        raw.get("gst_rate") if raw.get("gst_rate") is not None else raw.get("tax_rate") or "0"
    )
    qty = Decimal(str(qty_raw))
    rate = Decimal(str(rate_raw))
    discount = Decimal(str(raw.get("discount") or "0"))
    gst_rate = Decimal(str(gst_rate_raw))
    tax_inclusive = _as_bool(raw.get("tax_inclusive"))

    gross = _q(qty * rate)
    after_discount = gross - discount
    if after_discount < 0:
        after_discount = Decimal("0.00")
    after_discount = _q(after_discount)

    if tax_inclusive and gst_rate > 0:
        # Inclusive: after_discount is the customer-facing total for the line.
        taxable = _q(after_discount * Decimal("100") / (Decimal("100") + gst_rate))
        tax_total = _q(after_discount - taxable)
        if interstate:
            split = {
                "cgst": Decimal("0.00"),
                "sgst": Decimal("0.00"),
                "igst": tax_total,
                "tax_total": tax_total,
            }
        else:
            half = _q(tax_total / 2)
            split = {
                "cgst": half,
                "sgst": _q(tax_total - half),
                "igst": Decimal("0.00"),
                "tax_total": tax_total,
            }
        total = after_discount
    else:
        taxable = after_discount
        split = split_gst(taxable, gst_rate, interstate=interstate)
        total = _q(taxable + split["tax_total"])

    return {
        "product_id": str(raw.get("product_id")) if raw.get("product_id") else None,
        "name": str(raw.get("name") or ""),
        "hsn_sac": str(raw.get("hsn_sac") or ""),
        "qty": qty,
        "rate": rate,
        "discount": discount,
        "gst_rate": gst_rate,
        "tax_inclusive": tax_inclusive,
        "taxable": taxable,
        "cgst": split["cgst"],
        "sgst": split["sgst"],
        "igst": split["igst"],
        "total": total,
    }


class VoucherTotals(TypedDict):
    lines: list[dict[str, Any]]
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    cgst_total: Decimal
    sgst_total: Decimal
    igst_total: Decimal
    total: Decimal


def compute_voucher_totals(lines: list[dict[str, Any]], *, interstate: bool) -> VoucherTotals:
    """Compute per-line GST splits plus voucher-level totals for a list of raw lines."""
    computed_lines: list[dict[str, Any]] = []
    subtotal = Decimal("0.00")
    discount_total = Decimal("0.00")
    cgst_total = Decimal("0.00")
    sgst_total = Decimal("0.00")
    igst_total = Decimal("0.00")
    total = Decimal("0.00")

    for raw in lines:
        computed = compute_line(raw, interstate=interstate)
        computed_lines.append(
            {
                **computed,
                "qty": str(computed["qty"]),
                "rate": str(computed["rate"]),
                "discount": str(computed["discount"]),
                "gst_rate": str(computed["gst_rate"]),
                "tax_inclusive": bool(computed.get("tax_inclusive")),
                "taxable": str(computed["taxable"]),
                "cgst": str(computed["cgst"]),
                "sgst": str(computed["sgst"]),
                "igst": str(computed["igst"]),
                "total": str(computed["total"]),
            }
        )
        subtotal += computed["taxable"] + computed["discount"]
        discount_total += computed["discount"]
        cgst_total += computed["cgst"]
        sgst_total += computed["sgst"]
        igst_total += computed["igst"]
        total += computed["total"]

    tax_total = cgst_total + sgst_total + igst_total
    return {
        "lines": computed_lines,
        "subtotal": _q(subtotal),
        "discount_total": _q(discount_total),
        "tax_total": _q(tax_total),
        "cgst_total": _q(cgst_total),
        "sgst_total": _q(sgst_total),
        "igst_total": _q(igst_total),
        "total": _q(total),
    }
