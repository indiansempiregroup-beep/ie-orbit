from __future__ import annotations

from celery import shared_task


@shared_task(name="notifications.process_booking_event")
def process_booking_event_task(event_id: str) -> str | None:
    from apps.bookings.models import BookingEvent
    from apps.notifications.services.notifications import NotificationService

    event = BookingEvent.objects.select_related("booking", "tenant", "booking__business").get(
        id=event_id
    )
    notifications = NotificationService().process_booking_event(event)
    if not notifications:
        return None
    return str(notifications[0].id)


@shared_task(name="notifications.send_booking_reminders")
def send_booking_reminders_task(lead_minutes: int = 15) -> dict[str, int]:
    from apps.notifications.services.reminders import BookingReminderService

    return BookingReminderService().send_due_reminders(lead_minutes=lead_minutes)
