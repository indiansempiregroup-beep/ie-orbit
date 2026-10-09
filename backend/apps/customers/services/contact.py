from __future__ import annotations

from typing import Any


def _digits_only(value: object) -> str:
    return "".join(char for char in str(value or "") if char.isdigit())


def format_contact_phone(
    value: object,
    *,
    e164: bool = False,
    default_country: str | None = "IN",
) -> str:
    """Normalize a phone value.

    India (default): 10-digit mobile, optionally +91 E.164.
    Other countries: keep E.164 when the input already has a country code;
    otherwise return digits if length is plausible (8–15).
    """
    raw = str(value or "").strip()
    digits = _digits_only(raw)
    if not digits:
        return ""

    country = str(default_country or "IN").strip().upper()
    is_india = country in {"IN", "IND", "INDIA", ""}

    if is_india:
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) > 10:
            digits = digits[-10:]
        if len(digits) < 10:
            return ""
        if e164:
            return f"+91{digits}"
        return digits

    # International: keep E.164 (+ and country code). National-only digits are prefixed with +.
    if 8 <= len(digits) <= 15:
        return f"+{digits}"
    return ""


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


def resolve_order_contact_phone(order: Any | None, *, customer: Any | None = None, preferred: str = "") -> str:
    """Prefer the delivery-address phone (Amazon-style), then customer profile phone."""
    candidates: list[object] = [preferred]
    if order is not None:
        metadata = getattr(order, "metadata", None)
        if isinstance(metadata, dict):
            candidates.append(metadata.get("delivery_contact_phone"))
            delivery = metadata.get("delivery") if isinstance(metadata.get("delivery"), dict) else {}
            drop = delivery.get("drop") if isinstance(delivery.get("drop"), dict) else {}
            contact = drop.get("contact") if isinstance(drop.get("contact"), dict) else {}
            candidates.append(contact.get("phone"))
        if customer is None:
            customer = getattr(order, "customer", None)
    for value in candidates:
        formatted = format_contact_phone(value)
        if formatted:
            return formatted
    return resolve_customer_phone(customer)


def require_address_phone(value: object, *, default_country: str | None = "IN") -> str:
    """Normalize and require a valid mobile for a saved address."""
    phone = format_contact_phone(value, default_country=default_country)
    if not phone:
        country = str(default_country or "IN").strip().upper()
        if country in {"IN", "IND", "INDIA", ""}:
            raise ValueError("A valid 10-digit Indian mobile number is required for this address.")
        raise ValueError("A valid international phone number (E.164) is required for this address.")
    return phone
