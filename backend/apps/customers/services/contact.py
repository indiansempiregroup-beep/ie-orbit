from __future__ import annotations

from typing import Any


def format_contact_phone(value: object, *, e164: bool = False) -> str:
    """Normalize a phone value to a 10-digit India mobile, optionally +91 E.164."""
    digits = "".join(char for char in str(value or "") if char.isdigit())
    if not digits:
        return ""
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) > 10:
        digits = digits[-10:]
    if len(digits) < 10:
        return ""
    if e164:
        return f"+91{digits}"
    return digits


def resolve_customer_phone(customer: Any | None, *, fallback: str = "") -> str:
    """Best-effort customer mobile for ops screens and delivery partner APIs."""
    candidates: list[object] = []
    if customer is not None:
        candidates.extend(
            [
                getattr(customer, "phone_number", ""),
                getattr(customer, "alternate_phone", ""),
            ]
        )
        email = str(getattr(customer, "email", "") or "").strip()
        if email:
            from apps.authentication.models import User

            user = User.objects.filter(email__iexact=email).only("phone_number").first()
            if user is not None and user.phone_number:
                candidates.append(user.phone_number)
    if fallback:
        candidates.append(fallback)
    for value in candidates:
        formatted = format_contact_phone(value)
        if formatted:
            return formatted
    return ""
