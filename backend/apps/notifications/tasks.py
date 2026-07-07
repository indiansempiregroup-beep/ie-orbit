from __future__ import annotations

from celery import shared_task


@shared_task(name="notifications.process_booking_event")
def process_booking_event_task(event_id: str) -> str | None:
    from apps.bookings.models import BookingEvent
    from apps.notifications.services.notifications import NotificationService

    event = BookingEvent.objects.select_related("booking", "tenant", "booking__business").get(
        id=event_id
    )
    notification = NotificationService().process_booking_event(event)
    return str(notification.id) if notification else None
