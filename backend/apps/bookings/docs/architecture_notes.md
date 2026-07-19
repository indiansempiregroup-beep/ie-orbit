# M8 Architecture Notes

## Purpose

The booking engine is a reusable platform engine for appointment-based products. It owns scheduling,
availability, booking lifecycle validation, conflict detection, and event-ready state changes.

## Boundaries

The engine does not render calendars, send notifications, sync Google Calendar, process payments,
create invoices, or calculate analytics.

## Availability Source of Truth

Availability is calculated from:

- staff weekly schedules
- staff special availability
- staff leave
- existing bookings (per staff)
- business holidays and emergency closures
- service duration input
- buffer time input
- current time (only future start times are returned)

When no staff is selected, slots are the union of free times across eligible active staff
(optionally limited to staff assigned to the selected service). Booking create without
`staff_id` auto-assigns the least-booked available staff for that window.

## Booking Rules

The booking service validates:

- double booking
- business hours
- staff availability
- holiday and closure windows
- minimum notice
- advance booking window
- maximum daily bookings

Business-specific numeric policies are read from `BusinessSettings.booking_settings`.

## Domain References

Customer, service, and staff models are not concrete in the current repository. The booking model
stores UUID references and indexes them for future foreign-key migration or service-level joins.

## Events

State changes write `BookingEvent` records. Consumers in later milestones can publish these to an
event bus, notification engine, calendar integration, or analytics engine.
