from __future__ import annotations

from celery import shared_task


@shared_task(name="billing.reprocess_webhook_event")
def reprocess_webhook_event_task(event_id: str) -> dict[str, object]:
    from apps.billing.models import BillingWebhookEvent
    from apps.billing.services.webhooks import WebhookService

    event = BillingWebhookEvent.objects.get(id=event_id)
    return WebhookService().reprocess_webhook_event(webhook_event=event)


@shared_task(name="billing.reconcile_sessions")
def reconcile_billing_sessions_task(tenant_id: str, lookback_hours: int = 72) -> dict[str, object]:
    from apps.billing.services.reconciliation import BillingReconciliationService
    from apps.tenancy.models import Tenant

    tenant = Tenant.objects.get(id=tenant_id)
    return BillingReconciliationService().reconcile(
        tenant=tenant,
        lookback_hours=lookback_hours,
    ).as_dict()
