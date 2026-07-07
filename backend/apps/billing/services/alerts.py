from __future__ import annotations

import logging
from typing import Iterable

from django.conf import settings
from django.core.mail import send_mail

from apps.billing.models import BillingWebhookEvent

logger = logging.getLogger("ie_platform.billing.alerts")


class BillingAlertService:
    def notify_webhook_failure(self, *, webhook_event: BillingWebhookEvent) -> None:
        recipients = self._recipients()
        message = (
            "Billing webhook processing failed.\n\n"
            f"Event ID: {webhook_event.external_event_id}\n"
            f"Type: {webhook_event.event_type}\n"
            f"Status: {webhook_event.status}\n"
            f"Retry count: {webhook_event.retry_count}\n"
            f"Error: {webhook_event.error_message}\n"
        )
        logger.error(
            "billing.webhook.alert",
            extra={
                "external_event_id": webhook_event.external_event_id,
                "event_type": webhook_event.event_type,
                "status": webhook_event.status,
                "retry_count": webhook_event.retry_count,
            },
        )
        if recipients:
            send_mail(
                subject=f"[IE Platform] Billing webhook failed: {webhook_event.event_type}",
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=list(recipients),
                fail_silently=True,
            )

    def _recipients(self) -> list[str]:
        configured = getattr(settings, "BILLING_WEBHOOK_ALERT_RECIPIENTS", "")
        return [item.strip() for item in configured.split(",") if item.strip()]
