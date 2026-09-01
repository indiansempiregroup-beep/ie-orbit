from __future__ import annotations

import logging
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
from apps.notifications.services.realtime import publish_notification_created
from apps.tenancy.models import Tenant

logger = logging.getLogger("ie_orbit.notifications")


class StaffDirectNotifier:
    """Send in-app (+ push) notifications to business owners/managers."""

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
    ) -> dict[str, Any]:
        wanted = {str(c).strip().lower() for c in (channels or ["in_app"]) if str(c).strip()}
        users = resolve_business_manager_users(tenant=tenant, business=business)
        sent_user_ids: list[str] = []
        notification_ids: list[str] = []
        meta = {
            "event_type": event_type,
            "audience": AUDIENCE_ADMIN,
            **(metadata or {}),
        }

        for user in users:
            if "in_app" not in wanted:
                continue
            notification = Notification.objects.create(
                tenant=tenant,
                business=business,
                user=user,
                channel=NotificationChannel.IN_APP,
                subject=subject,
                body=body,
                status=NotificationStatus.SENT,
                external_id="in_app",
                metadata=meta,
            )
            NotificationQueue.objects.create(
                tenant=tenant,
                notification=notification,
                next_attempt_at=timezone.now(),
            )
            publish_notification_created(notification=notification)
            self._send_push(
                notification=notification,
                user=user,
                subject=subject,
                body=body,
                event_type=event_type,
                metadata=meta,
            )
            sent_user_ids.append(str(user.id))
            notification_ids.append(str(notification.id))

        return {
            "sent_channels": ["in_app"] if notification_ids else [],
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
    ) -> dict[str, Any]:
        from apps.staff.models import EmploymentStatus, Staff

        if not staff_ids:
            return {"sent_channels": [], "notification_ids": [], "user_ids": []}

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
        meta = {
            "event_type": event_type,
            "audience": AUDIENCE_ADMIN,
            **(metadata or {}),
        }

        for staff in staff_rows:
            user = staff.user
            if user is None:
                continue
            booking_id = meta.get("booking_id")
            notification = Notification.objects.create(
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
                notification=notification,
                next_attempt_at=timezone.now(),
            )
            publish_notification_created(notification=notification)
            self._send_push(
                notification=notification,
                user=user,
                subject=subject,
                body=body,
                event_type=event_type,
                metadata=meta,
            )
            sent_user_ids.append(str(user.id))
            notification_ids.append(str(notification.id))

        return {
            "sent_channels": ["in_app"] if notification_ids else [],
            "notification_ids": notification_ids,
            "user_ids": sent_user_ids,
        }

    def _send_push(
        self,
        *,
        notification: Notification,
        user: User,
        subject: str,
        body: str,
        event_type: str,
        metadata: dict[str, Any],
    ) -> None:
        from apps.notifications.services.expo_push import send_push_to_user

        try:
            result = send_push_to_user(
                tenant=notification.tenant,
                user=user,
                title=subject,
                body=body,
                data={
                    "notification_id": str(notification.id),
                    "event_type": event_type,
                    "audience": AUDIENCE_ADMIN,
                    "pet_id": str(metadata.get("pet_id") or ""),
                    "booking_id": str(metadata.get("booking_id") or ""),
                    "order_id": str(metadata.get("order_id") or ""),
                },
            )
        except Exception:
            logger.exception(
                "Expo push failed for staff notify",
                extra={"notification_id": str(notification.id), "user_id": str(user.id)},
            )
            return
        if result and not result.get("skipped"):
            NotificationLog.objects.create(
                tenant=notification.tenant,
                notification=notification,
                provider="expo_push",
                response_code="200" if not result.get("error") else "502",
                response_body=result,
            )
