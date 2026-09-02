from __future__ import annotations

from typing import Any

from apps.notifications.models import NotificationChannel

CANONICAL_PREFERENCE_KEYS = ("email", "push", "in_app", "sms")

_LEGACY_KEY_MAP = {
    "email_updates": "email",
    "sms_reminders": "sms",
}


def normalize_notification_preferences(prefs: dict[str, Any] | None) -> dict[str, bool]:
    """Return canonical notification preference keys with boolean values."""
    if not isinstance(prefs, dict):
        normalized = {key: True for key in CANONICAL_PREFERENCE_KEYS}
        normalized["in_app"] = True
        return normalized

    normalized: dict[str, bool] = {key: True for key in CANONICAL_PREFERENCE_KEYS}
    for key, value in prefs.items():
        canonical = _LEGACY_KEY_MAP.get(str(key), str(key))
        if canonical in normalized and isinstance(value, bool):
            normalized[canonical] = value
    normalized["in_app"] = True
    return normalized


def merge_notification_preferences(
    existing: dict[str, Any] | None,
    incoming: dict[str, Any] | None,
) -> dict[str, bool]:
    """Merge stored prefs with a patch payload and return canonical keys only."""
    base = normalize_notification_preferences(existing)
    if not isinstance(incoming, dict):
        return base

    for key, value in incoming.items():
        if not isinstance(value, bool):
            continue
        canonical = _LEGACY_KEY_MAP.get(str(key), str(key))
        if canonical in base and canonical != "in_app":
            base[canonical] = value
    base["in_app"] = True
    return base


def _pref_enabled(prefs: dict[str, Any], *keys: str) -> bool:
    for key in keys:
        if key in prefs:
            return prefs.get(key) is not False
    return True


def channel_enabled(user: Any, channel: str) -> bool:
    prefs = getattr(user, "notification_preferences", None)
    if not isinstance(prefs, dict):
        return True

    if channel == NotificationChannel.EMAIL:
        return _pref_enabled(prefs, "email", "email_updates")
    if channel == NotificationChannel.SMS:
        return _pref_enabled(prefs, "sms", "sms_reminders")
    if channel == NotificationChannel.FIREBASE_PUSH:
        return _pref_enabled(prefs, "push")
    if channel == NotificationChannel.IN_APP:
        return True
    return True


def any_channel_enabled(user: Any, channels: list[str]) -> bool:
    return any(channel_enabled(user, channel) for channel in channels)
