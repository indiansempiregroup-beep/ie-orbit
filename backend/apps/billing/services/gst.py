from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any


def _q(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def split_inclusive_gst(
    amount_paise: int,
    *,
    gst_rate_percent: Decimal | float | int = 18,
    interstate: bool = False,
) -> dict[str, Any]:
    """
    Split a GST-inclusive grand total into taxable + tax components (paise).

    taxable + tax == amount_paise (remainder adjustment on taxable).
    """
    total = max(0, int(amount_paise or 0))
    rate = Decimal(str(gst_rate_percent or 0))
    if total <= 0 or rate <= 0:
        return {
            "amount_paise": total,
            "taxable_paise": total,
            "cgst_paise": 0,
            "sgst_paise": 0,
            "igst_paise": 0,
            "gst_rate_percent": str(rate),
            "is_interstate": bool(interstate),
        }
    divisor = Decimal("1") + (rate / Decimal("100"))
    taxable = _q(Decimal(total) / divisor)
    tax = total - int(taxable)
    if interstate:
        cgst = sgst = 0
        igst = tax
    else:
        # Prefer equal split; odd paise goes to CGST.
        sgst = tax // 2
        cgst = tax - sgst
        igst = 0
    return {
        "amount_paise": total,
        "taxable_paise": int(taxable),
        "cgst_paise": int(cgst),
        "sgst_paise": int(sgst),
        "igst_paise": int(igst),
        "gst_rate_percent": str(rate),
        "is_interstate": bool(interstate),
    }
