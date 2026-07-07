from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.utils import timezone

from apps.billing.models import BillingWebhookEvent, WebhookEventStatus
from apps.billing.services.checkout import CheckoutService
from apps.tenancy.models import Tenant


def build_ops_digest(*, tenant: Tenant, window_hours: int) -> dict[str, Any]:
    window_hours = max(1, min(window_hours, 24 * 30))
    since = timezone.now() - timedelta(hours=window_hours)
    queryset = BillingWebhookEvent.objects.filter(tenant=tenant, created_at__gte=since)
    total = queryset.count()
    failed = queryset.filter(status=WebhookEventStatus.FAILED).count()
    dead_letter = queryset.filter(status=WebhookEventStatus.DEAD_LETTER).count()
    stuck_retries = queryset.filter(
        status=WebhookEventStatus.FAILED,
        next_retry_at__isnull=False,
        next_retry_at__lt=timezone.now(),
    ).count()
    failure_rate = round((failed + dead_letter) / total, 4) if total else 0.0
    checkout_status = CheckoutService().get_status()

    blockers: list[str] = []
    if not checkout_status["configured"]:
        blockers.append("Configure Razorpay API credentials.")
    if not checkout_status["webhook_configured"]:
        blockers.append("Configure Razorpay webhook secret.")
    if dead_letter > 0:
        blockers.append(f"Resolve dead-letter backlog ({dead_letter}).")

    warnings: list[str] = []
    if stuck_retries > 0:
        warnings.append(f"Clear stuck retries ({stuck_retries}) by checking worker health.")
    if failure_rate >= 0.05:
        warnings.append(
            f"Webhook failure rate is elevated ({round(failure_rate * 100, 2)}%). Investigate before launch."
        )

    readiness = len(blockers) == 0
    summary_lines = [
        f"Billing ops digest for tenant {tenant.display_name} in last {window_hours}h.",
        (
            "Webhook events: "
            f"total={total}, failed={failed}, dead_letter={dead_letter}, "
            f"failure_rate={round(failure_rate * 100, 2)}%."
        ),
        "Launch posture: READY." if readiness else "Launch posture: NOT READY.",
    ]
    if blockers:
        summary_lines.append("Blockers: " + " ".join(blockers))
    if warnings:
        summary_lines.append("Warnings: " + " ".join(warnings))

    return {
        "tenant_id": str(tenant.id),
        "tenant_slug": tenant.slug,
        "tenant_name": tenant.display_name,
        "window_hours": window_hours,
        "ready": readiness,
        "blockers": blockers,
        "warnings": warnings,
        "metrics": {
            "total": total,
            "failed": failed,
            "dead_letter": dead_letter,
            "stuck_retries": stuck_retries,
            "failure_rate": failure_rate,
        },
        "digest_text": " ".join(summary_lines),
    }
