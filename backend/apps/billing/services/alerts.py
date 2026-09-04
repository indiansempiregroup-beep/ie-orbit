from __future__ import annotations

import logging

from django.conf import settings

from apps.billing.models import BillingWebhookEvent
from apps.notifications.services.providers.email import email_info_card, send_branded_email

logger = logging.getLogger("ie_orbit.billing.alerts")


class BillingAlertService:
    def notify_webhook_failure(self, *, webhook_event: BillingWebhookEvent) -> None:
        recipients = self._recipients()
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
            send_branded_email(
                subject=f"[IE Orbit] Billing webhook failed: {webhook_event.event_type}",
                body="A billing webhook failed during processing. Review the details below.",
                recipient=recipients,
                business_name="IE Orbit",
                headline="Billing webhook failed",
                extra_html=email_info_card(
                    title="Event details",
                    lines=[
                        f"Event ID: {webhook_event.external_event_id}",
                        f"Type: {webhook_event.event_type}",
                        f"Status: {webhook_event.status}",
                        f"Retry count: {webhook_event.retry_count}",
                        f"Error: {webhook_event.error_message}",
                    ],
                ),
                fail_silently=True,
            )

    def _recipients(self) -> list[str]:
        configured = getattr(settings, "BILLING_WEBHOOK_ALERT_RECIPIENTS", "")
        return [item.strip() for item in configured.split(",") if item.strip()]
