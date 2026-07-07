from __future__ import annotations

from datetime import timedelta

from django.core.cache import cache
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services.audit import record_audit
from apps.billing.api.serializers import (
    BillingCheckoutSerializer,
    BillingWebhookBulkReprocessSerializer,
    BillingWebhookEventSerializer,
)
from apps.billing.constants import BULK_REPROCESS_COOLDOWN_SECONDS
from apps.billing.models import BillingWebhookEvent, WebhookEventStatus
from apps.billing.services.checkout import CheckoutService
from apps.billing.services.reconciliation import BillingReconciliationService
from apps.billing.services.webhooks import WebhookService
from apps.authentication.permissions import HasPlatformPermission
from apps.businesses.api.permissions import BusinessAccessPermission
from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.tenancy.models import Tenant


class BillingStatusView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Billing"], description="Razorpay billing configuration status.")
    def get(self, request: Request) -> Response:
        return success_response(
            CheckoutService().get_status(),
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
