from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db.models import Count, IntegerField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.billing.models import (
    BillingCheckoutSession,
    BillingWebhookEvent,
    CheckoutSessionStatus,
    WebhookEventStatus,
)
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
            "Webhook failure rate is elevated "
            f"({round(failure_rate * 100, 2)}%). Investigate before launch."
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


def _format_inr(paise: int) -> str:
    n = int(round(int(paise or 0) / 100))
    sign = "-" if n < 0 else ""
    s = str(abs(n))
    if len(s) <= 3:
        grouped = s
    else:
        last3, rest = s[-3:], s[:-3]
        chunks: list[str] = []
        while rest:
            chunks.append(rest[-2:])
            rest = rest[:-2]
        grouped = ",".join(reversed(chunks) + [last3])
    return f"{sign}₹{grouped}"


def _frontend_url(path: str) -> str:
    base = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
    return f"{base}{path}"


def _attention_reason(row: dict[str, Any]) -> str:
    parts: list[str] = []
    if row["dead_letter"]:
        parts.append(f"{row['dead_letter']} dead-letter")
    if row["stuck_retries"]:
        parts.append(f"{row['stuck_retries']} stuck retries")
    if row["failed"]:
        parts.append(f"{row['failed']} failed")
    rate = round(float(row["failure_rate"]) * 100, 1)
    if rate >= 5:
        parts.append(f"{rate}% failure rate")
    return " · ".join(parts) or "Needs review"


