from __future__ import annotations

import logging
from datetime import datetime
from types import SimpleNamespace
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
from apps.notifications.services.branding import absolute_public_url
from apps.notifications.services.providers import EmailProvider, FirebasePushProvider, NotificationProvider
from apps.notifications.services.realtime import publish_notification_created

logger = logging.getLogger("ie_platform.notifications")


def _escape_html(value: object) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )

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
        # Customer already submitted the review; only notify business users.
        if event.event_type != "BookingReviewed" and customer_user is not None:
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
        if not self._channel_enabled_for_user(user=user, channel=template.channel):
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
            if audience == "customer":
                self._send_branded_customer_email(event=event, user=user, context=context)
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

        push_result = self._send_expo_push(
            notification=notification,
            user=user,
            subject=str(context.get("subject", template.subject)),
            body=str(context.get("body", template.body)),
            audience=audience,
            event_type=event.event_type,
        )
        if push_result is not None:
            NotificationLog.objects.create(
                tenant=event.tenant,
                notification=notification,
                provider="expo_push",
                response_code="200" if not push_result.get("error") else "502",
                response_body=push_result,
            )

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

    def _send_expo_push(
        self,
        *,
        notification: Notification,
        user: User,
        subject: str,
        body: str,
        audience: str,
        event_type: str,
    ) -> dict[str, Any] | None:
        from apps.notifications.services.expo_push import send_push_to_user

        try:
            result = send_push_to_user(
                tenant=notification.tenant,
                user=user,
                title=subject,
                body=body,
                data={
                    "notification_id": str(notification.id),
                    "booking_id": str(notification.booking_id) if notification.booking_id else "",
                    "event_type": event_type,
                    "audience": audience,
                },
            )
        except Exception:
            logger.exception(
                "Expo push failed",
                extra={"notification_id": str(notification.id), "user_id": str(user.id)},
            )
            return {"error": "exception"}

        if result.get("skipped"):
            return None
        return result

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
        """Notify owners/managers for the business, plus the staff assigned to the booking."""
        from apps.common.utils.workspace_access import resolve_business_manager_users
        from apps.staff.models import Staff

        users: dict[str, User] = {
            str(user.id): user
            for user in resolve_business_manager_users(
                tenant=event.tenant,
                business=event.booking.business,
            )
        }

        assigned_staff_id = event.booking.staff_id
        if assigned_staff_id:
            staff = (
                Staff.objects.filter(id=assigned_staff_id, user__isnull=False, user__is_active=True)
                .select_related("user")
                .first()
            )
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
        payload = event.payload or {}
        rating = payload.get("rating")
        comment = payload.get("comment") or ""
        replacements = {
            "{{booking_number}}": booking.booking_number,
            "{{service_name}}": service_name,
            "{{customer_name}}": customer_name,
            "{{start_at}}": start_label,
            "{{status}}": booking.status,
            "{{rating}}": str(rating) if rating is not None else "",
            "{{comment}}": str(comment),
            "{{business_name}}": booking.business.display_name or booking.business.business_name or "",
        }
        subject = template.subject
        body = template.body
        for key, value in replacements.items():
            subject = subject.replace(key, value)
            body = body.replace(key, value)

        business = booking.business
        extra_html = (
            "<div style='margin-top:18px;padding:16px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;'>"
            "<div style='font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;font-weight:700;'>Appointment</div>"
            f"<div style='margin-top:4px;font-size:16px;font-weight:800;color:#0f172a;'>{_escape_html(service_name or 'Booking')}</div>"
            f"<p style='margin:8px 0 0;font-size:14px;color:#334155;'>{_escape_html(start_label)}</p>"
            f"<p style='margin:4px 0 0;font-size:13px;color:#64748b;'>#{_escape_html(booking.booking_number)} · {_escape_html(booking.status)}</p>"
            "</div>"
        )
        return {
            "subject": subject,
            "body": body,
            "booking_id": str(booking.id),
            "booking_number": booking.booking_number,
            "status": booking.status,
            "event_type": event.event_type,
            "user": user,
            "audience": audience,
            "business_name": business.display_name or business.business_name or "",
            "business_logo": absolute_public_url(business.logo or ""),
            "accent_color": "#1A56DB",
            "extra_html": extra_html,
        }

    def _channel_enabled_for_user(self, *, user: User, channel: str) -> bool:
        prefs = getattr(user, "notification_preferences", None)
        if not isinstance(prefs, dict):
            return True
        if channel == NotificationChannel.EMAIL:
            if "email_updates" in prefs:
                return prefs.get("email_updates") is not False
            if "email" in prefs:
                return prefs.get("email") is not False
            return True
        if channel == NotificationChannel.SMS:
            if "sms_reminders" in prefs:
                return prefs.get("sms_reminders") is not False
            if "sms" in prefs:
                return prefs.get("sms") is not False
            return True
        if channel == NotificationChannel.FIREBASE_PUSH:
            return prefs.get("push", True) is not False
        if channel == NotificationChannel.IN_APP:
            return prefs.get("in_app", True) is not False
        return True

    def _send_branded_customer_email(self, *, event: BookingEvent, user: User, context: dict[str, Any]) -> None:
        if not user.email or not self._channel_enabled_for_user(user=user, channel=NotificationChannel.EMAIL):
            return
        notification = Notification.objects.create(
            tenant=event.tenant,
            business=event.booking.business,
            user=user,
            booking=event.booking,
            channel=NotificationChannel.EMAIL,
            subject=str(context.get("subject") or ""),
            body=str(context.get("body") or ""),
            status=NotificationStatus.PENDING,
            metadata={"event_type": event.event_type, "audience": "customer"},
        )
        try:
            result = EmailProvider().send(
                template=SimpleNamespace(subject=notification.subject, body=notification.body),
                recipient=user.email,
                context=context,
            )
            notification.status = NotificationStatus.SENT
            notification.external_id = str(result.get("provider") or "email")
            notification.save(update_fields=["status", "external_id", "updated_at"])
            NotificationLog.objects.create(
                tenant=event.tenant,
                notification=notification,
                provider=str(result.get("provider") or "email"),
                response_code="200",
                response_body=result,
            )
        except Exception:
            logger.exception(
                "Booking customer email failed",
                extra={"notification_id": str(notification.id), "user_id": str(user.id)},
            )
            notification.status = NotificationStatus.FAILED
            notification.external_id = "email_failed"
            notification.save(update_fields=["status", "external_id", "updated_at"])

    def _template_code_for_event(self, event_type: str, *, audience: str) -> str:
        base_mapping = {
            "BookingCreated": "booking_created",
            "BookingPending": "booking_pending",
            "BookingConfirmed": "booking_confirmed",
            "BookingCancelled": "booking_cancelled",
            "BookingRescheduled": "booking_rescheduled",
            "BookingReminder": "booking_reminder",
            "BookingCompleted": "booking_completed",
            "BookingReviewed": "booking_reviewed",
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
