from __future__ import annotations

from typing import Any

from apps.notifications.services.providers.base import NotificationProvider
from apps.notifications.services.whatsapp_graph import send_template_message


class WhatsAppProvider(NotificationProvider):
    def send(self, *, template: Any, recipient: Any, context: dict[str, Any]) -> dict[str, Any]:
        phone_number_id = str(context.get("phone_number_id") or "")
        token = str(context.get("access_token") or "")
        template_name = str(context.get("template_name") or getattr(template, "code", "") or "")
        language = str(context.get("language") or "en")
        body_values = list(context.get("body_values") or [])
        return send_template_message(
            phone_number_id=phone_number_id,
            token=token,
            to=str(recipient or ""),
            template_name=template_name,
            language=language,
            body_values=body_values,
        )
