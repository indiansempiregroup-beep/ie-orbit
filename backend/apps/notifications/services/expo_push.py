from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger("ie_orbit.notifications.expo_push")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_CHUNK_SIZE = 100
DEVICE_ERROR_CODES = frozenset({"DeviceNotRegistered", "InvalidCredentials"})


def send_expo_push_messages(messages: list[dict[str, Any]]) -> dict[str, Any]:
    if not messages:
        return {"data": []}

    tickets: list[Any] = []
    errors: list[str] = []
    for index in range(0, len(messages), EXPO_CHUNK_SIZE):
        chunk = messages[index : index + EXPO_CHUNK_SIZE]
        payload = json.dumps(chunk).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
        }
        access_token = str(getattr(settings, "EXPO_ACCESS_TOKEN", "") or "").strip()
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        request = urllib.request.Request(
            EXPO_PUSH_URL,
            data=payload,
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                body = response.read().decode("utf-8")
                parsed = json.loads(body) if body else {"data": []}
                chunk_data = parsed.get("data")
                if isinstance(chunk_data, list):
                    tickets.extend(chunk_data)
                elif chunk_data is not None:
                    tickets.append(chunk_data)
                if parsed.get("errors"):
                    errors.extend(str(item) for item in parsed["errors"])
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            logger.warning("Expo push send failed: %s", exc)
            errors.append(str(exc))

    result: dict[str, Any] = {"data": tickets}
    if errors:
        result["error"] = "; ".join(errors)
    return result


def push_enabled_for_user(user: Any) -> bool:
    prefs = getattr(user, "notification_preferences", None)
    if not isinstance(prefs, dict):
        return True
    return prefs.get("push", True) is not False


def send_push_to_user(
    *,
    tenant: Any,
    user: Any,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Send Expo push to all active devices for a user; deactivate bad tokens."""
    from apps.notifications.models import MobileDevice

    if not push_enabled_for_user(user):
        return {"skipped": "push_disabled", "data": []}

    devices = list(
        MobileDevice.objects.filter(
            tenant=tenant,
            user=user,
            is_active=True,
            deleted_at__isnull=True,
        ).only("id", "expo_push_token")
    )
    if not devices:
        return {"skipped": "no_devices", "data": []}

    messages = [
        {
            "to": device.expo_push_token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
            "channelId": "default",
        }
        for device in devices
        if device.expo_push_token
    ]
    result = send_expo_push_messages(messages)
    _deactivate_invalid_tokens(devices=devices, tickets=result.get("data") or [])
    return result


def _deactivate_invalid_tokens(*, devices: list[Any], tickets: list[Any]) -> None:
    from apps.notifications.models import MobileDevice

    invalid_tokens: list[str] = []
    for index, ticket in enumerate(tickets):
        if not isinstance(ticket, dict) or ticket.get("status") != "error":
            continue
        details = ticket.get("details") or {}
        error_code = details.get("error") if isinstance(details, dict) else None
        if error_code not in DEVICE_ERROR_CODES:
            continue
        if index < len(devices):
            invalid_tokens.append(devices[index].expo_push_token)

    if not invalid_tokens:
        return

    updated = MobileDevice.objects.filter(expo_push_token__in=invalid_tokens, is_active=True).update(
        is_active=False,
        updated_at=timezone.now(),
    )
    if updated:
        logger.info("Deactivated %s invalid Expo push tokens", updated)
