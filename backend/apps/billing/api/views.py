from __future__ import annotations

import csv
import io
from datetime import timedelta

from django.core.cache import cache
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Count

from apps.audit.services.audit import record_audit
from apps.audit.models import AuditLogEntry, DomainEvent
from apps.billing.api.serializers import (
    BillingCheckoutSerializer,
    BillingWebhookBulkReprocessSerializer,
    BillingWebhookEventSerializer,
)
from apps.billing.constants import BULK_REPROCESS_COOLDOWN_SECONDS
from apps.billing.models import BillingWebhookEvent, WebhookEventStatus
from apps.billing.services.checkout import CheckoutService
from apps.billing.services.ops_digest import build_ops_digest
from apps.billing.services.platform_revenue import build_platform_revenue_insights
from apps.billing.services.reconciliation import BillingReconciliationService
from apps.billing.services.webhooks import WebhookService
from apps.authentication.permissions import HasPlatformPermission
from apps.businesses.api.permissions import BusinessAccessPermission
from apps.businesses.models import Business, BusinessProductSubscription
from apps.common.api.responses import success_response
from apps.tenancy.models import Tenant


def _ensure_platform_admin(user) -> None:
    is_platform_admin = bool(
        getattr(user, "is_superuser", False)
        or user.user_roles.filter(
            role__code__in={"platform_admin", "super_admin"}, role__is_active=True
        ).exists()
    )
    if not is_platform_admin:
        raise PermissionDenied("Platform admin role is required.")


class BillingStatusView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Billing"], description="Razorpay billing configuration status.")
    def get(self, request: Request) -> Response:
        return success_response(
            CheckoutService().get_status(),
            request_id=getattr(request, "request_id", None),
        )


class BillingPlanCatalogView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Billing"], description="List billable plans with effective pricing.")
    def get(self, request: Request) -> Response:
        return success_response(
            CheckoutService().list_plan_catalog(),
            request_id=getattr(request, "request_id", None),
        )


class BillingPublicPlanCatalogView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(tags=["Billing"], description="Public plan catalog for marketing pages.")
    def get(self, request: Request) -> Response:
        return success_response(
            CheckoutService().list_public_plan_catalog(product_code=request.query_params.get("product_code")),
            request_id=getattr(request, "request_id", None),
        )


class BillingCheckoutView(APIView):
    permission_classes = [IsAuthenticated, BusinessAccessPermission]

    @extend_schema(
        tags=["Billing"],
        request=BillingCheckoutSerializer,
        description="Create a Razorpay checkout order for a product plan.",
    )
    def post(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)

        serializer = BillingCheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        business_id = request.headers.get("X-Business-ID") or request.data.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "Business context is required."})

        business = Business.objects.get(id=business_id, tenant=tenant)
        checkout = CheckoutService().create_checkout_session(
            tenant=tenant,
            business=business,
            product_code=serializer.validated_data["product_code"],
            plan_code=serializer.validated_data["plan_code"],
            actor_id=str(request.user.id),
        )
        return success_response(
            checkout,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class BillingUpiCheckoutView(APIView):
    permission_classes = [IsAuthenticated, BusinessAccessPermission]

    @extend_schema(tags=["Billing"], description="Create a UPI amount-QR checkout session for a plan.")
    def post(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)
        business_id = request.headers.get("X-Business-ID") or request.data.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "Business context is required."})
        business = Business.objects.get(id=business_id, tenant=tenant)
        checkout = CheckoutService().create_upi_checkout_session(
            tenant=tenant,
            business=business,
            product_code=str(request.data.get("product_code") or ""),
            plan_code=str(request.data.get("plan_code") or ""),
            amount_paise=request.data.get("amount_paise"),
            extra_staff=int(request.data.get("extra_staff") or 0),
            extra_offices=int(request.data.get("extra_offices") or 0),
            pets_pack_enabled=bool(request.data.get("pets_pack_enabled")),
            actor_id=str(request.user.id),
        )
        return success_response(checkout, status_code=status.HTTP_201_CREATED)


