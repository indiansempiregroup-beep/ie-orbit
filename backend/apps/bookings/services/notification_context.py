from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from apps.bookings.api.display import build_booking_display_context, service_label
from apps.bookings.models import Booking, BookingLineItem
from apps.notifications.services.notifications import format_booking_start_label


def line_item_staff_map(booking: Booking) -> dict[str, str]:
    return {
        str(item.id): str(item.staff_id) if item.staff_id else ""
        for item in booking.line_items.order_by("sort_order", "start_at")
    }


def ordered_line_items(booking: Booking) -> list[BookingLineItem]:
    return list(booking.line_items.order_by("sort_order", "start_at"))


def booking_staff_summary(*, booking: Booking, staff_map: dict[str, Any]) -> str:
    names: list[str] = []
    seen: set[str] = set()
    for item in ordered_line_items(booking):
        if not item.staff_id:
            continue
        staff = staff_map.get(str(item.staff_id))
        name = (staff.display_name if staff is not None else "") or ""
        if name and name not in seen:
            names.append(name)
            seen.add(name)
    if not names and booking.staff_id:
        staff = staff_map.get(str(booking.staff_id))
        if staff is not None and staff.display_name:
            return staff.display_name
    if len(names) == 1:
        return names[0]
    if len(names) > 1:
        return ", ".join(names)
    return ""


def format_line_item_schedule(
    *,
    items: list[BookingLineItem],
    service_map: dict[str, Any],
    staff_map: dict[str, Any],
    user: Any | None,
    business: Any | None,
    include_staff: bool = True,
) -> str:
    rows: list[str] = []
    for item in items:
        service_name = service_label(service_map=service_map, service_id=item.service_id) or "Service"
        start_label = format_booking_start_label(
            start_at=item.start_at,
            user=user,
            business=business,
        )
        segment = f"{service_name} at {start_label} ({item.duration_minutes} min)"
        if include_staff and item.staff_id:
            staff = staff_map.get(str(item.staff_id))
            staff_name = (staff.display_name if staff is not None else "") or ""
            if staff_name:
                segment = f"{segment} with {staff_name}"
        rows.append(segment)
    return "; ".join(rows)


def build_booking_notification_replacements(
    *,
    booking: Booking,
    user: Any | None = None,
    staff_id: str | None = None,
) -> dict[str, str]:
    context = build_booking_display_context(tenant=booking.tenant, bookings=[booking])
    customer_map = context.get("customer_map") or {}
    staff_map = context.get("staff_map") or {}
    service_map = context.get("service_map") or {}

    customer = customer_map.get(str(booking.customer_id))
    customer_name = (customer.display_name if customer is not None else None) or "Customer"
    staff_names = booking_staff_summary(booking=booking, staff_map=staff_map)

    line_items = ordered_line_items(booking)
    if line_items:
        service_names = [
            service_label(service_map=service_map, service_id=item.service_id)
            for item in line_items
        ]
        service_names = [name for name in service_names if name]
        if len(service_names) == 1:
            service_name = service_names[0]
        elif len(service_names) > 1:
            service_name = f"{service_names[0]} + {len(service_names) - 1} more"
        else:
            service_name = "Booking"
    else:
        service_name = service_label(service_map=service_map, service_id=booking.service_id) or "Booking"

    start_label = format_booking_start_label(
        start_at=booking.start_at,
        user=user,
        business=booking.business,
    )
    end_label = format_booking_start_label(
        start_at=booking.end_at,
        user=user,
        business=booking.business,
    )
    service_details = format_line_item_schedule(
        items=line_items,
        service_map=service_map,
        staff_map=staff_map,
        user=user,
        business=booking.business,
        include_staff=True,
    )

    assigned_details = service_details
    assigned_service_name = service_name
    if staff_id:
        staff_items = [item for item in line_items if str(item.staff_id) == str(staff_id)]
        if staff_items:
            assigned_names = [
                service_label(service_map=service_map, service_id=item.service_id)
                for item in staff_items
            ]
            assigned_names = [name for name in assigned_names if name]
            if len(assigned_names) == 1:
                assigned_service_name = assigned_names[0]
            elif assigned_names:
                assigned_service_name = f"{assigned_names[0]} + {len(assigned_names) - 1} more"
            assigned_details = format_line_item_schedule(
                items=staff_items,
                service_map=service_map,
                staff_map=staff_map,
                user=user,
                business=booking.business,
                include_staff=False,
            )

    duration = booking.duration_minutes or 0
    return {
        "{{booking_number}}": booking.booking_number or "",
        "{{service_name}}": service_name,
        "{{assigned_service_name}}": assigned_service_name,
        "{{customer_name}}": customer_name,
        "{{start_at}}": start_label,
        "{{end_at}}": end_label,
        "{{duration_minutes}}": str(duration),
        "{{staff_names}}": staff_names or "Unassigned",
        "{{service_details}}": service_details,
        "{{assigned_service_details}}": assigned_details,
        "{{status}}": booking.status or "",
        "{{business_name}}": booking.business.display_name or booking.business.business_name or "",
    }


def staff_assignment_changes(
    *,
    booking: Booking,
    previous_line_staff: dict[str, str],
) -> dict[str, list[BookingLineItem]]:
    changes: dict[str, list[BookingLineItem]] = defaultdict(list)
    for item in ordered_line_items(booking):
        previous = previous_line_staff.get(str(item.id), "")
        current = str(item.staff_id) if item.staff_id else ""
        if current and current != previous:
            changes[current].append(item)
    return changes


def build_staff_assignment_notification(
    *,
    booking: Booking,
    staff_id: str,
    items: list[BookingLineItem],
    user: Any | None = None,
) -> tuple[str, str]:
    replacements = build_booking_notification_replacements(
        booking=booking,
        user=user,
        staff_id=staff_id,
    )
    customer_name = replacements["{{customer_name}}"]
    assigned_service_name = replacements["{{assigned_service_name}}"]
    assigned_details = replacements["{{assigned_service_details}}"]
    booking_number = replacements["{{booking_number}}"]
    subject = f"Assigned · {assigned_service_name}"
    body = (
        f"You have been assigned to booking {booking_number} for {customer_name}. "
        f"{assigned_details}."
    )
    return subject, body
