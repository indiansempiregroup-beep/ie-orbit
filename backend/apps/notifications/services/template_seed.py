from __future__ import annotations

from django.db import DatabaseError

from apps.businesses.models import Business
from apps.notifications.models import NotificationChannel, NotificationTemplate
from apps.tenancy.models import Tenant

CUSTOMER_TEMPLATES: tuple[tuple[str, str, str], ...] = (
    (
        "booking_created",
        "We've received your booking at {{business_name}}",
        "Hi {{customer_name}},\n\nYour booking {{booking_number}} for {{service_name}} on {{start_at}} is in.\n\nWe'll confirm shortly.\n\n— {{business_name}}",
    ),
    (
        "booking_confirmed",
        "You're confirmed · {{service_name}}",
        "Great news, {{customer_name}}!\n\nYour booking {{booking_number}} for {{service_name}} on {{start_at}} is confirmed.\n\nSee you soon.\n\n— {{business_name}}",
    ),
    (
        "booking_cancelled",
        "Booking cancelled · {{booking_number}}",
        "Hi {{customer_name}},\n\nYour booking {{booking_number}} for {{service_name}} on {{start_at}} has been cancelled.\n\nNeed a new time? Reply anytime.\n\n— {{business_name}}",
    ),
    (
        "booking_rescheduled",
        "New time for {{service_name}}",
        "Hi {{customer_name}},\n\nYour booking {{booking_number}} for {{service_name}} has been moved to {{start_at}}.\n\n— {{business_name}}",
    ),
    (
        "booking_completed",
        "Thanks for visiting {{business_name}}",
        "Hi {{customer_name}},\n\nThanks for visiting us. Booking {{booking_number}} for {{service_name}} is complete.\n\nWe'd love your feedback.\n\n— {{business_name}}",
    ),
    (
        "booking_reminder",
        "Starting soon · {{service_name}}",
        "Reminder: your booking {{booking_number}} for {{service_name}} starts at {{start_at}} (about 15 minutes).\n\n— {{business_name}}",
    ),
)

ADMIN_TEMPLATES: tuple[tuple[str, str, str], ...] = (
    (
        "booking_created_admin",
        "New booking · {{customer_name}}",
        "{{customer_name}} requested {{service_name}} on {{start_at}} ({{booking_number}}).",
    ),
    (
        "booking_confirmed_admin",
        "Confirmed · {{booking_number}}",
        "Booking {{booking_number}} for {{customer_name}} on {{start_at}} is confirmed.",
    ),
    (
        "booking_cancelled_admin",
        "Cancelled · {{booking_number}}",
        "{{customer_name}} cancelled booking {{booking_number}} for {{start_at}}.",
    ),
    (
        "booking_rescheduled_admin",
        "Rescheduled · {{booking_number}}",
        "{{customer_name}} rescheduled booking {{booking_number}} to {{start_at}}.",
    ),
    (
        "booking_completed_admin",
        "Completed · {{booking_number}}",
        "Booking {{booking_number}} for {{customer_name}} has been marked complete.",
    ),
    (
        "booking_reminder_admin",
        "Upcoming · {{customer_name}}",
        "Reminder: {{customer_name}} has {{service_name}} at {{start_at}} ({{booking_number}}).",
    ),
    (
        "booking_reviewed_admin",
        "New review · {{rating}}★",
        "{{customer_name}} left a {{rating}}★ review for {{service_name}} ({{booking_number}}).",
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
        return created
    return created
