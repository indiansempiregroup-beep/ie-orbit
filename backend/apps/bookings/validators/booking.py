from __future__ import annotations

from datetime import datetime

from django.core.exceptions import ValidationError

from apps.bookings.models import BookingStatus

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    BookingStatus.DRAFT: {BookingStatus.PENDING, BookingStatus.CANCELLED, BookingStatus.EXPIRED},
    BookingStatus.PENDING: {
        BookingStatus.CONFIRMED,
        BookingStatus.REJECTED,
        BookingStatus.CANCELLED,
        BookingStatus.EXPIRED,
        BookingStatus.RESCHEDULED,
    },
    BookingStatus.CONFIRMED: {
        BookingStatus.CHECKED_IN,
        BookingStatus.IN_PROGRESS,
        BookingStatus.COMPLETED,
        BookingStatus.CANCELLED,
        BookingStatus.NO_SHOW,
        BookingStatus.RESCHEDULED,
    },
    BookingStatus.CHECKED_IN: {
        BookingStatus.IN_PROGRESS,
        BookingStatus.COMPLETED,
        BookingStatus.NO_SHOW,
    },
    BookingStatus.IN_PROGRESS: {BookingStatus.COMPLETED, BookingStatus.CANCELLED},
    BookingStatus.RESCHEDULED: {
        BookingStatus.PENDING,
        BookingStatus.CONFIRMED,
        BookingStatus.CANCELLED,
    },
}


def validate_booking_transition(from_status: str, to_status: str) -> None:
    if from_status == to_status:
        return
    allowed = ALLOWED_TRANSITIONS.get(from_status, set())
    if to_status not in allowed:
        raise ValidationError(f"Booking cannot transition from {from_status} to {to_status}.")


def validate_time_range(start_at: datetime, end_at: datetime) -> None:
    if end_at <= start_at:
        raise ValidationError("Booking end time must be after start time.")
