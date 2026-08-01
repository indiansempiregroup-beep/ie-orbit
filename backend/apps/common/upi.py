from __future__ import annotations

from decimal import Decimal
from urllib.parse import quote, urlencode


def build_upi_pay_url(
    *,
    vpa: str,
    payee_name: str,
    amount: Decimal | str | float | int,
    note: str = "",
    currency: str = "INR",
) -> str:
    pa = str(vpa or "").strip()
    if not pa:
        return ""
    am = Decimal(str(amount or "0")).quantize(Decimal("0.01"))
    if am <= 0:
        return ""
    params = {
        "pa": pa,
        "pn": str(payee_name or "").strip() or "Merchant",
        "am": f"{am:.2f}",
        "cu": currency or "INR",
    }
    if note:
        params["tn"] = str(note).strip()[:80]
    return f"upi://pay?{urlencode(params, quote_via=quote)}"
