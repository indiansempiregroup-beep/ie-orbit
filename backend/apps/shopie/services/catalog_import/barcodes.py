"""Barcode normalization and GTIN checksum validation for catalog import."""

from __future__ import annotations

from apps.shopie.services.barcode_providers import gtin_variants


def normalize_barcode(code: str | None) -> str:
    return "".join(ch for ch in str(code or "") if ch.isdigit())


def gtin_checksum_ok(digits: str) -> bool:
    if len(digits) not in {8, 12, 13, 14}:
        return False
    body, check = digits[:-1], int(digits[-1])
    total = 0
    for index, char in enumerate(reversed(body)):
        weight = 3 if index % 2 == 0 else 1
        total += int(char) * weight
    return (10 - (total % 10)) % 10 == check


def is_valid_gtin(code: str | None) -> bool:
    digits = normalize_barcode(code)
    if not digits:
        return False
    if len(digits) not in {8, 12, 13, 14}:
        return False
    if set(digits) == {"0"}:
        return False
    if digits.startswith("0000") or digits.endswith("000000"):
        return False
    return gtin_checksum_ok(digits)


def canonical_barcode(code: str | None) -> str:
    """Prefer a checksum-valid GTIN-13/12/8/14 form; keep digit string (no int cast)."""
    digits = normalize_barcode(code)
    if not digits:
        return ""
    for candidate in gtin_variants(digits):
        if gtin_checksum_ok(candidate):
            return candidate
    if is_valid_gtin(digits):
        return digits
    return ""
