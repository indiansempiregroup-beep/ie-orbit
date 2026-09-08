from __future__ import annotations

from celery import shared_task
from django.conf import settings


@shared_task(name="billing.apply_period_end_plan_changes")
def apply_period_end_plan_changes_task() -> dict[str, object]:
    from apps.businesses.services.subscription_lifecycle import SubscriptionLifecycleService

    return SubscriptionLifecycleService().apply_due_period_ends()


@shared_task(name="billing.send_renewal_reminders")
def send_renewal_reminders_task() -> dict[str, object]:
    from apps.businesses.services.subscription_lifecycle import SubscriptionLifecycleService

    return SubscriptionLifecycleService().send_renewal_reminders()


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


def _ops_digest_recipients() -> list[str]:
    recipients_raw = (
        getattr(settings, "BILLING_OPS_DIGEST_RECIPIENTS", "")
        or getattr(settings, "BILLING_WEBHOOK_ALERT_RECIPIENTS", "")
    )
    recipients = [item.strip() for item in str(recipients_raw).split(",") if item.strip()]
    if recipients:
        return recipients
    from apps.platform_admin.services import _platform_admin_emails

    return _platform_admin_emails()


@shared_task(name="billing.send_ops_digest")
def send_billing_ops_digest_task(window_hours: int = 24) -> dict[str, object]:
    from apps.billing.services.ops_digest import build_platform_digest
    from apps.notifications.services.providers.email import send_branded_email

    recipients = _ops_digest_recipients()
    if not recipients:
        return {"sent": False, "reason": "no_recipients"}

    digest = build_platform_digest(window_hours=window_hours)
    send_branded_email(
        subject=digest["subject"],
        body=digest["body"],
        recipient=recipients,
        business_name="IE Orbit",
        headline=digest["headline"],
        extra_html=digest["extra_html"],
        help_html=digest["help_html"],
        cta_label=digest["cta_label"],
        cta_url=digest["cta_url"],
        accent_color=digest["accent_color"],
        footer_note=digest["footer_note"],
        fail_silently=True,
    )
    return {
        "sent": True,
        "tenant_count": digest["tenant_count"],
        "attention_count": digest["attention_count"],
        "recipient_count": len(recipients),
    }
