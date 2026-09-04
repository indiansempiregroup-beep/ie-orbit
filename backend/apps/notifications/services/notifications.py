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
from apps.notifications.services.preferences import channel_enabled
from apps.notifications.services.realtime import publish_notification_created

logger = logging.getLogger("ie_orbit.notifications")


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


def format_booking_start_label(
    *, start_at: datetime, user: Any | None = None, business: Any | None = None
) -> str:
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
        template_code = self._template_code_for_event(
            event.event_type,
            audience=audience,
            event=event,
            user=user,
        )
        template = self._get_template(event, template_code)
        if not template:
            return None

        deliver_in_app = channel_enabled(user=user, channel=NotificationChannel.IN_APP)
        deliver_push = channel_enabled(user=user, channel=NotificationChannel.FIREBASE_PUSH)
        deliver_email = channel_enabled(user=user, channel=NotificationChannel.EMAIL) and bool(user.email)
        if not any((deliver_in_app, deliver_push, deliver_email)):
            return None

        if Notification.objects.filter(
            tenant=event.tenant,
            booking=event.booking,
            user=user,
            metadata__event_type=event.event_type,
            metadata__audience=audience,
        ).exists():
            return None

        context = self._render_context(event=event, template=template, user=user, audience=audience)
        notification: Notification | None = None

        if deliver_in_app:
            notification = Notification.objects.create(
                tenant=event.tenant,
                business=event.booking.business,
                user=user,
                booking=event.booking,
                template=template,
                channel=NotificationChannel.IN_APP,
                subject=context.get("subject", template.subject),
                body=context.get("body", template.body),
                status=NotificationStatus.SENT,
                external_id="in_app",
                metadata={"event_type": event.event_type, "audience": audience},
            )
            NotificationHistory.objects.create(
                tenant=event.tenant,
                notification=notification,
                event_type=event.event_type,
                payload=event.payload,
            )
            NotificationQueue.objects.create(
                tenant=event.tenant,
                notification=notification,
                next_attempt_at=timezone.now(),
            )
            publish_notification_created(notification=notification)

        if deliver_email:
            self._send_branded_booking_email(
                event=event,
                user=user,
                context=context,
                audience=audience,
            )

        if deliver_push:
            push_title, push_body = self._push_content(
                event=event,
                context=context,
                audience=audience,
                template=template,
            )
            push_result = self._send_expo_push(
                event=event,
                notification=notification,
                user=user,
                subject=push_title,
                body=push_body,
                audience=audience,
                event_type=event.event_type,
            )
            if push_result is not None and notification is not None:
                NotificationLog.objects.create(
                    tenant=event.tenant,
                    notification=notification,
                    provider="expo_push",
                    response_code="200" if not push_result.get("error") else "502",
                    response_body=push_result,
                )

        if notification is None:
            return None

        logger.info(
            "Notification processed",
            extra={
                "event_type": event.event_type,
                "notification_id": str(notification.id),
                "audience": audience,
                "user_id": str(user.id),
            },
        )
        return notification

    def _send_expo_push(
        self,
        *,
        event: BookingEvent,
        notification: Notification | None,
        user: User,
        subject: str,
        body: str,
        audience: str,
        event_type: str,
    ) -> dict[str, Any] | None:
        from apps.notifications.services.expo_push import send_push_to_user

        try:
            result = send_push_to_user(
                tenant=event.tenant,
                user=user,
                title=subject,
                body=body,
                data={
                    "notification_id": str(notification.id) if notification is not None else "",
                    "booking_id": str(event.booking_id),
                    "event_type": event_type,
                    "audience": audience,
                },
            )
        except Exception:
            logger.exception(
                "Expo push failed",
                extra={
                    "notification_id": str(notification.id) if notification is not None else "",
                    "user_id": str(user.id),
                },
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
        """Notify owners/managers and every staff member assigned on the booking."""
        from apps.common.utils.workspace_access import resolve_business_manager_users
        from apps.staff.models import Staff

        users: dict[str, User] = {
            str(user.id): user
            for user in resolve_business_manager_users(
                tenant=event.tenant,
                business=event.booking.business,
            )
        }

        staff_ids: set[Any] = set()
        for item in event.booking.line_items.order_by("sort_order", "start_at"):
            if item.staff_id:
                staff_ids.add(item.staff_id)
        if not staff_ids and event.booking.staff_id:
            staff_ids.add(event.booking.staff_id)

        if staff_ids:
            for staff in (
                Staff.objects.filter(
                    id__in=staff_ids,
                    user__isnull=False,
                    user__is_active=True,
                )
                .select_related("user")
            ):
                if staff.user is not None:
                    users[str(staff.user_id)] = staff.user

        if exclude_user is not None:
            users.pop(str(exclude_user.id), None)

        return list(users.values())

    def _staff_id_for_user(self, *, booking: Any, user: User) -> str | None:
        from apps.staff.models import Staff

        staff = (
            Staff.objects.filter(user_id=user.id, business_id=booking.business_id)
            .order_by("-updated_at")
            .first()
        )
        if staff is None:
            return None
        for item in booking.line_items.order_by("sort_order", "start_at"):
            if item.staff_id and str(item.staff_id) == str(staff.id):
                return str(staff.id)
        if booking.staff_id and str(booking.staff_id) == str(staff.id):
            return str(staff.id)
        return None

    def _render_context(
        self,
        *,
        event: BookingEvent,
        template: NotificationTemplate,
        user: User,
        audience: str,
    ) -> dict[str, Any]:
        from apps.bookings.services.notification_context import build_booking_notification_replacements

        booking = event.booking
        staff_id = self._staff_id_for_user(booking=booking, user=user) if audience == "admin" else None
        replacements = build_booking_notification_replacements(
            booking=booking,
            user=user,
            staff_id=staff_id,
        )

        payload = event.payload or {}
        rating = payload.get("rating")
        comment = payload.get("comment") or ""
        lead_minutes = payload.get("lead_minutes")
        replacements["{{rating}}"] = str(rating) if rating is not None else ""
        replacements["{{comment}}"] = str(comment)
        replacements["{{lead_minutes}}"] = str(lead_minutes) if lead_minutes is not None else "15"

        if audience == "admin" and staff_id:
            replacements["{{service_name}}"] = replacements["{{assigned_service_name}}"]
            replacements["{{service_details}}"] = replacements["{{assigned_service_details}}"]

        subject = template.subject
        body = template.body
        for key, value in replacements.items():
            subject = subject.replace(key, value)
            body = body.replace(key, value)

        business = booking.business
        service_name = replacements["{{service_name}}"]
        start_label = replacements["{{start_at}}"]
        staff_label = replacements["{{staff_names}}"]
        from apps.notifications.services.providers.email import email_info_card

        detail_lines = [line for line in [
            start_label,
            f"With {staff_label}" if staff_label else "",
            f"#{booking.booking_number} · {str(booking.status).replace('_', ' ').title()}",
        ] if line]
        service_details = replacements["{{service_details}}"].strip()
        if service_details:
            detail_lines.append(service_details)
        extra_html = email_info_card(
            title=service_name or "Appointment",
            lines=detail_lines,
        )
        headline = str(subject).split("·", 1)[0].strip() if "·" in str(subject) else str(subject)
        # Drop emoji-only noise from reminder subjects for the body headline.
        for prefix in ("⏰ ", "📋 ", "✨ "):
            if headline.startswith(prefix):
                headline = headline[len(prefix):].strip()
        return {
            "subject": subject,
            "body": body,
            "headline": headline,
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
            "customer_name": replacements["{{customer_name}}"],
            "service_name": replacements["{{service_name}}"],
            "assigned_service_name": replacements["{{assigned_service_name}}"],
            "start_at": replacements["{{start_at}}"],
            "staff_names": replacements["{{staff_names}}"],
            "lead_minutes": replacements["{{lead_minutes}}"],
        }

    def _send_branded_booking_email(
        self,
        *,
        event: BookingEvent,
        user: User,
        context: dict[str, Any],
        audience: str,
    ) -> None:
        if not user.email:
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
            metadata={"event_type": event.event_type, "audience": audience},
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
                "Booking email failed",
                extra={
                    "notification_id": str(notification.id),
                    "user_id": str(user.id),
                    "audience": audience,
                },
            )
            notification.status = NotificationStatus.FAILED
            notification.external_id = "email_failed"
            notification.save(update_fields=["status", "external_id", "updated_at"])

    def _template_code_for_event(
        self,
        event_type: str,
        *,
        audience: str,
        event: BookingEvent | None = None,
        user: User | None = None,
    ) -> str:
        if (
            event_type == "BookingReminder"
            and audience == "admin"
            and event is not None
            and user is not None
            and self._staff_id_for_user(booking=event.booking, user=user)
        ):
            return "booking_reminder_staff"

        base_mapping = {
            "BookingCreated": "booking_created",
            "BookingPending": "booking_pending",
            "BookingConfirmed": "booking_confirmed",
            "BookingCancelled": "booking_cancelled",
            "BookingRescheduled": "booking_rescheduled",
            "BookingReminder": "booking_reminder",
            "BookingCompleted": "booking_completed",
            "BookingReviewed": "booking_reviewed",
            "BookingStaffAssigned": "booking_staff_assigned",
        }
        base = base_mapping.get(event_type, "welcome")
        if audience == "admin":
            return f"{base}{ADMIN_TEMPLATE_SUFFIX}"
        return base

    def _push_content(
        self,
        *,
        event: BookingEvent,
        context: dict[str, Any],
        audience: str,
        template: NotificationTemplate,
    ) -> tuple[str, str]:
        subject = str(context.get("subject", template.subject))
        body = str(context.get("body", template.body))
        if event.event_type != "BookingReminder":
            return subject, self._compact_push_body(body)

        if audience == "customer":
            service_name = str(context.get("service_name") or context.get("booking_number") or "your appointment")
            start_at = str(context.get("start_at") or "")
            return (
                subject,
                f"{service_name} at {start_at} — see you soon!",
            )

        if template.code == "booking_reminder_staff":
            customer_name = str(context.get("customer_name") or "")
            service_name = str(context.get("assigned_service_name") or "")
            start_at = str(context.get("start_at") or "")
            return (
                subject,
                f"{service_name} with {customer_name} at {start_at}",
            )

        customer_name = str(context.get("customer_name") or "")
        service_name = str(context.get("service_name") or "")
        start_at = str(context.get("start_at") or "")
        return (
            subject,
            f"{customer_name} · {service_name} at {start_at}",
        )

    @staticmethod
    def _compact_push_body(body: str, *, max_length: int = 160) -> str:
        compact = " ".join(line.strip() for line in body.splitlines() if line.strip())
        if len(compact) <= max_length:
            return compact
        return f"{compact[: max_length - 1].rstrip()}…"

    def _build_provider(self) -> NotificationProvider:
        provider_setting = getattr(settings, "NOTIFICATION_PROVIDER", "email")
        if provider_setting == "firebase_push":
            return FirebasePushProvider()
        return EmailProvider()