class BillingUpiClaimView(APIView):
    permission_classes = [IsAuthenticated, BusinessAccessPermission]

    @extend_schema(tags=["Billing"], description="Claim UPI payment with UTR and optional screenshot URL.")
    def post(self, request: Request, session_id) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)
        business_id = request.headers.get("X-Business-ID") or request.data.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "Business context is required."})
        business = Business.objects.get(id=business_id, tenant=tenant)
        session = CheckoutService().claim_upi_session(
            session_id=str(session_id),
            business=business,
            upi_utr=str(request.data.get("upi_utr") or ""),
            payment_proof_url=str(request.data.get("payment_proof_url") or ""),
        )
        return success_response(
            {
                "session_id": str(session.id),
                "payment_status": (session.metadata or {}).get("payment_status"),
                "upi_utr": (session.metadata or {}).get("upi_utr"),
            }
        )


class BillingUpiConfirmView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "platform.billing.manage"

    @extend_schema(tags=["Billing"], description="Platform admin confirm/reject UPI subscription claim.")
    def post(self, request: Request, session_id) -> Response:
        session = CheckoutService().confirm_upi_session(
            session_id=str(session_id),
            action=str(request.data.get("action") or ""),
            note=str(request.data.get("note") or ""),
            actor_id=str(getattr(request.user, "id", "") or ""),
        )
        return success_response(
            {
                "session_id": str(session.id),
                "status": session.status,
                "payment_status": (session.metadata or {}).get("payment_status"),
            }
        )


class BillingWebhookEventListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Billing"],
        description="List webhook events for the current tenant.",
        responses={200: BillingWebhookEventSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)

        status_filter = request.query_params.get("status")
        exhausted_filter = request.query_params.get("exhausted")
        queryset = BillingWebhookEvent.objects.filter(tenant=tenant).order_by("-created_at")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if exhausted_filter and exhausted_filter.lower() in {"1", "true", "yes"}:
            queryset = queryset.filter(status=WebhookEventStatus.DEAD_LETTER)
        events = queryset[:50]
        return success_response(
            BillingWebhookEventSerializer(events, many=True).data,
            request_id=getattr(request, "request_id", None),
        )


class BillingWebhookEventReprocessView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "business:manage"

    @extend_schema(tags=["Billing"], description="Reprocess a webhook event for the current tenant.")
    def post(self, request: Request, event_id: str) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)

        webhook_event = get_object_or_404(BillingWebhookEvent, id=event_id, tenant=tenant)
        result = WebhookService().reprocess_webhook_event(webhook_event=webhook_event)
        return success_response(result, request_id=getattr(request, "request_id", None))


