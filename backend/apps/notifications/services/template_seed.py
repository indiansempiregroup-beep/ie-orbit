from __future__ import annotations

from django.db import DatabaseError

from apps.businesses.models import Business
from apps.notifications.models import NotificationChannel, NotificationTemplate
from apps.tenancy.models import Tenant

CUSTOMER_TEMPLATES: tuple[tuple[str, str, str], ...] = (
    (
        "booking_created",
        "We've received your booking at {{business_name}}",
        "Hi {{customer_name}},\n\nYour booking {{booking_number}} for {{service_name}} on {{start_at}} is in.\n\n{{service_details}}\n\nWe'll confirm shortly.\n\n— {{business_name}}",
    ),
    (
        "booking_confirmed",
        "You're confirmed · {{service_name}}",
        "Great news, {{customer_name}}!\n\nYour booking {{booking_number}} for {{service_name}} on {{start_at}} is confirmed.\n\n{{service_details}}\n\nSee you soon.\n\n— {{business_name}}",
    ),
    (
        "booking_cancelled",
        "Booking cancelled · {{booking_number}}",
        "Hi {{customer_name}},\n\nYour booking {{booking_number}} for {{service_name}} on {{start_at}} has been cancelled.\n\n{{service_details}}\n\nNeed a new time? Reply anytime.\n\n— {{business_name}}",
    ),
    (
        "booking_rescheduled",
        "New time for {{service_name}}",
        "Hi {{customer_name}},\n\nYour booking {{booking_number}} for {{service_name}} has been moved to {{start_at}}.\n\n{{service_details}}\n\n— {{business_name}}",
    ),
    (
        "booking_completed",
        "Thanks for visiting {{business_name}}",
        "Hi {{customer_name}},\n\nThanks for visiting us. Booking {{booking_number}} for {{service_name}} is complete.\n\n{{service_details}}\n\nWe'd love your feedback.\n\n— {{business_name}}",
    ),
    (
        "booking_reminder",
        "⏰ Your appointment starts in 15 minutes!",
        "Hi {{customer_name}},\n\nYour upcoming appointment at {{business_name}} is almost here!\n\n✨ {{service_name}}\n🕐 {{start_at}}\n👤 With {{staff_names}}\n\n{{service_details}}\n\nWe can't wait to see you!\n\n— {{business_name}}",
    ),
)

ADMIN_TEMPLATES: tuple[tuple[str, str, str], ...] = (
    (
        "booking_created_admin",
        "New booking · {{customer_name}}",
        "{{customer_name}} requested {{service_name}} on {{start_at}} ({{booking_number}}).\n\n{{service_details}}",
    ),
    (
        "booking_confirmed_admin",
        "Confirmed · {{booking_number}}",
        "Booking {{booking_number}} for {{customer_name}} on {{start_at}} is confirmed.\n\n{{service_details}}",
    ),
    (
        "booking_cancelled_admin",
        "Cancelled · {{booking_number}}",
        "{{customer_name}} cancelled booking {{booking_number}} for {{start_at}}.\n\n{{service_details}}",
    ),
    (
        "booking_rescheduled_admin",
        "Rescheduled · {{booking_number}}",
        "{{customer_name}} rescheduled booking {{booking_number}} to {{start_at}}.\n\n{{service_details}}",
    ),
    (
        "booking_completed_admin",
        "Completed · {{booking_number}}",
        "Booking {{booking_number}} for {{customer_name}} has been marked complete.\n\n{{service_details}}",
    ),
    (
        "booking_reminder_admin",
        "📋 Upcoming appointment in 15 min",
        "Heads up! {{customer_name}} has an appointment starting at {{start_at}}.\n\n✨ {{service_name}}\n👤 Staff: {{staff_names}}\n📌 {{booking_number}}\n\n{{service_details}}",
    ),
    (
        "booking_reminder_staff",
        "✨ You're up in 15 minutes!",
        "Hi there — your upcoming appointment is almost here!\n\n👤 {{customer_name}}\n✨ {{assigned_service_name}}\n🕐 {{start_at}}\n\n{{assigned_service_details}}\n\nYou've got this!",
    ),
    (
        "booking_reviewed_admin",
        "New review · {{rating}}★",
        "{{customer_name}} left a {{rating}}★ review for {{service_name}} ({{booking_number}}).",
    ),
    (
        "booking_staff_assigned_admin",
        "Assigned · {{service_name}}",
        "You have been assigned to {{service_name}} for {{customer_name}} on {{start_at}} ({{booking_number}}).\n\n{{service_details}}",
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
