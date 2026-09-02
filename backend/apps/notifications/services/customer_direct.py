from __future__ import annotations

import logging
from types import SimpleNamespace
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.authentication.models import User
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.notifications.models import (
    Notification,
    NotificationChannel,
    NotificationLog,
    NotificationQueue,
    NotificationStatus,
)
from apps.notifications.services.providers import EmailProvider
from apps.notifications.services.realtime import publish_notification_created
from apps.tenancy.models import Tenant

logger = logging.getLogger("ie_orbit.notifications")


class CustomerDirectNotifier:
    """Send in-app / email notifications to a shop customer (not booking-bound)."""

    def __init__(self, email_provider: EmailProvider | None = None) -> None:
        self.email_provider = email_provider or EmailProvider()

    @transaction.atomic
    def notify_customer(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer: Customer,
        subject: str,
        body: str,
        channels: list[str] | None = None,
        event_type: str = "CustomerDirectMessage",
        metadata: dict[str, Any] | None = None,
        extra_html: str = "",
        cta_label: str = "",
        cta_url: str = "",
    ) -> dict[str, Any]:
        from apps.notifications.services.branding import business_email_brand

        wanted = {str(c).strip().lower() for c in (channels or ["in_app", "email"]) if str(c).strip()}
        user = self._resolve_user(customer)
        sent_channels: list[str] = []
        notification_ids: list[str] = []
        brand = business_email_brand(business)
        meta = {
            "event_type": event_type,
            "audience": "customer",
            "customer_id": str(customer.id),
            **(metadata or {}),
        }

        if "in_app" in wanted and user is not None:
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
            self._send_push(notification=notification, user=user, subject=subject, body=body, event_type=event_type)
            sent_channels.append("in_app")
            notification_ids.append(str(notification.id))

        if "email" in wanted:
            recipient = (customer.email or "").strip() or (getattr(user, "email", None) or "")
            if recipient:
                notification = Notification.objects.create(
                    tenant=tenant,
                    business=business,
                    user=user,
                    channel=NotificationChannel.EMAIL,
                    subject=subject,
                    body=body,
                    status=NotificationStatus.PENDING,
                    metadata=meta,
                )
                try:
                    result = self.email_provider.send(
                        template=SimpleNamespace(subject=subject, body=body),
                        recipient=recipient,
                        context={
                            "subject": subject,
                            "body": body,
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
                except Exception as exc:
                    logger.exception(
                        "Customer email notify failed",
                        extra={"customer_id": str(customer.id), "event_type": event_type},
                    )
                    notification.status = NotificationStatus.FAILED
                    notification.external_id = "email_failed"
                    notification.save(update_fields=["status", "external_id", "updated_at"])
                    NotificationLog.objects.create(
                        tenant=tenant,
                        notification=notification,
                        provider="email",
                        response_code="500",
                        response_body={"error": str(exc)},
                    )
                NotificationQueue.objects.create(
                    tenant=tenant,
                    notification=notification,
                    next_attempt_at=timezone.now(),
                )
                notification_ids.append(str(notification.id))

        return {
            "sent_channels": sent_channels,
            "notification_ids": notification_ids,
            "user_id": str(user.id) if user else None,
        }

    def _resolve_user(self, customer: Customer) -> User | None:
        if customer.email:
            user = User.objects.filter(email__iexact=customer.email, is_active=True).first()
            if user is not None:
                return user
        if customer.phone_number:
            return User.objects.filter(phone_number=customer.phone_number, is_active=True).first()
        return None

    def _send_push(
        self,
        *,
        notification: Notification,
        user: User,
        subject: str,
        body: str,
        event_type: str,
    ) -> None:
        from apps.notifications.services.expo_push import send_push_to_user

        is_shipment = str(event_type or "").startswith("ShopShipment")
        push_channel = "shipment_updates" if is_shipment else "default"
        push_category = "shipment_updates" if is_shipment else ""
        try:
            result = send_push_to_user(
                tenant=notification.tenant,
                user=user,
                title=subject,
                body=body,
                channel_id=push_channel,
                category_id=push_category,
                data={
                    "notification_id": str(notification.id),
                    "event_type": event_type,
                    "audience": "customer",
                    "pet_id": str((notification.metadata or {}).get("pet_id") or ""),
                    "order_id": str((notification.metadata or {}).get("order_id") or ""),
                    "order_number": str((notification.metadata or {}).get("order_number") or ""),
                    "return_id": str((notification.metadata or {}).get("return_id") or ""),
                    "shipment_status": str((notification.metadata or {}).get("shipment_status") or ""),
                    "carrier_label": str((notification.metadata or {}).get("carrier_label") or ""),
                    "tracking_number": str((notification.metadata or {}).get("tracking_number") or ""),
                    "tracking_url": str((notification.metadata or {}).get("tracking_url") or ""),
                    "action": "track" if is_shipment else "",
                },
            )
        except Exception:
            logger.exception(
                "Expo push failed for customer notify",
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
