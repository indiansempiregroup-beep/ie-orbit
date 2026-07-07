from __future__ import annotations

import uuid

from django.db.models import Q, QuerySet

from apps.authentication.models import User
from apps.bookings.models import Booking
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.customers.services import CustomerService
from apps.tenancy.models import Tenant


def resolve_customers_for_user(*, tenant: Tenant, business: Business, user: User) -> QuerySet[Customer]:
    qs = Customer.objects.require_tenant(tenant).filter(business=business)
    filters = Q()
    if user.email:
        filters |= Q(email__iexact=user.email)
    if user.phone_number:
        filters |= Q(phone_number=user.phone_number)
    if not filters:
        return qs.none()
    return qs.filter(filters)


def ensure_customer_for_user(*, tenant: Tenant, business: Business, user: User) -> Customer:
    existing = resolve_customers_for_user(tenant=tenant, business=business, user=user).first()
    if existing is not None:
        return existing
    display_name = user.full_name or f"{user.first_name} {user.last_name}".strip() or user.email
    first_name, _, last_name = display_name.partition(" ")
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code=f"mob-{uuid.uuid4().hex[:8]}",
        first_name=first_name or "Customer",
        last_name=last_name,
        display_name=display_name or "Customer",
        email=user.email or "",
        phone_number=user.phone_number or "",
    )
    CustomerService().ensure_foundation_records(customer)
    return customer


def serialize_customer_address(customer: Customer) -> dict | None:
    address = customer.addresses.filter(is_default=True).first() or customer.addresses.order_by("created_at").first()
    if address is None:
        return None
    return {
        "id": str(address.id),
        "line1": address.line1,
        "full_address": address.line1,
        "city": address.city,
        "state": address.state,
        "country": address.country,
        "postal_code": address.postal_code,
        "latitude": float(address.latitude) if address.latitude is not None else None,
        "longitude": float(address.longitude) if address.longitude is not None else None,
    }


def serialize_mobile_customer_profile(customer: Customer) -> dict:
    return {
        "id": str(customer.id),
        "display_name": customer.display_name,
        "email": customer.email,
        "phone_number": customer.phone_number,
        "address": serialize_customer_address(customer),
    }


def get_customer_booking(
    *,
    tenant: Tenant,
    business: Business,
    user: User,
    booking_id: object,
) -> Booking | None:
    customers = resolve_customers_for_user(tenant=tenant, business=business, user=user)
    if not customers.exists():
        return None
    return (
        Booking.objects.require_tenant(tenant)
        .filter(
            id=booking_id,
            business=business,
            customer_id__in=customers.values_list("id", flat=True),
        )
        .first()
    )
