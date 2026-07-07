from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail

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


@shared_task(name="billing.send_ops_digest")
def send_billing_ops_digest_task(window_hours: int = 24) -> dict[str, object]:
    from apps.billing.services.ops_digest import build_ops_digest
    from apps.tenancy.models import Tenant

    recipients_raw = (
        getattr(settings, "BILLING_OPS_DIGEST_RECIPIENTS", "")
        or getattr(settings, "BILLING_WEBHOOK_ALERT_RECIPIENTS", "")
    )
    recipients = [item.strip() for item in recipients_raw.split(",") if item.strip()]
    if not recipients:
        return {"sent": False, "reason": "no_recipients"}

    tenants = Tenant.objects.filter(status="active").order_by("display_name")
    digests = [build_ops_digest(tenant=tenant, window_hours=window_hours) for tenant in tenants]
    lines = [f"Billing ops digest ({window_hours}h)"]
    for digest in digests:
        lines.append(
            f"- {digest['tenant_name']} [{digest['tenant_slug']}]: "
            f"{'READY' if digest['ready'] else 'NOT READY'} | "
            f"failed={digest['metrics']['failed']} dead_letter={digest['metrics']['dead_letter']} "
            f"failure_rate={round(float(digest['metrics']['failure_rate']) * 100, 2)}%"
        )
    message = "\n".join(lines)
    send_mail(
        subject=f"[IE Platform] Billing Ops Digest ({window_hours}h)",
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=recipients,
        fail_silently=True,
    )
    return {
        "sent": True,
        "tenant_count": len(digests),
        "recipient_count": len(recipients),
    }
