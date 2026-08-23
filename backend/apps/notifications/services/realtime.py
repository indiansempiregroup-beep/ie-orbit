from __future__ import annotations

import json
import logging
from typing import Any

from django.conf import settings

logger = logging.getLogger("ie_platform.notifications.realtime")

CHANNEL_PREFIX = "notifications:user:"


def user_notification_channel(user_id: str) -> str:
    return f"{CHANNEL_PREFIX}{user_id}"


def realtime_redis() -> Any | None:
    """A raw Redis client for pub/sub, or None when realtime is unavailable.

    The cache backend only exposes a connection when it is django_redis, which
    is production-only; local development runs LocMemCache. Connecting through
    REDIS_URL keeps pub/sub working in both, and returning None lets callers
    fall back to polling instead of failing the request.
    """
    url = str(getattr(settings, "REDIS_URL", "") or "")
    if not url:
        return None
    try:
        import redis

        return redis.Redis.from_url(url, socket_connect_timeout=5, socket_timeout=5)
    except Exception:
        logger.warning("Realtime notifications disabled: cannot reach Redis.", exc_info=True)
        return None


def publish_notification_created(*, notification: Any) -> None:
    if notification.user_id is None:
        return

    payload = {
        "type": "notification.created",
        "data": {
            "id": str(notification.id),
            "tenant_id": str(notification.tenant_id),
            "business_id": str(notification.business_id),
            "audience": (notification.metadata or {}).get("audience"),
            "subject": notification.subject,
            "body": notification.body,
            "channel": notification.channel,
            "status": notification.status,
            "is_read": notification.is_read,
            "created_at": notification.created_at.isoformat() if notification.created_at else None,
            "booking_id": str(notification.booking_id) if notification.booking_id else None,
        },
    }
    client = realtime_redis()
    if client is None:
        return
    try:
        message = json.dumps(payload, default=str)
        client.publish(user_notification_channel(str(notification.user_id)), message)
    except Exception:
        logger.exception(
            "Failed to publish realtime notification",
            extra={"notification_id": str(notification.id), "user_id": str(notification.user_id)},
        )
