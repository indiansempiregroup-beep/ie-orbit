from __future__ import annotations

import logging
from typing import Any

from django.conf import settings

logger = logging.getLogger("ie_platform.calendar")


class GoogleCalendarService:
    def connect(self, *, tenant: Any, business: Any, data: dict[str, Any]) -> dict[str, Any]:
        return {"connected": True, "provider": "google", "business_id": str(business.id)}

    def disconnect(self, *, tenant: Any, business: Any) -> dict[str, Any]:
        return {"connected": False, "provider": "google", "business_id": str(business.id)}

    def status(self, *, tenant: Any, business: Any) -> dict[str, Any]:
        return {"connected": False, "provider": "google", "business_id": str(business.id)}

    def create_event(self, *, tenant: Any, business: Any, payload: dict[str, Any]) -> dict[str, Any]:
        return {"event_id": "google-event", "status": "created"}

    def update_event(self, *, tenant: Any, business: Any, event_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {"event_id": event_id, "status": "updated"}

    def delete_event(self, *, tenant: Any, business: Any, event_id: str) -> dict[str, Any]:
        return {"event_id": event_id, "status": "deleted"}