class BillingWebhookBulkReprocessView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "business:manage"

    @extend_schema(tags=["Billing"], request=BillingWebhookBulkReprocessSerializer)
    def post(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)

        serializer = BillingWebhookBulkReprocessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data["confirm"]:
            raise ValidationError({"confirm": "Explicit confirmation is required for bulk reprocess."})
        scope = serializer.validated_data["scope"]
        limit = serializer.validated_data["limit"]
        cache_key = f"billing:bulk-reprocess:{tenant.id}:{request.user.id}"
        cached = cache.get(cache_key)
        if cached:
            retry_after_seconds = int(cached)
            return Response(
                {
                    "error": {
                        "code": "BULK_REPROCESS_COOLDOWN",
                        "message": "Bulk reprocess is cooling down. Try again shortly.",
                        "details": {"retry_after_seconds": retry_after_seconds},
                    }
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        target_status = (
            WebhookEventStatus.FAILED if scope == "failed" else WebhookEventStatus.DEAD_LETTER
        )
        queryset = BillingWebhookEvent.objects.filter(tenant=tenant, status=target_status)
        result = WebhookService().reprocess_webhook_events_bulk(queryset=queryset, limit=limit)
        cache.set(cache_key, BULK_REPROCESS_COOLDOWN_SECONDS, timeout=BULK_REPROCESS_COOLDOWN_SECONDS)
        record_audit(
            tenant=tenant,
            action="billing.webhook.bulk_reprocess",
            resource_type="billing_webhook_event",
            actor_id=str(request.user.id),
            metadata={"scope": scope, "limit": limit, **result},
        )
        return success_response(result, request_id=getattr(request, "request_id", None))


class BillingWebhookSummaryView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "business:manage"

    @extend_schema(tags=["Billing"], description="Webhook operational summary for current tenant.")
    def get(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)

        window_hours = int(request.query_params.get("window_hours", "24"))
        window_hours = max(1, min(window_hours, 24 * 30))
        since = timezone.now() - timedelta(hours=window_hours)
        queryset = BillingWebhookEvent.objects.filter(tenant=tenant, created_at__gte=since)

        total = queryset.count()
        processed = queryset.filter(status=WebhookEventStatus.PROCESSED).count()
        failed = queryset.filter(status=WebhookEventStatus.FAILED).count()
        dead_letter = queryset.filter(status=WebhookEventStatus.DEAD_LETTER).count()
        received = queryset.filter(status=WebhookEventStatus.RECEIVED).count()
        ignored = queryset.filter(status=WebhookEventStatus.IGNORED).count()
        stuck_retries = queryset.filter(
            status=WebhookEventStatus.FAILED,
            next_retry_at__isnull=False,
            next_retry_at__lt=timezone.now(),
        ).count()

        failure_rate = round((failed + dead_letter) / total, 4) if total else 0.0
        success_rate = round(processed / total, 4) if total else 0.0

        return success_response(
            {
                "window_hours": window_hours,
                "total": total,
                "processed": processed,
                "failed": failed,
                "dead_letter": dead_letter,
                "received": received,
                "ignored": ignored,
                "stuck_retries": stuck_retries,
                "failure_rate": failure_rate,
                "success_rate": success_rate,
            },
            request_id=getattr(request, "request_id", None),
        )


class BillingReconciliationRunView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "business:manage"

    @extend_schema(tags=["Billing"], description="Run tenant billing reconciliation.")
    def post(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)
        lookback_hours = int(
            request.data.get(
                "lookback_hours",
                settings.BILLING_RECONCILIATION_LOOKBACK_HOURS,
            )
        )
        result = BillingReconciliationService().reconcile(
            tenant=tenant,
            lookback_hours=lookback_hours,
        )
        record_audit(
            tenant=tenant,
            action="billing.reconciliation.run",
            resource_type="billing_checkout_session",
            actor_id=str(request.user.id),
            metadata=result.as_dict(),
        )
        return success_response(result.as_dict(), request_id=getattr(request, "request_id", None))


class BillingGoLiveCheckView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "business:manage"

    @extend_schema(tags=["Billing"], description="Evaluate billing go-live readiness for current tenant.")
    def get(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)

        checkout_status = CheckoutService().get_status()
        since = timezone.now() - timedelta(hours=24)
        queryset = BillingWebhookEvent.objects.filter(tenant=tenant, created_at__gte=since)
        dead_letter = queryset.filter(status=WebhookEventStatus.DEAD_LETTER).count()
        stuck_retries = queryset.filter(
            status=WebhookEventStatus.FAILED,
            next_retry_at__isnull=False,
            next_retry_at__lt=timezone.now(),
        ).count()

        checks = [
            {
                "id": "razorpay_configured",
                "label": "Razorpay API credentials configured",
                "ok": bool(checkout_status["configured"]),
                "severity": "blocker",
            },
            {
                "id": "webhook_secret_configured",
                "label": "Webhook secret configured",
                "ok": bool(checkout_status["webhook_configured"]),
                "severity": "blocker",
            },
            {
                "id": "live_checkout_enforced",
                "label": "Live checkout enforcement enabled",
                "ok": bool(settings.BILLING_ENFORCE_LIVE_CHECKOUT),
                "severity": "warning",
            },
            {
                "id": "dead_letter_backlog",
                "label": "No dead-letter backlog in last 24h",
                "ok": dead_letter == 0,
                "severity": "blocker",
                "value": dead_letter,
            },
            {
                "id": "stuck_retries",
                "label": "No stuck retries in last 24h",
                "ok": stuck_retries == 0,
                "severity": "warning",
                "value": stuck_retries,
            },
            {
                "id": "alert_recipients",
                "label": "Alert recipients configured",
                "ok": bool(settings.BILLING_WEBHOOK_ALERT_RECIPIENTS.strip()),
                "severity": "warning",
            },
        ]
        blockers = [check["id"] for check in checks if not check["ok"] and check["severity"] == "blocker"]
        warnings = [check["id"] for check in checks if not check["ok"] and check["severity"] == "warning"]
        return success_response(
            {
                "ready": len(blockers) == 0,
                "blockers": blockers,
                "warnings": warnings,
                "checks": checks,
            },
            request_id=getattr(request, "request_id", None),
        )


class BillingReleaseGateView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "business:manage"

    @extend_schema(
        tags=["Billing"],
        description="Run billing release gate preflight checks with remediation guidance.",
    )
    def get(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)

        checkout_status = CheckoutService().get_status()
        since = timezone.now() - timedelta(hours=24)
        queryset = BillingWebhookEvent.objects.filter(tenant=tenant, created_at__gte=since)
        total = queryset.count()
        dead_letter = queryset.filter(status=WebhookEventStatus.DEAD_LETTER).count()
        stuck_retries = queryset.filter(
            status=WebhookEventStatus.FAILED,
            next_retry_at__isnull=False,
            next_retry_at__lt=timezone.now(),
        ).count()
        failed = queryset.filter(status=WebhookEventStatus.FAILED).count()
        failure_rate = round((failed + dead_letter) / total, 4) if total else 0.0

        checks = [
            {
                "id": "razorpay_configured",
                "label": "Razorpay API credentials configured",
                "ok": bool(checkout_status["configured"]),
                "severity": "blocker",
                "remediation": "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend environment.",
            },
            {
                "id": "webhook_secret_configured",
                "label": "Webhook secret configured",
                "ok": bool(checkout_status["webhook_configured"]),
                "severity": "blocker",
                "remediation": "Set RAZORPAY_WEBHOOK_SECRET and rotate it in Razorpay dashboard if needed.",
            },
            {
                "id": "live_checkout_enforced",
                "label": "Live checkout enforcement enabled",
                "ok": bool(settings.BILLING_ENFORCE_LIVE_CHECKOUT),
                "severity": "warning",
                "remediation": "Enable BILLING_ENFORCE_LIVE_CHECKOUT=true before production cutover.",
            },
            {
                "id": "dead_letter_backlog",
                "label": "No dead-letter backlog in last 24h",
                "ok": dead_letter == 0,
                "severity": "blocker",
                "value": dead_letter,
                "remediation": "Run dead-letter bulk reprocess and verify root-cause from error_message logs.",
            },
            {
                "id": "stuck_retries",
                "label": "No stuck retries in last 24h",
                "ok": stuck_retries == 0,
                "severity": "warning",
                "value": stuck_retries,
                "remediation": "Check Celery worker/beat health and retry queue latency; replay stale failed events.",
            },
            {
                "id": "alert_recipients",
                "label": "Alert recipients configured",
                "ok": bool(settings.BILLING_WEBHOOK_ALERT_RECIPIENTS.strip()),
                "severity": "warning",
                "remediation": "Set BILLING_WEBHOOK_ALERT_RECIPIENTS to an on-call email group.",
            },
            {
                "id": "failure_rate_threshold",
                "label": "Webhook failure rate below 5% (24h)",
                "ok": failure_rate < 0.05,
                "severity": "warning",
                "value": failure_rate,
                "remediation": "Investigate spikes via webhook summary/events and stabilize before launch.",
            },
        ]
        blockers = [check["id"] for check in checks if not check["ok"] and check["severity"] == "blocker"]
        warnings = [check["id"] for check in checks if not check["ok"] and check["severity"] == "warning"]
        failing_checks = [check for check in checks if not check["ok"]]
        return success_response(
            {
                "passed": len(blockers) == 0,
                "ready": len(blockers) == 0,
                "blockers": blockers,
                "warnings": warnings,
                "checks": checks,
                "failing_checks": failing_checks,
                "summary": {
                    "window_hours": 24,
                    "total_events": total,
                    "failure_rate": failure_rate,
                    "dead_letter": dead_letter,
                    "stuck_retries": stuck_retries,
                },
            },
            request_id=getattr(request, "request_id", None),
        )


class BillingObservabilityView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "business:manage"

    @extend_schema(tags=["Billing"], description="Operational observability signals for billing and onboarding.")
    def get(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)

        window_hours = int(request.query_params.get("window_hours", "24"))
        window_hours = max(1, min(window_hours, 24 * 30))
        since = timezone.now() - timedelta(hours=window_hours)

        event_counts = {
            "billing_webhook_failed": DomainEvent.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                event_type="billing.webhook.failed",
            ).count(),
            "billing_webhook_dead_letter": DomainEvent.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                event_type="billing.webhook.dead_letter",
            ).count(),
            "onboarding_workspace_provisioned": DomainEvent.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                event_type="onboarding.workspace.provisioned",
            ).count(),
        }
        audit_counts = {
            "bulk_reprocess_actions": AuditLogEntry.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                action="billing.webhook.bulk_reprocess",
            ).count(),
            "reconciliation_runs": AuditLogEntry.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                action="billing.reconciliation.run",
            ).count(),
            "workspace_provisioned_audits": AuditLogEntry.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                action="onboarding.workspace.provisioned",
            ).count(),
        }
        return success_response(
            {
                "window_hours": window_hours,
                "since": since.isoformat(),
                "events": event_counts,
                "audits": audit_counts,
            },
            request_id=getattr(request, "request_id", None),
        )


