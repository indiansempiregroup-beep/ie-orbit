from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.authentication.models import User
from apps.bookings.models import BookingEvent
from apps.notifications.models import (
    Notification,
    NotificationChannel,
    NotificationHistory,
    NotificationLog,
    NotificationQueue,
    NotificationStatus,
    NotificationTemplate,
)
from apps.notifications.repositories.notifications import NotificationRepository
from apps.notifications.services.providers import EmailProvider, FirebasePushProvider, NotificationProvider
from apps.notifications.services.realtime import publish_notification_created

logger = logging.getLogger("ie_platform.notifications")

CUSTOMER_TEMPLATE_SUFFIX = ""
ADMIN_TEMPLATE_SUFFIX = "_admin"


def _resolve_zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo((name or "").strip() or "UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def format_booking_start_label(*, start_at: datetime, user: Any | None, business: Any | None) -> str:
    """Format booking time for notifications: user timezone → business → UTC."""
    user_tz = getattr(user, "timezone", None) if user is not None else None
    business_tz = getattr(business, "timezone", None) if business is not None else None
    zone = _resolve_zone(user_tz or business_tz or "UTC")
    local_start = timezone.localtime(start_at, timezone=zone)
    return local_start.strftime("%d %b %Y, %I:%M %p")


class NotificationService:
    def __init__(
        self,
        repository: NotificationRepository | None = None,
        provider: NotificationProvider | None = None,
    ) -> None:
        self.repository = repository or NotificationRepository()
        self.provider = provider or self._build_provider()

    @transaction.atomic
    def process_booking_event(self, event: BookingEvent) -> list[Notification]:
        from apps.notifications.services.template_seed import ensure_notification_templates

        ensure_notification_templates(tenant=event.tenant, business=event.booking.business)
        notifications: list[Notification] = []
        customer_user = self._resolve_customer_user(event)
        if customer_user is not None:
            notification = self._deliver_for_user(
                event=event,
                user=customer_user,
                audience="customer",
            )
            if notification is not None:
                notifications.append(notification)

        for admin_user in self._resolve_admin_users(event, exclude_user=customer_user):
            notification = self._deliver_for_user(
                event=event,
                user=admin_user,
                audience="admin",
            )
            if notification is not None:
                notifications.append(notification)

        return notifications

    def mark_read(self, *, notification: Notification) -> Notification:
        notification.is_read = True
        notification.status = NotificationStatus.READ
        notification.save(update_fields=["is_read", "status", "updated_at"])
        return notification

    def mark_all_read(
        self,
        *,
        tenant: Any,
        user: Any,
        audience: str | None = None,
        business: Any | None = None,
    ) -> int:
        queryset = self.repository.list_for_request(
            tenant=tenant,
            user=user,
            audience=audience,
            business=business,
        ).filter(is_read=False)
        count = queryset.update(is_read=True, status=NotificationStatus.READ)
        return count

    def _deliver_for_user(
        self,
        *,
        event: BookingEvent,
        user: User,
        audience: str,
    ) -> Notification | None:
        template_code = self._template_code_for_event(event.event_type, audience=audience)
        template = self._get_template(event, template_code)
        if not template:
            return None
        context = self._render_context(event=event, template=template, user=user, audience=audience)
        notification = Notification.objects.create(
            tenant=event.tenant,
            business=event.booking.business,
            user=user,
            booking=event.booking,
            template=template,
            channel=template.channel,
            subject=context.get("subject", template.subject),
            body=context.get("body", template.body),
            status=NotificationStatus.PENDING,
            metadata={"event_type": event.event_type, "audience": audience},
        )
        NotificationHistory.objects.create(
            tenant=event.tenant,
            notification=notification,
            event_type=event.event_type,
            payload=event.payload,
        )
        if template.channel == NotificationChannel.IN_APP:
            notification.status = NotificationStatus.SENT
            notification.external_id = "in_app"
            notification.save(update_fields=["status", "external_id", "updated_at"])
        elif user.email:
            result = self.provider.send(template=template, recipient=user.email, context=context)
            notification.status = NotificationStatus.SENT
            notification.external_id = result.get("provider", "unknown")
            notification.save(update_fields=["status", "external_id", "updated_at"])
            NotificationLog.objects.create(
                tenant=event.tenant,
                notification=notification,
                provider=result.get("provider", "unknown"),
                response_code="200",
                response_body=result,
            )
        else:
            notification.status = NotificationStatus.SENT
            notification.external_id = "no_recipient"
            notification.save(update_fields=["status", "external_id", "updated_at"])

        NotificationQueue.objects.create(
            tenant=event.tenant,
            notification=notification,
            next_attempt_at=timezone.now(),
        )
        logger.info(
            "Notification processed",
            extra={
                "event_type": event.event_type,
                "notification_id": str(notification.id),
                "audience": audience,
                "user_id": str(user.id),
            },
        )
        publish_notification_created(notification=notification)
        return notification

    def _get_template(self, event: BookingEvent, template_code: str) -> NotificationTemplate | None:
        queryset = NotificationTemplate.objects.filter(
            tenant=event.tenant,
            business=event.booking.business,
            code=template_code,
            locale="en",
            is_active=True,
        )
        return queryset.order_by("-created_at").first()

    def _resolve_customer_user(self, event: BookingEvent) -> User | None:
        actor_id = getattr(event.booking, "created_by", None)
        if actor_id:
            actor = User.objects.filter(id=actor_id).first()
            if actor is not None:
                return actor

        if not event.booking.customer_id:
            return None
        from apps.customers.models import Customer

        customer = Customer.objects.filter(id=event.booking.customer_id).first()
        if customer is None:
            return None
        if customer.email:
            user = User.objects.filter(email__iexact=customer.email).first()
            if user is not None:
                return user
        if customer.phone_number:
            return User.objects.filter(phone_number=customer.phone_number).first()
        return None

    def _resolve_admin_users(self, event: BookingEvent, exclude_user: User | None = None) -> list[User]:
        users: dict[str, User] = {}
        tenant = event.tenant
        business = event.booking.business
        owner = getattr(tenant, "owner", None)
        if owner is not None and getattr(owner, "is_active", True):
            users[str(owner.id)] = owner

        from apps.staff.models import Staff, StaffRoleAssignment

        assignments = StaffRoleAssignment.objects.filter(
            tenant=tenant,
            staff__business=business,
            staff__user__isnull=False,
            staff__employment_status="active",
            role__role_type__in=["owner", "manager", "receptionist"],
        ).select_related("staff__user")
        for assignment in assignments:
            staff_user = assignment.staff.user
            if staff_user is not None:
                users[str(staff_user.id)] = staff_user

        assigned_staff_id = event.booking.staff_id
        if assigned_staff_id:
            staff = Staff.objects.filter(id=assigned_staff_id, user__isnull=False).select_related("user").first()
            if staff and staff.user is not None:
                users[str(staff.user_id)] = staff.user

        if exclude_user is not None:
            users.pop(str(exclude_user.id), None)

        return list(users.values())

    def _render_context(
        self,
        *,
        event: BookingEvent,
        template: NotificationTemplate,
        user: User,
        audience: str,
    ) -> dict[str, Any]:
        booking = event.booking
        service_name = ""
        if booking.service_id:
            from apps.services.models import Service

            service = Service.objects.filter(id=booking.service_id).first()
            if service is not None:
                service_name = service.display_name or service.name

        customer_name = "Customer"
        if booking.customer_id:
            from apps.customers.models import Customer

            customer = Customer.objects.filter(id=booking.customer_id).first()
            if customer is not None:
                customer_name = customer.display_name or customer_name

        start_label = format_booking_start_label(
            start_at=booking.start_at,
            user=user,
            business=booking.business,
        )
        replacements = {
            "{{booking_number}}": booking.booking_number,
            "{{service_name}}": service_name,
            "{{customer_name}}": customer_name,
            "{{start_at}}": start_label,
            "{{status}}": booking.status,
        }
        subject = template.subject
        body = template.body
        for key, value in replacements.items():
            subject = subject.replace(key, value)
            body = body.replace(key, value)

        return {
            "subject": subject,
            "body": body,
            "booking_id": str(booking.id),
            "booking_number": booking.booking_number,
            "status": booking.status,
            "event_type": event.event_type,
            "user": user,
            "audience": audience,
        }

    def _template_code_for_event(self, event_type: str, *, audience: str) -> str:
        base_mapping = {
            "BookingCreated": "booking_created",
            "BookingPending": "booking_pending",
            "BookingConfirmed": "booking_confirmed",
            "BookingCancelled": "booking_cancelled",
            "BookingRescheduled": "booking_rescheduled",
            "BookingReminder": "booking_reminder",
            "BookingCompleted": "booking_completed",
        }
        base = base_mapping.get(event_type, "welcome")
        if audience == "admin":
            return f"{base}{ADMIN_TEMPLATE_SUFFIX}"
        return base

    def _build_provider(self) -> NotificationProvider:
        provider_setting = getattr(settings, "NOTIFICATION_PROVIDER", "email")
        if provider_setting == "firebase_push":
            return FirebasePushProvider()
        return EmailProvider()
