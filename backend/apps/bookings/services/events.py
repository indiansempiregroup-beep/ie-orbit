from __future__ import annotations

from typing import Any

from apps.bookings.models import Booking, BookingEvent


class BookingEventPublisher:
    def publish(
        self, *, booking: Booking, event_type: str, payload: dict[str, Any]
    ) -> BookingEvent:
        event = BookingEvent.objects.create(
            tenant=booking.tenant,
            booking=booking,
            event_type=event_type,
            payload=payload,
        )
        from apps.notifications.tasks import process_booking_event_task

        process_booking_event_task.delay(str(event.id))
        return event