class BillingOpsSnapshotView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "business:manage"

    @extend_schema(tags=["Billing"], description="Export operational snapshot for billing launch readiness.")
    def get(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)

        window_hours = int(request.query_params.get("window_hours", "24"))
        window_hours = max(1, min(window_hours, 24 * 30))
        generated_at = timezone.now()
        since = generated_at - timedelta(hours=window_hours)
        previous_since = since - timedelta(hours=window_hours)
        output_format = str(request.query_params.get("format", "json")).strip().lower()

        webhook_queryset = BillingWebhookEvent.objects.filter(tenant=tenant, created_at__gte=since)
        total = webhook_queryset.count()
        processed = webhook_queryset.filter(status=WebhookEventStatus.PROCESSED).count()
        failed = webhook_queryset.filter(status=WebhookEventStatus.FAILED).count()
        dead_letter = webhook_queryset.filter(status=WebhookEventStatus.DEAD_LETTER).count()
        stuck_retries = webhook_queryset.filter(
            status=WebhookEventStatus.FAILED,
            next_retry_at__isnull=False,
            next_retry_at__lt=timezone.now(),
        ).count()
        failure_rate = round((failed + dead_letter) / total, 4) if total else 0.0
        previous_webhook_queryset = BillingWebhookEvent.objects.filter(
            tenant=tenant,
            created_at__gte=previous_since,
            created_at__lt=since,
        )
        previous_total = previous_webhook_queryset.count()
        previous_failed = previous_webhook_queryset.filter(status=WebhookEventStatus.FAILED).count()
        previous_dead_letter = previous_webhook_queryset.filter(status=WebhookEventStatus.DEAD_LETTER).count()
        previous_stuck_retries = previous_webhook_queryset.filter(
            status=WebhookEventStatus.FAILED,
            next_retry_at__isnull=False,
            next_retry_at__lt=generated_at,
        ).count()
        previous_failure_rate = (
            round((previous_failed + previous_dead_letter) / previous_total, 4) if previous_total else 0.0
        )

        checkout_status = CheckoutService().get_status()
        blockers = []
        if not checkout_status["configured"]:
            blockers.append("razorpay_configured")
        if not checkout_status["webhook_configured"]:
            blockers.append("webhook_secret_configured")
        if dead_letter > 0:
            blockers.append("dead_letter_backlog")

        events = {
            "billing_webhook_failed": DomainEvent.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                event_type="billing.webhook.failed",
            ).count(),
            "billing_webhook_dead_letter": DomainEvent.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                event_type="billing.webhook.dead_letter",
            ).count(),
            "onboarding_workspace_provisioned": DomainEvent.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                event_type="onboarding.workspace.provisioned",
            ).count(),
        }
        audits = {
            "bulk_reprocess_actions": AuditLogEntry.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                action="billing.webhook.bulk_reprocess",
            ).count(),
            "reconciliation_runs": AuditLogEntry.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                action="billing.reconciliation.run",
            ).count(),
            "workspace_provisioned_audits": AuditLogEntry.objects.filter(
                tenant=tenant,
                created_at__gte=since,
                action="onboarding.workspace.provisioned",
            ).count(),
        }
        recommendations: list[dict[str, str]] = []
        if "razorpay_configured" in blockers:
            recommendations.append(
                {
                    "severity": "blocker",
                    "action": "Configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before launch.",
                }
            )
        if "webhook_secret_configured" in blockers:
            recommendations.append(
                {
                    "severity": "blocker",
                    "action": "Set RAZORPAY_WEBHOOK_SECRET and validate signature checks.",
                }
            )
        if dead_letter > 0:
            recommendations.append(
                {
                    "severity": "blocker",
                    "action": "Drain dead-letter backlog via reprocess and resolve failing payload causes.",
                }
            )
        if stuck_retries > 0:
            recommendations.append(
                {
                    "severity": "warning",
                    "action": "Verify Celery workers/beat health and clear overdue retries.",
                }
            )
        if failure_rate >= 0.05:
            recommendations.append(
                {
                    "severity": "warning",
                    "action": "Investigate webhook failure spike before enabling production traffic.",
                }
            )
        health_score = 100
        health_score -= min(60, len(blockers) * 20)
        health_score -= min(25, dead_letter * 5)
        health_score -= min(15, stuck_retries * 3)
        health_score = max(0, health_score)
        trend = {
            "comparison_window_hours": window_hours,
            "previous_since": previous_since.isoformat(),
            "previous_until": since.isoformat(),
            "failure_rate_delta": round(failure_rate - previous_failure_rate, 4),
            "dead_letter_delta": dead_letter - previous_dead_letter,
            "stuck_retries_delta": stuck_retries - previous_stuck_retries,
            "direction": "improving" if failure_rate <= previous_failure_rate else "degrading",
        }
        snapshot = {
            "tenant_id": str(tenant.id),
            "window_hours": window_hours,
            "since": since.isoformat(),
            "generated_at": generated_at.isoformat(),
            "ready": len(blockers) == 0,
            "health_score": health_score,
            "blockers": blockers,
            "recommendations": recommendations,
            "trend": trend,
            "webhooks": {
                "total": total,
                "processed": processed,
                "failed": failed,
                "dead_letter": dead_letter,
                "stuck_retries": stuck_retries,
                "failure_rate": failure_rate,
            },
            "events": events,
            "audits": audits,
        }
        if output_format == "csv":
            rows = [
                ("tenant_id", snapshot["tenant_id"]),
                ("window_hours", str(window_hours)),
                ("generated_at", snapshot["generated_at"]),
                ("ready", str(snapshot["ready"]).lower()),
                ("health_score", str(health_score)),
                ("blockers", ",".join(blockers)),
                ("trend.direction", trend["direction"]),
                ("trend.failure_rate_delta", str(trend["failure_rate_delta"])),
                ("trend.dead_letter_delta", str(trend["dead_letter_delta"])),
                ("trend.stuck_retries_delta", str(trend["stuck_retries_delta"])),
                ("webhooks.total", str(total)),
                ("webhooks.processed", str(processed)),
                ("webhooks.failed", str(failed)),
                ("webhooks.dead_letter", str(dead_letter)),
                ("webhooks.stuck_retries", str(stuck_retries)),
                ("webhooks.failure_rate", str(failure_rate)),
            ]
            rows.extend((f"events.{key}", str(value)) for key, value in events.items())
            rows.extend((f"audits.{key}", str(value)) for key, value in audits.items())
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(["metric", "value"])
            writer.writerows(rows)
            response = HttpResponse(buffer.getvalue(), content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="billing-ops-snapshot.csv"'
            return response

        return success_response(snapshot, request_id=getattr(request, "request_id", None))


class BillingOpsDigestView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "business:manage"

    @extend_schema(tags=["Billing"], description="Generate plain-language billing operations digest.")
    def get(self, request: Request) -> Response:
        tenant: Tenant | None = getattr(request, "current_tenant", None)
        if not tenant:
            return Response(status=status.HTTP_404_NOT_FOUND)

        window_hours = int(request.query_params.get("window_hours", "24"))
        digest = build_ops_digest(tenant=tenant, window_hours=window_hours)
        return success_response(digest, request_id=getattr(request, "request_id", None))


class BillingPlatformOpsSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Billing"],
        description="Platform-level operations summary across tenants (platform admins only).",
    )
    def get(self, request: Request) -> Response:
        user = request.user
        is_platform_admin = bool(
            getattr(user, "is_superuser", False)
            or user.user_roles.filter(role__code__in={"platform_admin", "super_admin"}, role__is_active=True).exists()
        )
        if not is_platform_admin:
            raise PermissionDenied("Platform admin role is required.")

        window_hours = int(request.query_params.get("window_hours", "24"))
        window_hours = max(1, min(window_hours, 24 * 30))
        limit = int(request.query_params.get("limit", "50"))
        limit = max(1, min(limit, 200))
        tenants = Tenant.objects.filter(status="active").order_by("display_name")[:limit]
        rows = [build_ops_digest(tenant=tenant, window_hours=window_hours) for tenant in tenants]
        ready_count = sum(1 for row in rows if row["ready"])
        return success_response(
            {
                "window_hours": window_hours,
                "tenant_count": len(rows),
                "ready_count": ready_count,
                "not_ready_count": len(rows) - ready_count,
                "rows": rows,
            },
            request_id=getattr(request, "request_id", None),
        )


class BillingPlatformSubscriptionsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Billing"],
        description="Platform-level subscription summary across tenants (platform admins only).",
    )
    def get(self, request: Request) -> Response:
        user = request.user
        is_platform_admin = bool(
            getattr(user, "is_superuser", False)
            or user.user_roles.filter(role__code__in={"platform_admin", "super_admin"}, role__is_active=True).exists()
        )
        if not is_platform_admin:
            raise PermissionDenied("Platform admin role is required.")

        by_status = list(
            BusinessProductSubscription.objects.values("status")
            .annotate(count=Count("id"))
            .order_by("status")
        )
        by_product = list(
            BusinessProductSubscription.objects.values("product_code")
            .annotate(count=Count("id"))
            .order_by("product_code")
        )
        return success_response(
            {
                "total_subscriptions": BusinessProductSubscription.objects.count(),
                "by_status": by_status,
                "by_product": by_product,
            },
            request_id=getattr(request, "request_id", None),
        )


class BillingPlatformRevenueView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Billing"],
        description="Platform-level collected revenue and MRR insights (platform admins only).",
    )
    def get(self, request: Request) -> Response:
        user = request.user
        is_platform_admin = bool(
            getattr(user, "is_superuser", False)
            or user.user_roles.filter(
                role__code__in={"platform_admin", "super_admin"}, role__is_active=True
            ).exists()
        )
        if not is_platform_admin:
            raise PermissionDenied("Platform admin role is required.")
        return success_response(
            build_platform_revenue_insights(),
            request_id=getattr(request, "request_id", None),
        )


