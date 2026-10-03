"""Normalize product fields from open catalog sources."""

from __future__ import annotations

import html
import re
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urlparse, urlunparse

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_MAX_IMAGES = 5


def clean_text(value: Any, *, max_len: int = 0) -> str:
    text = html.unescape(_TAG_RE.sub(" ", str(value or "")))
    text = _WS_RE.sub(" ", text).replace("\xa0", " ").strip()
    if max_len > 0:
        return text[:max_len]
    return text


def normalize_image_url(url: str | None) -> str:
    raw = clean_text(url, max_len=1024)
    if not raw:
        return ""
    if raw.startswith("//"):
        raw = f"https:{raw}"
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    # Prefer https for known hosts; keep path/query from source (no fabricated URLs).
    scheme = "https" if parsed.scheme == "http" else parsed.scheme
    return urlunparse((scheme, parsed.netloc, parsed.path, "", parsed.query, ""))


def collect_images(*candidates: Any, max_images: int = _MAX_IMAGES) -> list[str]:
    gallery: list[str] = []
    for item in candidates:
        if isinstance(item, (list, tuple, set)):
            values = list(item)
        else:
            values = [item]
        for value in values:
            cleaned = normalize_image_url(str(value or ""))
            if cleaned and cleaned not in gallery:
                gallery.append(cleaned)
            if len(gallery) >= max_images:
                return gallery
    return gallery


_PACK_FROM_TEXT_RE = re.compile(
    r"(\d+(?:[.,]\d+)?\s*(?:ml|mL|l|L|g|kg|gm|oz|pcs?|pack|caps?|tabs?|tablets?))\b",
    re.IGNORECASE,
)


def pack_size_from_parts(label: str = "", size: Any = None, unit: str = "") -> str:
    label_text = clean_text(label, max_len=80)
    if label_text:
        return label_text
    unit_text = clean_text(unit, max_len=32)
    if size is None or size == "" or size == 0 or size == "0":
        return unit_text
    try:
        number = Decimal(str(size))
        if number == number.to_integral_value():
            size_text = str(int(number))
        else:
            size_text = format(number.normalize(), "f").rstrip("0").rstrip(".")
    except (InvalidOperation, ValueError):
        size_text = clean_text(size, max_len=40)
    if size_text and unit_text:
        return f"{size_text} {unit_text}"[:80]
    return (size_text or unit_text)[:80]


def infer_pack_size(
    *,
    pack_size: str = "",
    serving_size: str = "",
    name: str = "",
    quantity: str = "",
) -> str:
    """Prefer an explicit pack label; otherwise recover size+unit from name/quantity text."""
    pack = clean_text(pack_size, max_len=80)
    if pack and re.search(r"[A-Za-z]", pack):
        return pack

    for candidate in (quantity, name, serving_size):
        match = _PACK_FROM_TEXT_RE.search(clean_text(candidate, max_len=240))
        if not match:
            continue
        inferred = clean_text(match.group(1), max_len=80)
        if not inferred:
            continue
        if not pack:
            return inferred
        # Digits-only catalog pack (e.g. "70") → upgrade to "70 g" from the name.
        pack_digits = re.sub(r"\s+", "", pack)
        inferred_compact = re.sub(r"\s+", "", inferred)
        if inferred_compact.lower().startswith(pack_digits.lower()):
            return inferred
    if pack:
        return pack
    serving = clean_text(serving_size, max_len=80)
    if serving and re.search(r"[A-Za-z]", serving):
        return serving
    return serving


def parse_mrp_paise(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        paise = int(value)
    except (TypeError, ValueError):
        try:
            paise = int(Decimal(str(value).replace(",", "").strip()))
        except (InvalidOperation, ValueError):
            return None
    if paise <= 0:
        return None
    return (Decimal(paise) / Decimal("100")).quantize(Decimal("0.01"))


def parse_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        amount = Decimal(str(value).replace(",", "").replace("₹", "").strip())
    except (InvalidOperation, ValueError):
        return None
    if amount < 0:
        return None
    return amount.quantize(Decimal("0.01"))


def build_product_details(*parts: str) -> str:
    cleaned = [clean_text(part, max_len=200) for part in parts if clean_text(part)]
    # Deduplicate while preserving order.
    seen: set[str] = set()
    ordered: list[str] = []
    for item in cleaned:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(item)
    return "; ".join(ordered)[:2000]


def distinct_product_details(description: str | None, details: str | None) -> str:
    """Return product_details only when it adds info beyond description/ingredients."""
    desc = clean_text(description or "")
    detail = clean_text(_TAG_RE.sub(" ", details or ""))
    if not detail:
        return ""
    if not desc:
        return detail[:2000]
    if detail.lower() == desc.lower():
        return ""
    # Treat HTML-wrapped description copies as duplicates.
    if detail.lower() in {desc.lower(), f"<p>{desc.lower()}</p>"}:
        return ""
    if desc.lower() in detail.lower() and len(detail) <= len(desc) + 20:
        return ""
    return detail[:2000]
