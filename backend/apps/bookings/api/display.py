from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from apps.bookings.models import Booking
from apps.customers.models import Customer
from apps.services.models import Service
from apps.staff.models import Staff


def build_booking_display_context(*, tenant: Any, bookings: Iterable[Booking]) -> dict[str, dict[str, Any]]:
    booking_list = list(bookings)
    customer_ids: set[Any] = set()
    staff_ids: set[Any] = set()
    service_ids: set[Any] = set()

    for booking in booking_list:
        if booking.customer_id:
            customer_ids.add(booking.customer_id)
        if booking.staff_id:
            staff_ids.add(booking.staff_id)
        if booking.service_id:
            service_ids.add(booking.service_id)
        for item in booking.line_items.all():
            if item.service_id:
                service_ids.add(item.service_id)
            if item.staff_id:
                staff_ids.add(item.staff_id)

    customer_map = {
        str(customer.id): customer
        for customer in Customer.objects.require_tenant(tenant).filter(id__in=customer_ids)
    }
    staff_map = {
        str(staff.id): staff for staff in Staff.objects.require_tenant(tenant).filter(id__in=staff_ids)
    }
    service_map = {
        str(service.id): service
        for service in Service.objects.require_tenant(tenant).filter(id__in=service_ids)
    }
    return {
        "customer_map": customer_map,
        "staff_map": staff_map,
        "service_map": service_map,
    }


def service_label(*, service_map: dict[str, Any], service_id: Any) -> str:
    service = service_map.get(str(service_id))
    if service is None:
        return ""
    return service.display_name or service.name or ""


def booking_service_summary(*, booking: Booking, service_map: dict[str, Any]) -> str:
    line_items = list(booking.line_items.all())
    if line_items:
        names = [
            service_label(service_map=service_map, service_id=item.service_id)
            for item in sorted(line_items, key=lambda row: (row.sort_order, row.start_at))
        ]
        names = [name for name in names if name]
        if not names:
            return "Booking"
        if len(names) == 1:
            return names[0]
        return f"{names[0]} + {len(names) - 1} more"
    label = service_label(service_map=service_map, service_id=booking.service_id)
    return label or "Booking"
