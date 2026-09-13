from __future__ import annotations

import logging
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from apps.notifications.constants import AUDIENCE_ADMIN
from apps.notifications.models import (
    Notification,
    NotificationChannel,
    NotificationLog,
    NotificationStatus,
)
from apps.notifications.services.preferences import channel_enabled
from apps.notifications.services.realtime import publish_notification_created

logger = logging.getLogger("ie_orbit.notifications.subscription")


@dataclass(frozen=True)
class SubscriptionEmailStyle:
    business_name: str = "IE Orbit"
    logo_url: str = ""
    accent_color: str = "#1A56DB"
    headline: str = ""
    cta_label: str = ""
    cta_url: str = ""
    footer_note: str = "You’re receiving this because of an IE Orbit subscription."
    extra_html: str = ""
    fail_silently: bool = True


def notify_subscription_users(
    *,
    tenant: Any,
    business: Any,
    users: Iterable[Any],
    subject: str,
    body: str,
    event_type: str,
    metadata: dict[str, Any] | None = None,
    audience: str = AUDIENCE_ADMIN,
    email_style: SubscriptionEmailStyle | None = None,
    send_email: bool = True,
) -> None:
    seen: set[str] = set()
    for user in users:
        user_id = str(getattr(user, "id", "") or "")
        if not user_id or user_id in seen:
            continue
        seen.add(user_id)
        notify_subscription_user(
            tenant=tenant,
            business=business,
            user=user,
            subject=subject,
            body=body,
            event_type=event_type,
            metadata=metadata,
            audience=audience,
            email_style=email_style,
            send_email=send_email,
        )


def notify_subscription_user(
    *,
    tenant: Any,
    business: Any,
    user: Any,
    subject: str,
    body: str,
    event_type: str,
    metadata: dict[str, Any] | None = None,
    audience: str = AUDIENCE_ADMIN,
    email_style: SubscriptionEmailStyle | None = None,
    send_email: bool = True,
) -> None:
    meta = {
        "type": event_type,
        "event_type": event_type,
        "audience": audience,
        "business_id": str(getattr(business, "id", "") or ""),
        **(metadata or {}),
    }
    in_app = _create_in_app(
        tenant=tenant,
        business=business,
        user=user,
        subject=subject,
        body=body,
        meta=meta,
    )
    _send_push(
        notification=in_app,
        tenant=tenant,
        user=user,
        subject=subject,
        body=body,
        meta=meta,
        audience=audience,
    )
    if send_email:
        _send_email(
            user=user,
            subject=subject,
            body=body,
            style=email_style or SubscriptionEmailStyle(headline=subject),
        )


def _create_in_app(
    *,
    tenant: Any,
    business: Any,
    user: Any,
    subject: str,
    body: str,
    meta: dict[str, Any],
) -> Notification | None:
    try:
        notification = Notification.objects.create(
            tenant=tenant,
            business=business,
            user=user,
            channel=NotificationChannel.IN_APP,
            subject=subject[:255],
            body=body,
            status=NotificationStatus.SENT,
            metadata=meta,
        )
        try:
            publish_notification_created(notification=notification)
        except Exception:
            logger.exception(
                "subscription_in_app_publish_failed user_id=%s",
                getattr(user, "id", None),
            )
        return notification
    except Exception:
        logger.exception("subscription_in_app_failed user_id=%s", getattr(user, "id", None))
        return None


def _send_push(
    *,
    notification: Notification | None,
    tenant: Any,
    user: Any,
    subject: str,
    body: str,
    meta: dict[str, Any],
    audience: str,
) -> None:
    if not channel_enabled(user, NotificationChannel.FIREBASE_PUSH):
        return
    from apps.notifications.services.expo_push import send_push_to_user

    try:
        result = send_push_to_user(
            tenant=tenant,
            user=user,
            title=subject,
            body=body,
            across_tenants=True,
            data={
                "notification_id": str(notification.id) if notification is not None else "",
                "event_type": str(meta.get("event_type") or meta.get("type") or ""),
                "audience": audience,
                "tenant_id": str(getattr(tenant, "id", "") or ""),
                "business_id": str(meta.get("business_id") or ""),
                "session_id": str(meta.get("session_id") or ""),
                "subscription_id": str(meta.get("subscription_id") or ""),
                "product_code": str(meta.get("product_code") or ""),
                "screen": str(meta.get("screen") or ""),
            },
        )
    except Exception:
        logger.exception("subscription_push_failed user_id=%s", getattr(user, "id", None))
        return
    if result and not result.get("skipped") and notification is not None:
        NotificationLog.objects.create(
            tenant=tenant,
            notification=notification,
            provider="expo_push",
            response_code="200" if not result.get("error") else "502",
            response_body=result,
        )


def _send_email(
    *,
    user: Any,
    subject: str,
    body: str,
    style: SubscriptionEmailStyle,
) -> None:
    if not channel_enabled(user, NotificationChannel.EMAIL):
        return
    email = (getattr(user, "email", "") or "").strip()
    if not email:
        return
    from apps.notifications.services.providers.email import send_branded_email

    try:
        send_branded_email(
            subject=subject,
            body=body,
            recipient=email,
            business_name=style.business_name,
            logo_url=style.logo_url,
            accent_color=style.accent_color,
            headline=style.headline or subject,
            extra_html=style.extra_html,
            cta_label=style.cta_label,
            cta_url=style.cta_url,
            footer_note=style.footer_note,
            fail_silently=style.fail_silently,
        )
    except Exception:
        logger.exception("subscription_email_failed recipient=%s", email)
