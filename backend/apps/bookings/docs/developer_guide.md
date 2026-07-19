# Booking Engine Developer Guide

## Creating Bookings

Use `BookingService` for booking mutations:

```python
from apps.bookings.services import BookingService

booking = BookingService().create_booking(
    tenant=request.current_tenant,
    business=business,
    data=payload,
    actor=request.user,
)
```

The service validates:

- time range
- business hours
- staff hours
- holidays and closures
- staff leave
- double booking
- buffer/capacity
- optional business booking rules

## Availability

Use `AvailabilityService` to generate slots:

```python
from apps.bookings.services import AvailabilityService

# Specific staff — only that person's free slots (after current time)
slots = AvailabilityService().staff_slots(
    tenant=tenant,
    business=business,
    staff_id=staff.id,
    target_date=date.today(),
    duration_minutes=30,
)

# No staff selected — union of free slots for eligible staff (optionally filtered by service)
slots = AvailabilityService().available_slots(
    tenant=tenant,
    business=business,
    target_date=date.today(),
    duration_minutes=30,
    service_id=service.id,
)

# Auto-assign least-booked available staff for a chosen time
staff_id = AvailabilityService().assign_available_staff(
    tenant=tenant,
    business=business,
    start_at=start_at,
    end_at=end_at,
    service_id=service.id,
)
```

Past start times are never returned. When creating a booking without `staff_id`,
`BookingService` assigns the least-booked eligible staff (or raises if none are free).

## Workflow

Status transitions are validated by `validate_booking_transition`.

Supported statuses:

- draft
- pending
- confirmed
- checked_in
- in_progress
- completed
- cancelled
- rejected
- no_show
- expired
- rescheduled

Do not update booking status directly from API code. Use `BookingService.transition()` or the
published action endpoints.

## Events

Booking changes create `BookingEvent` records such as:

- `BookingCreated`
- `BookingConfirmed`
- `BookingCancelled`
- `BookingCompleted`
- `BookingRescheduled`

The booking engine does not send notifications or sync calendars. Later milestones should consume
these event records.

## Future Domain Integration

`customer_id`, `service_id`, and `staff_id` are UUID references until concrete customer, service,
and staff domain models are present in the source tree.
