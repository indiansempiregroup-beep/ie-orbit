from __future__ import annotations

from typing import Any

from apps.notifications.services.providers.base import NotificationProvider


class FirebasePushProvider(NotificationProvider):
    def send(self, *, template: Any, recipient: Any, context: dict[str, Any]) -> dict[str, Any]:
        return {"provider": "firebase_push", "status": "queued", "recipient": str(recipient)}
