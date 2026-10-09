from __future__ import annotations

from typing import Any, Literal

from django.db.models import Q
from rest_framework.exceptions import ValidationError


def _normalize_email(value: object) -> str:
    return str(value or "").strip().lower()


def _phone_variants(value: object) -> set[str]:
    # Lazy import avoids circular import via customers.services package init.
    from apps.customers.services.contact import format_contact_phone

    raw = str(value or "").strip()
    variants: set[str] = set()
    if raw:
        variants.add(raw)
    digits = format_contact_phone(raw)
    if digits:
        variants.add(digits)
        variants.add(f"+91{digits}")
        variants.add(f"91{digits}")
    e164 = format_contact_phone(raw, e164=True)
    if e164:
        variants.add(e164)
    return variants


def collect_identity(*, email: str = "", phone: str = "", user: Any | None = None) -> tuple[str, set[str]]:
    """Normalize email/phone and optionally merge a linked User identity."""
    emails: set[str] = set()
    phones: set[str] = set()
    normalized = _normalize_email(email)
    if normalized:
        emails.add(normalized)
    phones |= _phone_variants(phone)
    if user is not None:
        user_email = _normalize_email(getattr(user, "email", ""))
        if user_email:
            emails.add(user_email)
        phones |= _phone_variants(getattr(user, "phone_number", ""))
    primary_email = normalized or (next(iter(emails), "") if emails else "")
    return primary_email, phones


def _identity_email_set(*, email: str = "", user: Any | None = None) -> set[str]:
    emails = {_normalize_email(email)}
    if user is not None:
        emails.add(_normalize_email(getattr(user, "email", "")))
    emails.discard("")
    return emails


def find_conflicting_customer(
    *,
    tenant: Any,
    business: Any,
    email: str = "",
    phone: str = "",
    user: Any | None = None,
    exclude_customer_id: Any | None = None,
) -> Any | None:
    from apps.customers.models import Customer

    emails = _identity_email_set(email=email, user=user)
    phones = _phone_variants(phone)
    if user is not None:
        phones |= _phone_variants(getattr(user, "phone_number", ""))
    if not emails and not phones:
        return None

    filters = Q()
    for item in emails:
        filters |= Q(email__iexact=item)
    if phones:
        filters |= Q(phone_number__in=phones)

    qs = Customer.objects.require_tenant(tenant).filter(business=business).filter(filters)
    if exclude_customer_id:
        qs = qs.exclude(pk=exclude_customer_id)
    return qs.first()


def find_conflicting_staff(
    *,
    tenant: Any,
    business: Any,
    email: str = "",
    phone: str = "",
    user: Any | None = None,
    exclude_staff_id: Any | None = None,
) -> Any | None:
    from apps.staff.models import Staff

    emails = {_normalize_email(email)}
    phones = _phone_variants(phone)
    if user is not None:
        user_email = _normalize_email(getattr(user, "email", ""))
        if user_email:
            emails.add(user_email)
        phones |= _phone_variants(getattr(user, "phone_number", ""))
        user_id = getattr(user, "id", None) or getattr(user, "pk", None)
    else:
        user_id = None
    emails.discard("")
    if not emails and not phones and not user_id:
        return None

    filters = Q()
    for item in emails:
        filters |= Q(email__iexact=item)
        filters |= Q(user__email__iexact=item)
    if phones:
        filters |= Q(phone_number__in=phones)
        filters |= Q(user__phone_number__in=phones)
    if user_id:
        filters |= Q(user_id=user_id)

    qs = Staff.objects.filter(tenant=tenant, business=business).filter(filters)
    if exclude_staff_id:
        qs = qs.exclude(pk=exclude_staff_id)
    return qs.select_related("user").first()


def assert_no_staff_customer_conflict(
    *,
    tenant: Any,
    business: Any,
    email: str = "",
    phone: str = "",
    user: Any | None = None,
    exclude_staff_id: Any | None = None,
    exclude_customer_id: Any | None = None,
    creating: Literal["staff", "customer"],
) -> None:
    """
    Reject writes that would make the same email/phone both staff and customer
    in one business.
    """
    if creating == "staff":
        conflict = find_conflicting_customer(
            tenant=tenant,
            business=business,
            email=email,
            phone=phone,
            user=user,
            exclude_customer_id=exclude_customer_id,
        )
        if conflict is None:
            return
        primary_email, phones = collect_identity(email=email, phone=phone, user=user)
        conflict_email = _normalize_email(conflict.email)
        conflict_phones = _phone_variants(conflict.phone_number)
        if primary_email and conflict_email == primary_email:
            raise ValidationError({"email": "This email is already used by a customer in this business."})
        if phones & conflict_phones:
            raise ValidationError(
                {"phone_number": "This phone number is already used by a customer in this business."}
            )
        raise ValidationError(
            {"non_field_errors": ["This person is already a customer in this business."]}
        )

    conflict = find_conflicting_staff(
        tenant=tenant,
        business=business,
        email=email,
        phone=phone,
        user=user,
        exclude_staff_id=exclude_staff_id,
    )
    if conflict is None:
        return
    primary_email, phones = collect_identity(email=email, phone=phone, user=user)
    conflict_emails = {_normalize_email(conflict.email)}
    conflict_phones = _phone_variants(conflict.phone_number)
    linked = getattr(conflict, "user", None)
    if linked is not None:
        conflict_emails.add(_normalize_email(linked.email))
        conflict_phones |= _phone_variants(linked.phone_number)
    conflict_emails.discard("")
    if primary_email and primary_email in conflict_emails:
        raise ValidationError({"email": "This email is already used by a staff member in this business."})
    if phones & conflict_phones:
        raise ValidationError(
            {"phone_number": "This phone number is already used by a staff member in this business."}
        )
    raise ValidationError(
        {"non_field_errors": ["This person is already a staff member in this business."]}
    )
