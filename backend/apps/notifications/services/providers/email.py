from __future__ import annotations

from typing import Any

from django.core.mail import send_mail

from apps.notifications.services.providers.base import NotificationProvider


class EmailProvider(NotificationProvider):
    def send(self, *, template: Any, recipient: Any, context: dict[str, Any]) -> dict[str, Any]:
        send_mail(
            subject=str(context.get("subject", template.subject)),
            message=str(context.get("body", template.body)),
            from_email=None,
            recipient_list=[str(recipient)],
            fail_silently=False,
        )
        return {"provider": "email", "status": "sent"}
