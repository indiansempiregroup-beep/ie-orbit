from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.authentication.models import User
from apps.bookings.models import BookingEvent
from apps.notifications.models import Notification, NotificationHistory, NotificationLog, NotificationQueue, NotificationStatus, NotificationTemplate
from apps.notifications.repositories.notifications import NotificationRepository
from apps.notifications.services.providers import EmailProvider, FirebasePushProvider, NotificationProvider

logger = logging.getLogger("ie_platform.notifications")


class NotificationService:
    def __init__(
        self,
        repository: NotificationRepository | None = None,
        provider: NotificationProvider | None = None,
    ) -> None:
        self.repository = repository or NotificationRepository()
        self.provider = provider or self._build_provider()

    @transaction.atomic
    def process_booking_event(self, event: BookingEvent) -> Notification | None:
        template_code = self._template_code_for_event(event.event_type)
        template = self._get_template(event, template_code)
        if not template:
            return None
        user = self._resolve_user(event)
        context = self._render_context(event=event, template=template, user=user)
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
            metadata={"event_type": event.event_type},
        )
        NotificationHistory.objects.create(
            tenant=event.tenant,
            notification=notification,
            event_type=event.event_type,
            payload=event.payload,
        )
        result = self.provider.send(template=template, recipient=user.email if user else "", context=context)
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
        NotificationQueue.objects.create(
            tenant=event.tenant,
            notification=notification,
            next_attempt_at=timezone.now(),
        )
        logger.info("Notification processed", extra={"event_type": event.event_type, "notification_id": str(notification.id)})
        return notification

    def mark_read(self, *, notification: Notification) -> Notification:
        notification.is_read = True
        notification.status = NotificationStatus.READ
        notification.save(update_fields=["is_read", "status", "updated_at"])
        return notification

    def mark_all_read(self, *, tenant: Any, user: Any) -> int:
        queryset = self.repository.list_for_request(tenant=tenant, user=user).filter(is_read=False)
        count = queryset.update(is_read=True, status=NotificationStatus.READ)
        return count

    def _get_template(self, event: BookingEvent, template_code: str) -> NotificationTemplate | None:
        queryset = NotificationTemplate.objects.filter(
            tenant=event.tenant,
            business=event.booking.business,
            code=template_code,
            locale="en",
            is_active=True,
        )
        return queryset.order_by("-created_at").first()

    def _resolve_user(self, event: BookingEvent) -> Any | None:
        if not event.booking.customer_id:
            return None
        return User.objects.filter(id=event.booking.customer_id).first()

    def _render_context(self, *, event: BookingEvent, template: NotificationTemplate, user: Any) -> dict[str, Any]:
        context = {
            "subject": template.subject,
            "body": template.body,
            "booking_id": str(event.booking.id),
            "booking_number": event.booking.booking_number,
            "status": event.booking.status,
            "event_type": event.event_type,
            "user": user,
        }
        return context

    def _template_code_for_event(self, event_type: str) -> str:
        mapping = {
            "BookingCreated": "booking_created",
            "BookingPending": "booking_pending",
            "BookingConfirmed": "booking_confirmed",
            "BookingCancelled": "booking_cancelled",
            "BookingRescheduled": "booking_rescheduled",
            "BookingReminder": "booking_reminder",
            "BookingCompleted": "booking_completed",
        }
        return mapping.get(event_type, "welcome")

    def _build_provider(self) -> NotificationProvider:
        provider_setting = getattr(settings, "NOTIFICATION_PROVIDER", "email")
        if provider_setting == "firebase_push":
            return FirebasePushProvider()
        return EmailProvider()
