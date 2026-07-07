from __future__ import annotations

import json
import logging
from typing import Any

from django_redis import get_redis_connection

logger = logging.getLogger("ie_platform.notifications.realtime")

CHANNEL_PREFIX = "notifications:user:"


def user_notification_channel(user_id: str) -> str:
    return f"{CHANNEL_PREFIX}{user_id}"


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
    message = json.dumps(payload)
    try:
        client = get_redis_connection("default")
        client.publish(user_notification_channel(str(notification.user_id)), message)
    except Exception:
        logger.exception(
            "Failed to publish realtime notification",
            extra={"notification_id": str(notification.id), "user_id": str(notification.user_id)},
        )
