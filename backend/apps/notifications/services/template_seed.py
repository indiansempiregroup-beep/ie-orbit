from __future__ import annotations

from django.db import DatabaseError

from apps.businesses.models import Business
from apps.notifications.models import NotificationChannel, NotificationTemplate
from apps.tenancy.models import Tenant

CUSTOMER_TEMPLATES: tuple[tuple[str, str, str], ...] = (
    (
        "booking_created",
        "Booking request received",
        "Your booking {{booking_number}} for {{service_name}} on {{start_at}} has been received.",
    ),
    (
        "booking_confirmed",
        "Booking confirmed",
        "Your booking {{booking_number}} for {{service_name}} on {{start_at}} is confirmed.",
    ),
    (
        "booking_cancelled",
        "Booking cancelled",
        "Your booking {{booking_number}} for {{service_name}} on {{start_at}} has been cancelled.",
    ),
    (
        "booking_rescheduled",
        "Booking rescheduled",
        "Your booking {{booking_number}} for {{service_name}} has been moved to {{start_at}}.",
    ),
    (
        "booking_completed",
        "Visit completed",
        "Thanks for visiting us. Your booking {{booking_number}} for {{service_name}} is complete.",
    ),
)

ADMIN_TEMPLATES: tuple[tuple[str, str, str], ...] = (
    (
        "booking_created_admin",
        "New booking request",
        "{{customer_name}} requested {{service_name}} on {{start_at}} ({{booking_number}}).",
    ),
    (
        "booking_confirmed_admin",
        "Booking confirmed",
        "Booking {{booking_number}} for {{customer_name}} on {{start_at}} is confirmed.",
    ),
    (
        "booking_cancelled_admin",
        "Booking cancelled",
        "{{customer_name}} cancelled booking {{booking_number}} for {{start_at}}.",
    ),
    (
        "booking_rescheduled_admin",
        "Booking rescheduled",
        "{{customer_name}} rescheduled booking {{booking_number}} to {{start_at}}.",
    ),
    (
        "booking_completed_admin",
        "Booking completed",
        "Booking {{booking_number}} for {{customer_name}} has been marked complete.",
    ),
)


def ensure_notification_templates(*, tenant: Tenant, business: Business) -> int:
    created = 0
    try:
        for code, subject, body in CUSTOMER_TEMPLATES:
            _, was_created = NotificationTemplate.objects.update_or_create(
                tenant=tenant,
                business=business,
                code=code,
                locale="en",
                defaults={
                    "name": subject,
                    "subject": subject,
                    "body": body,
                    "channel": NotificationChannel.IN_APP,
                    "is_active": True,
                },
            )
            if was_created:
                created += 1

        for code, subject, body in ADMIN_TEMPLATES:
            _, was_created = NotificationTemplate.objects.update_or_create(
                tenant=tenant,
                business=business,
                code=code,
                locale="en",
                defaults={
                    "name": subject,
                    "subject": subject,
                    "body": body,
                    "channel": NotificationChannel.IN_APP,
                    "is_active": True,
                },
            )
            if was_created:
                created += 1
    except DatabaseError:
        return 0
    return created