class BillingPlatformMonitoringView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Billing"],
        description="Platform-level monitoring summary across tenants (platform admins only).",
    )
    def get(self, request: Request) -> Response:
        user = request.user
        is_platform_admin = bool(
            getattr(user, "is_superuser", False)
            or user.user_roles.filter(role__code__in={"platform_admin", "super_admin"}, role__is_active=True).exists()
        )
        if not is_platform_admin:
            raise PermissionDenied("Platform admin role is required.")

        window_hours = int(request.query_params.get("window_hours", "24"))
        window_hours = max(1, min(window_hours, 24 * 30))
        since = timezone.now() - timedelta(hours=window_hours)
        failed_events = DomainEvent.objects.filter(
            created_at__gte=since,
            event_type="billing.webhook.failed",
        ).count()
        dead_letter_events = DomainEvent.objects.filter(
            created_at__gte=since,
            event_type="billing.webhook.dead_letter",
        ).count()
        reprocess_actions = AuditLogEntry.objects.filter(
            created_at__gte=since,
            action="billing.webhook.bulk_reprocess",
        ).count()
        reconciliation_runs = AuditLogEntry.objects.filter(
            created_at__gte=since,
            action="billing.reconciliation.run",
        ).count()
        tenants_impacted = (
            DomainEvent.objects.filter(
                created_at__gte=since,
                event_type__in=["billing.webhook.failed", "billing.webhook.dead_letter"],
            )
            .values("tenant_id")
            .distinct()
            .count()
        )
        return success_response(
            {
                "window_hours": window_hours,
                "failed_events": failed_events,
                "dead_letter_events": dead_letter_events,
                "reprocess_actions": reprocess_actions,
                "reconciliation_runs": reconciliation_runs,
                "tenants_impacted": tenants_impacted,
            },
            request_id=getattr(request, "request_id", None),
        )


class BillingPlatformWebhookEventsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Billing"],
        description="Platform-wide webhook events for ops investigation (platform admins only).",
    )
    def get(self, request: Request) -> Response:
        _ensure_platform_admin(request.user)
        window_hours = max(1, min(int(request.query_params.get("window_hours") or 24), 24 * 30))
        since = timezone.now() - timedelta(hours=window_hours)
        status_filter = (request.query_params.get("status") or "").strip().lower()
        queryset = BillingWebhookEvent.objects.select_related("tenant").filter(created_at__gte=since)
        if status_filter in {choice.value for choice in WebhookEventStatus}:
            queryset = queryset.filter(status=status_filter)
        else:
            queryset = queryset.filter(
                status__in=[WebhookEventStatus.FAILED, WebhookEventStatus.DEAD_LETTER]
            )
        limit = max(1, min(int(request.query_params.get("limit") or 100), 200))
        events = queryset.order_by("-created_at")[:limit]
        return success_response(
            {
                "window_hours": window_hours,
                "count": len(events),
                "events": BillingWebhookEventSerializer(events, many=True).data,
            },
            request_id=getattr(request, "request_id", None),
        )


class BillingPlatformWebhookReprocessView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Billing"], description="Reprocess a webhook event across tenants.")
    def post(self, request: Request, event_id: str) -> Response:
        _ensure_platform_admin(request.user)
        webhook_event = get_object_or_404(BillingWebhookEvent, id=event_id)
        result = WebhookService().reprocess_webhook_event(webhook_event=webhook_event)
        return success_response(result, request_id=getattr(request, "request_id", None))


