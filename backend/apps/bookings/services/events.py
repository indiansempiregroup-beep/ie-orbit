from __future__ import annotations

from typing import Any

from apps.bookings.models import Booking, BookingEvent


class BookingEventPublisher:
    def publish(
        self, *, booking: Booking, event_type: str, payload: dict[str, Any]
    ) -> BookingEvent:
        return BookingEvent.objects.create(
            tenant=booking.tenant,
            booking=booking,
            event_type=event_type,
            payload=payload,
        )
