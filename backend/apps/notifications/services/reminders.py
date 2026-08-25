from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.bookings.models import Booking, BookingStatus
from apps.bookings.services.events import BookingEventPublisher

logger = logging.getLogger("ie_orbit.notifications")

REMINDER_METADATA_KEY = "reminder_15m_start_at"
REMINDER_LEAD_MINUTES = 15
REMINDER_ELIGIBLE_STATUSES = (
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
    BookingStatus.RESCHEDULED,
)


class BookingReminderService:
    """Send BookingReminder events for appointments starting within ~15 minutes."""

    def __init__(self, event_publisher: BookingEventPublisher | None = None) -> None:
        self.event_publisher = event_publisher or BookingEventPublisher()

    def send_due_reminders(self, *, lead_minutes: int = REMINDER_LEAD_MINUTES) -> dict[str, Any]:
        now = timezone.now()
        window_end = now + timedelta(minutes=lead_minutes)
        candidates = (
            Booking.objects.filter(
                status__in=REMINDER_ELIGIBLE_STATUSES,
                start_at__gt=now,
                start_at__lte=window_end,
                deleted_at__isnull=True,
            )
            .select_related("tenant", "business")
            .order_by("start_at")
        )

        sent = 0
        skipped = 0
        for booking in candidates.iterator(chunk_size=100):
            if self._already_reminded(booking):
                skipped += 1
                continue
            if self._publish_reminder(booking=booking, lead_minutes=lead_minutes):
                sent += 1
            else:
                skipped += 1

        logger.info(
            "Booking reminders processed",
            extra={"sent": sent, "skipped": skipped, "lead_minutes": lead_minutes},
        )
        return {"sent": sent, "skipped": skipped}

    def _already_reminded(self, booking: Booking) -> bool:
        metadata = booking.metadata if isinstance(booking.metadata, dict) else {}
        reminded_for = str(metadata.get(REMINDER_METADATA_KEY) or "")
        return bool(reminded_for and reminded_for == booking.start_at.isoformat())

    def _publish_reminder(self, *, booking: Booking, lead_minutes: int) -> bool:
        with transaction.atomic():
            locked = (
                Booking.objects.select_for_update()
                .filter(id=booking.id, deleted_at__isnull=True)
                .first()
            )
            if locked is None:
                return False
            now = timezone.now()
            if locked.status not in REMINDER_ELIGIBLE_STATUSES:
                return False
            if locked.start_at <= now or locked.start_at > now + timedelta(minutes=lead_minutes):
                return False
            metadata = dict(locked.metadata) if isinstance(locked.metadata, dict) else {}
            start_key = locked.start_at.isoformat()
            if str(metadata.get(REMINDER_METADATA_KEY) or "") == start_key:
                return False

            metadata[REMINDER_METADATA_KEY] = start_key
            locked.metadata = metadata
            locked.save(update_fields=["metadata", "updated_at"])

            self.event_publisher.publish(
                booking=locked,
                event_type="BookingReminder",
                payload={
                    "booking_id": str(locked.id),
                    "start_at": start_key,
                    "lead_minutes": lead_minutes,
                },
            )
        return True