class BillingPlatformWebhookBulkReprocessView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Billing"], request=BillingWebhookBulkReprocessSerializer)
    def post(self, request: Request) -> Response:
        _ensure_platform_admin(request.user)
        serializer = BillingWebhookBulkReprocessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data["confirm"]:
            raise ValidationError({"confirm": "Explicit confirmation is required for bulk reprocess."})
        scope = serializer.validated_data["scope"]
        limit = serializer.validated_data["limit"]
        cache_key = f"billing:bulk-reprocess:platform:{request.user.id}"
        cached = cache.get(cache_key)
        if cached:
            return Response(
                {
                    "error": {
                        "code": "BULK_REPROCESS_COOLDOWN",
                        "message": "Bulk reprocess is cooling down. Try again shortly.",
                        "details": {"retry_after_seconds": int(cached)},
                    }
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        target_status = (
            WebhookEventStatus.FAILED if scope == "failed" else WebhookEventStatus.DEAD_LETTER
        )
        queryset = BillingWebhookEvent.objects.filter(status=target_status).order_by("created_at")
        result = WebhookService().reprocess_webhook_events_bulk(queryset=queryset, limit=limit)
        cache.set(cache_key, BULK_REPROCESS_COOLDOWN_SECONDS, timeout=BULK_REPROCESS_COOLDOWN_SECONDS)
        record_audit(
            tenant=None,
            action="billing.webhook.bulk_reprocess",
            resource_type="billing_webhook_event",
            resource_id="platform",
            actor_id=str(request.user.id),
            metadata={"scope": scope, "limit": limit, **result},
        )
        return success_response(result, request_id=getattr(request, "request_id", None))


class BillingPlatformAuditFeedView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Billing"],
        description="Platform-level billing audit feed (platform admins only).",
    )
    def get(self, request: Request) -> Response:
        user = request.user
        is_platform_admin = bool(
            getattr(user, "is_superuser", False)
            or user.user_roles.filter(role__code__in={"platform_admin", "super_admin"}, role__is_active=True).exists()
        )
        if not is_platform_admin:
            raise PermissionDenied("Platform admin role is required.")

        limit = int(request.query_params.get("limit", "100"))
        limit = max(1, min(limit, 500))
        rows = list(
            AuditLogEntry.objects.filter(action__startswith="billing.")
            .select_related("tenant")
            .order_by("-created_at")[:limit]
            .values(
                "id",
                "tenant_id",
                "action",
                "resource_type",
                "resource_id",
                "actor_id",
                "metadata",
                "created_at",
            )
        )
        return success_response(
            {"count": len(rows), "rows": rows},
            request_id=getattr(request, "request_id", None),
        )


@method_decorator(csrf_exempt, name="dispatch")
class RazorpayWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(tags=["Billing"], description="Razorpay payment webhook endpoint.")
    def post(self, request: Request) -> Response:
        signature = request.headers.get("X-Razorpay-Signature", "")
        external_event_id = request.headers.get("X-Razorpay-Event-Id")
        result = WebhookService().process_razorpay_webhook(
            body=request.body,
            signature=signature,
            external_event_id=external_event_id,
        )
        if not result.get("accepted"):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return success_response(result, request_id=getattr(request, "request_id", None))
