from __future__ import annotations

import logging
from types import SimpleNamespace
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.authentication.models import User
from apps.businesses.models import Business
from apps.common.utils.workspace_access import resolve_business_manager_users
from apps.notifications.constants import AUDIENCE_ADMIN
from apps.notifications.models import (
    Notification,
    NotificationChannel,
    NotificationLog,
    NotificationQueue,
    NotificationStatus,
)
from apps.notifications.services.preferences import channel_enabled
from apps.notifications.services.providers import EmailProvider
from apps.notifications.services.realtime import publish_notification_created
from apps.tenancy.models import Tenant

logger = logging.getLogger("ie_orbit.notifications")


class StaffDirectNotifier:
    """Send in-app, push, and email notifications to business owners/managers and staff."""

    def __init__(self, email_provider: EmailProvider | None = None) -> None:
        self.email_provider = email_provider or EmailProvider()

    @transaction.atomic
    def notify_managers(
        self,
        *,
        tenant: Tenant,
        business: Business,
        subject: str,
        body: str,
        event_type: str = "StaffDirectMessage",
        metadata: dict[str, Any] | None = None,
        channels: list[str] | None = None,
        headline: str = "",
        extra_html: str = "",
        cta_label: str = "",
        cta_url: str = "",
    ) -> dict[str, Any]:
        wanted = {str(c).strip().lower() for c in (channels or ["in_app"]) if str(c).strip()}
        users = resolve_business_manager_users(tenant=tenant, business=business)
        sent_user_ids: list[str] = []
        notification_ids: list[str] = []
        sent_channels: set[str] = set()
        meta = {
            "event_type": event_type,
            "audience": AUDIENCE_ADMIN,
            **(metadata or {}),
        }

        for user in users:
            result = self._notify_user(
                tenant=tenant,
                business=business,
                user=user,
                subject=subject,
                body=body,
                wanted=wanted,
                meta=meta,
                headline=headline,
                extra_html=extra_html,
                cta_label=cta_label,
                cta_url=cta_url,
            )
            if result["sent_channels"]:
                sent_user_ids.append(str(user.id))
                notification_ids.extend(result["notification_ids"])
                sent_channels.update(result["sent_channels"])

        return {
            "sent_channels": sorted(sent_channels),
            "notification_ids": notification_ids,
            "user_ids": sent_user_ids,
        }

    @transaction.atomic
    def notify_staff_members(
        self,
        *,
        tenant: Tenant,
        business: Business,
        staff_ids: list[Any],
        subject: str,
        body: str,
        event_type: str = "BookingStaffAssigned",
        metadata: dict[str, Any] | None = None,
        channels: list[str] | None = None,
    ) -> dict[str, Any]:
        from apps.staff.models import EmploymentStatus, Staff

        if not staff_ids:
            return {"sent_channels": [], "notification_ids": [], "user_ids": []}

        wanted = {str(c).strip().lower() for c in (channels or ["in_app"]) if str(c).strip()}
        staff_rows = (
            Staff.objects.require_tenant(tenant)
            .filter(
                id__in=staff_ids,
                business=business,
                employment_status=EmploymentStatus.ACTIVE,
                user__isnull=False,
                user__is_active=True,
            )
            .select_related("user")
        )
        sent_user_ids: list[str] = []
        notification_ids: list[str] = []
        sent_channels: set[str] = set()
        meta = {
            "event_type": event_type,
            "audience": AUDIENCE_ADMIN,
            **(metadata or {}),
        }

        for staff in staff_rows:
            user = staff.user
            if user is None:
                continue
            result = self._notify_user(
                tenant=tenant,
                business=business,
                user=user,
                subject=subject,
                body=body,
                wanted=wanted,
                meta=meta,
                booking_id=meta.get("booking_id"),
            )
            if result["sent_channels"]:
                sent_user_ids.append(str(user.id))
                notification_ids.extend(result["notification_ids"])
                sent_channels.update(result["sent_channels"])

        return {
            "sent_channels": sorted(sent_channels),
            "notification_ids": notification_ids,
            "user_ids": sent_user_ids,
        }

    def _notify_user(
        self,
        *,
        tenant: Tenant,
        business: Business,
        user: User,
        subject: str,
        body: str,
        wanted: set[str],
        meta: dict[str, Any],
        booking_id: Any | None = None,
        headline: str = "",
        extra_html: str = "",
        cta_label: str = "",
        cta_url: str = "",
    ) -> dict[str, Any]:
        from apps.notifications.services.branding import business_email_brand

        sent_channels: list[str] = []
        notification_ids: list[str] = []
        brand = business_email_brand(business)

        deliver_in_app = "in_app" in wanted and channel_enabled(user, NotificationChannel.IN_APP)
        deliver_push = channel_enabled(user, NotificationChannel.FIREBASE_PUSH) and (
            "in_app" in wanted or "email" in wanted
        )
        deliver_email = "email" in wanted and channel_enabled(user, NotificationChannel.EMAIL) and bool(user.email)

        in_app_notification: Notification | None = None

        if deliver_in_app:
            in_app_notification = Notification.objects.create(
                tenant=tenant,
                business=business,
                user=user,
                booking_id=booking_id or None,
                channel=NotificationChannel.IN_APP,
                subject=subject,
                body=body,
                status=NotificationStatus.SENT,
                external_id="in_app",
                metadata=meta,
            )
            NotificationQueue.objects.create(
                tenant=tenant,
                notification=in_app_notification,
                next_attempt_at=timezone.now(),
            )
            publish_notification_created(notification=in_app_notification)
            sent_channels.append("in_app")
            notification_ids.append(str(in_app_notification.id))

        if deliver_push:
            self._send_push(
                notification=in_app_notification,
                tenant=tenant,
                user=user,
                subject=subject,
                body=body,
                meta=meta,
            )
            if "push" not in sent_channels:
                sent_channels.append("push")

        if deliver_email:
            notification = Notification.objects.create(
                tenant=tenant,
                business=business,
                user=user,
                booking_id=booking_id or None,
                channel=NotificationChannel.EMAIL,
                subject=subject,
                body=body,
                status=NotificationStatus.PENDING,
                metadata=meta,
            )
            try:
                result = self.email_provider.send(
                    template=SimpleNamespace(subject=subject, body=body),
                    recipient=user.email,
                    context={
                        "subject": subject,
                        "body": body,
                        "headline": headline,
                        "extra_html": extra_html,
                        "cta_label": cta_label,
                        "cta_url": cta_url,
                        **brand,
                    },
                )
                notification.status = NotificationStatus.SENT
                notification.external_id = str(result.get("provider") or "email")
                notification.save(update_fields=["status", "external_id", "updated_at"])
                NotificationLog.objects.create(
                    tenant=tenant,
                    notification=notification,
                    provider=str(result.get("provider") or "email"),
                    response_code="200",
                    response_body=result,
                )
                sent_channels.append("email")
            except Exception:
                logger.exception(
                    "Staff email notify failed",
                    extra={"user_id": str(user.id), "event_type": meta.get("event_type")},
                )
                notification.status = NotificationStatus.FAILED
                notification.external_id = "email_failed"
                notification.save(update_fields=["status", "external_id", "updated_at"])
            NotificationQueue.objects.create(
                tenant=tenant,
                notification=notification,
                next_attempt_at=timezone.now(),
            )
            notification_ids.append(str(notification.id))

        return {"sent_channels": sent_channels, "notification_ids": notification_ids}

    def _send_push(
        self,
        *,
        notification: Notification | None,
        tenant: Tenant,
        user: User,
        subject: str,
        body: str,
        meta: dict[str, Any],
    ) -> None:
        from apps.notifications.services.expo_push import send_push_to_user

        try:
            result = send_push_to_user(
                tenant=tenant,
                user=user,
                title=subject,
                body=body,
                data={
                    "notification_id": str(notification.id) if notification is not None else "",
                    "event_type": str(meta.get("event_type") or ""),
                    "audience": AUDIENCE_ADMIN,
                    "pet_id": str(meta.get("pet_id") or ""),
                    "booking_id": str(meta.get("booking_id") or ""),
                    "order_id": str(meta.get("order_id") or ""),
                },
            )
        except Exception:
            logger.exception(
                "Expo push failed for staff notify",
                extra={
                    "notification_id": str(notification.id) if notification is not None else "",
                    "user_id": str(user.id),
                },
            )
            return
        if result and not result.get("skipped") and notification is not None:
            NotificationLog.objects.create(
                tenant=tenant,
                notification=notification,
                provider="expo_push",
                response_code="200" if not result.get("error") else "502",
                response_body=result,
            )
