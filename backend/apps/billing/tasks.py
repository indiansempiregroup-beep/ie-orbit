from __future__ import annotations

from celery import shared_task


@shared_task(name="billing.reprocess_webhook_event")
def reprocess_webhook_event_task(event_id: str) -> dict[str, object]:
    from apps.billing.models import BillingWebhookEvent
    from apps.billing.services.webhooks import WebhookService

    event = BillingWebhookEvent.objects.get(id=event_id)
    return WebhookService().reprocess_webhook_event(webhook_event=event)
