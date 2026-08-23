from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from apps.notifications.services.realtime import (
    publish_notification_created,
    user_notification_channel,
)


@pytest.mark.django_db
def test_publish_notification_created_publishes_user_channel() -> None:
    notification = MagicMock()
    notification.id = "019f0000-0000-7000-8000-000000000101"
    notification.user_id = "019f0000-0000-7000-8000-000000000202"
    notification.tenant_id = "019f0000-0000-7000-8000-000000000303"
    notification.business_id = "019f0000-0000-7000-8000-000000000404"
    notification.subject = "Booking confirmed"
    notification.body = "Your booking is confirmed."
    notification.channel = "in_app"
    notification.status = "sent"
    notification.is_read = False
    notification.created_at = None
    notification.booking_id = None
    notification.metadata = {"audience": "customer"}

    redis_client = MagicMock()
    with patch("apps.notifications.services.realtime.realtime_redis", return_value=redis_client):
        publish_notification_created(notification=notification)

    redis_client.publish.assert_called_once()
    channel, payload = redis_client.publish.call_args.args
    assert channel == user_notification_channel(str(notification.user_id))
    parsed = json.loads(payload)
    assert parsed["type"] == "notification.created"
    assert parsed["data"]["subject"] == "Booking confirmed"


def test_publish_notification_created_is_a_no_op_without_redis() -> None:
    notification = MagicMock()
    notification.user_id = "019f0000-0000-7000-8000-000000000202"
    notification.metadata = {}

    # Realtime is optional: a missing Redis must not break notification writes.
    with patch("apps.notifications.services.realtime.realtime_redis", return_value=None):
        publish_notification_created(notification=notification)


def test_publish_notification_created_skips_without_user() -> None:
    notification = MagicMock()
    notification.user_id = None

    redis_client = MagicMock()
    with patch("apps.notifications.services.realtime.realtime_redis", return_value=redis_client):
        publish_notification_created(notification=notification)

    redis_client.publish.assert_not_called()
