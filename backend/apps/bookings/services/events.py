from __future__ import annotations

import logging
from typing import Any

from django.db import transaction

from apps.bookings.models import Booking, BookingEvent

logger = logging.getLogger("ie_platform.bookings")


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
        event_id = str(event.id)

        def enqueue() -> None:
            from apps.notifications.tasks import process_booking_event_task

            try:
                process_booking_event_task.delay(event_id)
            except Exception:
                logger.exception(
                    "Failed to enqueue booking notification task",
                    extra={"booking_event_id": event_id, "booking_id": str(booking.id)},
                )

        transaction.on_commit(enqueue)
        return event
