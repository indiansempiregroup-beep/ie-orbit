# Bookings

Milestone M8 implements the IE Orbit scheduling and booking engine foundation.

## Scope

This app owns:

- Business schedules
- Weekly business hours
- Business holidays
- Special working days
- Emergency closures
- Staff weekly availability
- Staff leave
- Staff special availability
- Availability slot generation
- Booking CRUD
- Booking workflow transitions
- Booking timeline, notes, attachments, history, and event records

It intentionally does not implement notifications, Google Calendar sync, analytics, payments,
invoices, loyalty, or marketing.

## API

Endpoints are available under `/api/v1/`:

- `POST /bookings`
- `GET /bookings`
- `GET /bookings/{id}`
- `PATCH /bookings/{id}`
- `DELETE /bookings/{id}`
- `POST /bookings/{id}/confirm`
- `POST /bookings/{id}/cancel`
- `POST /bookings/{id}/reschedule`
- `POST /bookings/{id}/check-in`
- `POST /bookings/{id}/complete`
- `GET /availability`
- `GET /availability/staff`
- `GET /availability/business`

## Domain References

Customer, service, and staff concrete models are not present in the current source tree. M8 stores
`customer_id`, `service_id`, and `staff_id` as UUID references so the booking engine can integrate
with those approved domain models when they land without redesigning booking storage.