def build_platform_digest(*, window_hours: int = 24) -> dict[str, Any]:
    """Cross-tenant daily handoff used by the scheduled platform admin email."""
    from apps.billing.services.platform_revenue import build_platform_revenue_insights
    from apps.notifications.services.providers.email import (
        email_help_links,
        email_info_card,
        email_section_title,
        email_stat_grid,
        escape_email,
    )
    from apps.platform_admin.models import (
        PlatformPayout,
        PlatformPayoutStatus,
        SupportTicket,
    )

    window_hours = max(1, min(int(window_hours), 24 * 30))
    now = timezone.now()
    since = now - timedelta(hours=window_hours)
    local_now = timezone.localtime(now)

    tenants = list(Tenant.objects.filter(status="active").order_by("display_name"))
    tenant_ids = [tenant.id for tenant in tenants]
    webhook_rows = (
        BillingWebhookEvent.objects.filter(created_at__gte=since, tenant_id__in=tenant_ids)
        .values("tenant_id")
        .annotate(
            total=Count("id"),
            processed=Count("id", filter=Q(status=WebhookEventStatus.PROCESSED)),
            failed=Count("id", filter=Q(status=WebhookEventStatus.FAILED)),
            dead_letter=Count("id", filter=Q(status=WebhookEventStatus.DEAD_LETTER)),
            stuck_retries=Count(
                "id",
                filter=Q(
                    status=WebhookEventStatus.FAILED,
                    next_retry_at__isnull=False,
                    next_retry_at__lt=now,
                ),
            ),
        )
    )
    metrics_by_tenant = {row["tenant_id"]: row for row in webhook_rows}

    tenant_summaries: list[dict[str, Any]] = []
    totals = {"total": 0, "processed": 0, "failed": 0, "dead_letter": 0, "stuck_retries": 0}
    for tenant in tenants:
        metrics = metrics_by_tenant.get(tenant.id, {})
        total = int(metrics.get("total") or 0)
        failed = int(metrics.get("failed") or 0)
        dead_letter = int(metrics.get("dead_letter") or 0)
        stuck_retries = int(metrics.get("stuck_retries") or 0)
        processed = int(metrics.get("processed") or 0)
        failure_rate = round((failed + dead_letter) / total, 4) if total else 0.0
        attention = bool(dead_letter or stuck_retries or failed or failure_rate >= 0.05)
        row = {
            "tenant_id": str(tenant.id),
            "tenant_slug": tenant.slug,
            "tenant_name": tenant.display_name,
            "total": total,
            "processed": processed,
            "failed": failed,
            "dead_letter": dead_letter,
            "stuck_retries": stuck_retries,
            "failure_rate": failure_rate,
            "attention": attention,
        }
        tenant_summaries.append(row)
        for key in totals:
            totals[key] += row[key]

    attention_rows = [row for row in tenant_summaries if row["attention"]]
    attention_rows.sort(
        key=lambda row: (row["dead_letter"], row["stuck_retries"], row["failed"]),
        reverse=True,
    )
    webhook_total = totals["total"]
    success_rate = round((totals["processed"] / webhook_total) * 100, 1) if webhook_total else 100.0

    checkout = CheckoutService().get_status()
    revenue = build_platform_revenue_insights()
    paid_window = BillingCheckoutSession.objects.filter(status=CheckoutSessionStatus.PAID).filter(
        Q(paid_at__gte=since) | Q(paid_at__isnull=True, created_at__gte=since)
    )
    paid_agg = paid_window.aggregate(
        paise=Coalesce(Sum("amount_paise"), Value(0), output_field=IntegerField()),
        count=Count("id"),
    )
    collected_window_paise = int(paid_agg.get("paise") or 0)
    paid_window_count = int(paid_agg.get("count") or 0)

    new_tenant_qs = Tenant.objects.filter(created_at__gte=since).order_by("-created_at")
    new_tenant_count = new_tenant_qs.count()
    new_tenants = list(new_tenant_qs.values("display_name", "slug")[:8])
    open_tickets = SupportTicket.objects.filter(
        status__in=[SupportTicket.Status.OPEN, SupportTicket.Status.PENDING]
    )
    open_ticket_count = open_tickets.count()
    new_ticket_count = SupportTicket.objects.filter(created_at__gte=since).count()
    recent_tickets = list(
        open_tickets.select_related("tenant").order_by("-created_at")[:5]
    )
    pending_payouts = PlatformPayout.objects.filter(status=PlatformPayoutStatus.PENDING).count()

    health_ok = not attention_rows and checkout["configured"] and checkout["webhook_configured"]
    accent = "#067d62" if health_ok else "#b45309"
    window_label = f"last {window_hours} hours"
    try:
        date_label = local_now.strftime("%A, %-d %b %Y")
    except ValueError:
        date_label = local_now.strftime("%A, %d %b %Y")

    if attention_rows:
        n = len(attention_rows)
        subject = (
            f"[IE Orbit] Daily digest · {n} workspace{'s' if n != 1 else ''} need attention"
        )
        headline = "Action needed on the platform"
        body = (
            f"{date_label}. {n} of {len(tenants)} active workspaces had billing "
            f"webhook issues in the {window_label}."
        )
    elif checkout.get("mock_mode"):
        subject = "[IE Orbit] Daily digest · checkout is in mock mode"
        headline = "Quiet day — payments are still mocked"
        body = (
            f"{date_label}. {len(tenants)} active workspaces and no webhook "
            f"failures in the {window_label}, but live checkout credentials "
            "are not configured."
        )
    else:
        subject = "[IE Orbit] Daily digest · all clear"
        headline = "Platform looks healthy"
        body = (
            f"{date_label}. {len(tenants)} active workspaces, no webhook "
            f"failures in the {window_label}."
        )

    workspace_hint = (
        f"{new_tenant_count} new in window" if new_tenant_count else "Active tenants"
    )
    checkout_hint = (
        f"{paid_window_count} paid checkout"
        f"{'s' if paid_window_count != 1 else ''}"
    )
    paying_count = int(revenue.get("paying_subscriptions") or 0)
    month_collected = _format_inr(int(revenue.get("collected_month_paise") or 0))
    extra_parts: list[str] = [
        email_stat_grid(
            [
                {
                    "label": "Workspaces",
                    "value": str(len(tenants)),
                    "hint": workspace_hint,
                },
                {
                    "label": "Webhook success",
                    "value": f"{success_rate:.0f}%",
                    "hint": f"{webhook_total} events · {totals['failed']} failed",
                    "color": "#067d62" if success_rate >= 95 else "#b45309",
                },
                {
                    "label": "Collected (window)",
                    "value": _format_inr(collected_window_paise),
                    "hint": checkout_hint,
                },
                {
                    "label": "Paying MRR",
                    "value": _format_inr(int(revenue.get("mrr_paise") or 0)),
                    "hint": f"{paying_count} paying · {month_collected} this month",
                },
            ]
        ),
        email_section_title("Money & subscriptions"),
        email_info_card(
            title="Revenue snapshot",
            lines=[
                f"This month collected: {month_collected}",
                f"Last 30 days: {_format_inr(int(revenue.get('collected_last_30d_paise') or 0))}",
                f"All-time net: {_format_inr(int(revenue.get('net_collected_paise') or 0))}",
                (
                    f"UPI claims waiting: {int(revenue.get('pending_claims_count') or 0)} "
                    f"({_format_inr(int(revenue.get('pending_claims_paise') or 0))})"
                ),
                (
                    f"Open checkouts: {int(revenue.get('open_checkouts_count') or 0)} "
                    f"({_format_inr(int(revenue.get('open_checkouts_paise') or 0))})"
                ),
                (
                    f"Subscriptions — paying {paying_count}, "
                    f"trial {int(revenue.get('trial_subscriptions') or 0)}, "
                    f"complimentary {int(revenue.get('complimentary_subscriptions') or 0)}, "
                    f"locked {int(revenue.get('soft_locked_subscriptions') or 0)}"
                ),
                f"Affiliate payouts pending: {pending_payouts}",
            ],
        ),
    ]

    creds_line = (
        "Checkout credentials: configured"
        if checkout["configured"]
        else "Checkout credentials: missing"
    )
    webhook_line = (
        "Webhook signing: ready"
        if checkout["webhook_configured"]
        else "Webhook signing: not configured"
    )
    gateway_lines = [
        f"Provider: {checkout.get('provider') or 'none'}",
        creds_line,
        webhook_line,
    ]
    if checkout.get("mock_mode"):
        gateway_lines.append("Payments are in mock mode — live charges will not collect.")
    extra_parts.append(email_info_card(title="Payment gateway", lines=gateway_lines))

    extra_parts.append(email_section_title("Needs attention"))
    if attention_rows:
        attention_html = []
        for row in attention_rows[:12]:
            name = escape_email(row["tenant_name"])
            slug = escape_email(row["tenant_slug"])
            reason = escape_email(_attention_reason(row))
            attention_html.append(
                "<tr>"
                '<td style="padding:10px 0;border-bottom:1px solid #d5d9d9;'
                'vertical-align:top;">'
                f'<div style="font-size:14px;font-weight:700;color:#0f1111;">{name}</div>'
                f'<div style="font-size:12px;color:#565959;margin-top:2px;">{slug}</div>'
                "</td>"
                '<td style="padding:10px 0 10px 12px;border-bottom:1px solid #d5d9d9;'
                'vertical-align:top;text-align:right;font-size:13px;color:#b45309;'
                f'font-weight:600;">{reason}</td>'
                "</tr>"
            )
        extra_parts.append(
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
            'style="border-collapse:collapse;">'
            + "".join(attention_html)
            + "</table>"
        )
        if len(attention_rows) > 12:
            extra_parts.append(
                f'<p style="margin:10px 0 0;font-size:13px;color:#565959;">'
                f"+{len(attention_rows) - 12} more workspaces with webhook issues.</p>"
            )
    else:
        extra_parts.append(
            email_info_card(
                html=(
                    '<div style="font-size:14px;line-height:1.55;color:#067d62;font-weight:700;">'
                    "No dead-letter, failed, or stuck webhook events in this window.</div>"
                )
            )
        )

    extra_parts.append(email_section_title("Workspace & support"))
    ticket_lines = [
        f"Open / pending tickets: {open_ticket_count}",
        f"New tickets in window: {new_ticket_count}",
    ]
    if recent_tickets:
        for ticket in recent_tickets:
            tenant_name = ticket.tenant.display_name if ticket.tenant_id else "Workspace"
            ticket_lines.append(f"{ticket.status}: {ticket.subject} · {tenant_name}")
    extra_parts.append(email_info_card(title="Support inbox", lines=ticket_lines))

    if new_tenants:
        extra_parts.append(
            email_info_card(
                title=f"New workspaces ({new_tenant_count})",
                lines=[f"{row['display_name']} [{row['slug']}]" for row in new_tenants],
            )
        )

    extra_html = "".join(extra_parts)
    help_html = email_help_links(
        [
            ("Console", _frontend_url("/admin")),
            ("Revenue", _frontend_url("/admin/revenue")),
            ("Monitoring", _frontend_url("/admin/monitoring")),
            ("Tickets", _frontend_url("/admin/tickets")),
        ]
    )

    digest_text_lines = [
        body,
        f"Workspaces={len(tenants)} attention={len(attention_rows)} webhooks={webhook_total} "
        f"success={success_rate}% collected_window={_format_inr(collected_window_paise)} "
        f"mrr={_format_inr(int(revenue.get('mrr_paise') or 0))}.",
    ]
    for row in attention_rows[:8]:
        digest_text_lines.append(f"{row['tenant_name']}: {_attention_reason(row)}")

    return {
        "window_hours": window_hours,
        "tenant_count": len(tenants),
        "attention_count": len(attention_rows),
        "subject": subject,
        "headline": headline,
        "body": body,
        "extra_html": extra_html,
        "help_html": help_html,
        "cta_label": "Open platform console",
        "cta_url": _frontend_url("/admin"),
        "accent_color": accent,
        "footer_note": "You’re receiving this because you are a platform operator for IE Orbit.",
        "digest_text": " ".join(digest_text_lines),
        "rows": tenant_summaries,
    }
