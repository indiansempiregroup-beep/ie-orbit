from __future__ import annotations

import json
import logging
import uuid
from datetime import timedelta
from typing import Any

from django.utils import timezone

from apps.audit.services.events import publish_domain_event
from apps.billing.constants import WEBHOOK_RETRY_DELAYS_SECONDS
from apps.billing.models import BillingWebhookEvent, WebhookEventStatus
from apps.billing.services.alerts import BillingAlertService
from apps.billing.services.cashfree_client import CashfreeClient
from apps.billing.services.checkout import CheckoutService
from apps.billing.services.razorpay_client import RazorpayClient
from apps.businesses.models import BusinessProductSubscription
from apps.businesses.services.product_billing import ProductBillingHooks, ProductBillingService

logger = logging.getLogger("ie_orbit.billing.webhooks")


class RazorpayProductBillingHooks(ProductBillingHooks):
    def on_subscription_started(self, *, subscription: BusinessProductSubscription) -> None:
        super().on_subscription_started(subscription=subscription)
        publish_domain_event(
            event_type="billing.subscription.started",
            tenant_id=str(subscription.tenant_id),
            aggregate_type="business_product_subscription",
            aggregate_id=str(subscription.id),
            payload={
                "business_id": str(subscription.business_id),
                "product_code": subscription.product_code,
                "plan_code": subscription.plan.code if subscription.plan else None,
            },
        )

    def on_plan_changed(
        self,
        *,
        subscription: BusinessProductSubscription,
        previous_plan_code: str | None,
    ) -> None:
        super().on_plan_changed(
            subscription=subscription,
            previous_plan_code=previous_plan_code,
        )
        publish_domain_event(
            event_type="billing.subscription.plan_changed",
            tenant_id=str(subscription.tenant_id),
            aggregate_type="business_product_subscription",
            aggregate_id=str(subscription.id),
            payload={
                "business_id": str(subscription.business_id),
                "product_code": subscription.product_code,
                "plan_code": subscription.plan.code if subscription.plan else None,
                "previous_plan_code": previous_plan_code,
            },
        )


def default_product_billing_service() -> ProductBillingService:
    return ProductBillingService(hooks=RazorpayProductBillingHooks())


class WebhookService:
    def __init__(
        self,
        razorpay_client: RazorpayClient | None = None,
        cashfree_client: CashfreeClient | None = None,
        checkout_service: CheckoutService | None = None,
        billing_service: ProductBillingService | None = None,
        alert_service: BillingAlertService | None = None,
    ) -> None:
        self.razorpay = razorpay_client or RazorpayClient()
        self.cashfree = cashfree_client or CashfreeClient()
        self.checkout = checkout_service or CheckoutService(
            razorpay_client=self.razorpay,
            cashfree_client=self.cashfree,
        )
        self.billing_service = billing_service or default_product_billing_service()
        self.alert_service = alert_service or BillingAlertService()

    def process_razorpay_webhook(
        self,
        *,
        body: bytes,
        signature: str,
        external_event_id: str | None = None,
    ) -> dict[str, Any]:
        if not self.razorpay.verify_webhook_signature(body, signature):
            return {"accepted": False, "reason": "invalid_signature"}

        try:
            payload = json.loads(body.decode())
        except json.JSONDecodeError:
            return {"accepted": False, "reason": "invalid_payload"}

        event_id = self._resolve_external_event_id(payload=payload, external_event_id=external_event_id)

        event_type = str(payload.get("event", "unknown"))
        tenant_id = self._extract_tenant_id(payload)

        defaults: dict[str, object] = {
            "event_type": event_type,
            "payload": payload,
            "status": WebhookEventStatus.RECEIVED,
        }
        if tenant_id:
            defaults["tenant_id"] = tenant_id
        webhook_event, created = BillingWebhookEvent.objects.get_or_create(
            external_event_id=event_id[:120],
            defaults={**defaults, "provider": "razorpay"},
        )
        if not created:
            return {"accepted": True, "duplicate": True, "event_id": webhook_event.external_event_id}

        try:
            self._handle_event(payload)
            webhook_event.status = WebhookEventStatus.PROCESSED
            webhook_event.processed_at = timezone.now()
            webhook_event.next_retry_at = None
            webhook_event.error_message = ""
            webhook_event.save(
                update_fields=["status", "processed_at", "next_retry_at", "error_message", "updated_at"]
            )
            return {"accepted": True, "event_id": webhook_event.external_event_id}
        except Exception as exc:
            webhook_event.status = WebhookEventStatus.FAILED
            webhook_event.error_message = str(exc)
            webhook_event.processed_at = timezone.now()
            webhook_event.save(
                update_fields=["status", "error_message", "processed_at", "updated_at"]
            )
            self._emit_failure_alert(webhook_event=webhook_event)
            self._schedule_retry(webhook_event=webhook_event)
            logger.exception("billing.webhook_processing_failed", extra={"event_type": event_type})
            raise

    def process_cashfree_webhook(
        self,
        *,
        body: bytes,
        timestamp: str,
        signature: str,
        external_event_id: str | None = None,
    ) -> dict[str, Any]:
        if not self.cashfree.verify_webhook_signature(
            body=body,
            timestamp=timestamp,
            signature=signature,
        ):
            return {"accepted": False, "reason": "invalid_signature"}

        try:
            payload = json.loads(body.decode())
        except json.JSONDecodeError:
            return {"accepted": False, "reason": "invalid_payload"}

        event_type = str(payload.get("type") or payload.get("event") or "unknown")
        event_id = self._resolve_cashfree_event_id(
            payload=payload,
            external_event_id=external_event_id,
        )
        tenant_id = self._extract_cashfree_tenant_id(payload)
        defaults: dict[str, object] = {
            "event_type": event_type,
            "payload": payload,
            "status": WebhookEventStatus.RECEIVED,
            "provider": "cashfree",
        }
        if tenant_id:
            defaults["tenant_id"] = tenant_id
        webhook_event, created = BillingWebhookEvent.objects.get_or_create(
            external_event_id=event_id[:120],
            defaults=defaults,
        )
        if not created:
            return {"accepted": True, "duplicate": True, "event_id": webhook_event.external_event_id}

        try:
            self._handle_cashfree_event(payload)
            webhook_event.status = WebhookEventStatus.PROCESSED
            webhook_event.processed_at = timezone.now()
            webhook_event.next_retry_at = None
            webhook_event.error_message = ""
            webhook_event.save(
                update_fields=["status", "processed_at", "next_retry_at", "error_message", "updated_at"]
            )
            return {"accepted": True, "event_id": webhook_event.external_event_id}
        except Exception as exc:
            webhook_event.status = WebhookEventStatus.FAILED
            webhook_event.error_message = str(exc)
            webhook_event.processed_at = timezone.now()
            webhook_event.save(
                update_fields=["status", "error_message", "processed_at", "updated_at"]
            )
            self._emit_failure_alert(webhook_event=webhook_event)
            self._schedule_retry(webhook_event=webhook_event)
            logger.exception("billing.cashfree_webhook_processing_failed", extra={"event_type": event_type})
            raise

    def reprocess_webhook_event(self, *, webhook_event: BillingWebhookEvent) -> dict[str, Any]:
        payload = webhook_event.payload or {}
        try:
            if str(webhook_event.provider or "") == "cashfree":
                self._handle_cashfree_event(payload)
            else:
                self._handle_event(payload)
            webhook_event.status = WebhookEventStatus.PROCESSED
            webhook_event.processed_at = timezone.now()
            webhook_event.next_retry_at = None
            webhook_event.error_message = ""
            webhook_event.save(
                update_fields=["status", "processed_at", "next_retry_at", "error_message", "updated_at"]
            )
            return {
                "reprocessed": True,
                "event_id": webhook_event.external_event_id,
                "status": webhook_event.status,
            }
        except Exception as exc:
            webhook_event.status = WebhookEventStatus.FAILED
            webhook_event.error_message = str(exc)
            webhook_event.processed_at = timezone.now()
            webhook_event.save(
                update_fields=["status", "error_message", "processed_at", "updated_at"]
            )
            self._emit_failure_alert(webhook_event=webhook_event)
            self._schedule_retry(webhook_event=webhook_event)
            return {
                "reprocessed": False,
                "event_id": webhook_event.external_event_id,
                "status": webhook_event.status,
                "error": str(exc),
            }

    def reprocess_webhook_events_bulk(
        self,
        *,
        queryset,
        limit: int = 50,
    ) -> dict[str, Any]:
        selected = list(queryset.order_by("-created_at")[:limit])
        processed = 0
        failed = 0
        dead_letter = 0
        event_ids: list[str] = []
        for webhook_event in selected:
            result = self.reprocess_webhook_event(webhook_event=webhook_event)
            event_ids.append(result["event_id"])
            if result["reprocessed"]:
                processed += 1
            else:
                failed += 1
                if result.get("status") == WebhookEventStatus.DEAD_LETTER:
                    dead_letter += 1
        return {
            "selected": len(selected),
            "processed": processed,
            "failed": failed,
            "dead_letter": dead_letter,
            "event_ids": event_ids,
        }

    def _resolve_external_event_id(
        self,
        *,
        payload: dict[str, Any],
        external_event_id: str | None,
    ) -> str:
        if external_event_id:
            return external_event_id
        return str(
            payload.get("payload", {}).get("payment", {}).get("entity", {}).get("id")
            or payload.get("created_at")
            or uuid.uuid4()
        )

    def _extract_tenant_id(self, payload: dict[str, Any]) -> str | None:
        payment_entity = (
            payload.get("payload", {}).get("payment", {}).get("entity", {}) or {}
        )
        notes = payment_entity.get("notes") or {}
        tenant_id = notes.get("tenant_id")
        if tenant_id:
            return str(tenant_id)

        order_entity = payload.get("payload", {}).get("order", {}).get("entity", {}) or {}
        order_notes = order_entity.get("notes") or {}
        return str(order_notes["tenant_id"]) if order_notes.get("tenant_id") else None

    def _resolve_cashfree_event_id(
        self,
        *,
        payload: dict[str, Any],
        external_event_id: str | None,
    ) -> str:
        if external_event_id:
            return external_event_id
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        payment = data.get("payment") if isinstance(data.get("payment"), dict) else {}
        return str(
            payload.get("event_time")
            or payment.get("cf_payment_id")
            or payload.get("type")
            or uuid.uuid4()
        )

    def _extract_cashfree_tenant_id(self, payload: dict[str, Any]) -> str | None:
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        order = data.get("order") if isinstance(data.get("order"), dict) else {}
        notes = order.get("order_tags") or order.get("order_note") or {}
        if isinstance(notes, str):
            try:
                notes = json.loads(notes)
            except json.JSONDecodeError:
                notes = {}
        if isinstance(notes, dict) and notes.get("tenant_id"):
            return str(notes["tenant_id"])
        return None

    def _handle_event(self, payload: dict[str, Any]) -> None:
        event_type = str(payload.get("event", ""))
        if event_type == "payment.captured":
            self._handle_payment_captured(payload)
        else:
            logger.info("billing.webhook_ignored", extra={"event_type": event_type})

    def _handle_cashfree_event(self, payload: dict[str, Any]) -> None:
        event_type = str(payload.get("type") or payload.get("event") or "")
        if event_type not in {"PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_CHARGES_WEBHOOK"}:
            logger.info("billing.cashfree_webhook_ignored", extra={"event_type": event_type})
            return
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        order = data.get("order") if isinstance(data.get("order"), dict) else {}
        payment = data.get("payment") if isinstance(data.get("payment"), dict) else {}
        payment_status = str(payment.get("payment_status") or "").upper()
        if event_type == "PAYMENT_SUCCESS_WEBHOOK" or payment_status == "SUCCESS":
            order_id = str(order.get("order_id") or "")
            payment_id = str(payment.get("cf_payment_id") or "")
            if order_id:
                self._activate_paid_session(order_id=order_id, payment_id=payment_id)

    def _emit_failure_alert(self, *, webhook_event: BillingWebhookEvent) -> None:
        self.alert_service.notify_webhook_failure(webhook_event=webhook_event)
        publish_domain_event(
            event_type="billing.webhook.failed",
            tenant_id=str(webhook_event.tenant_id) if webhook_event.tenant_id else None,
            aggregate_type="billing_webhook_event",
            aggregate_id=str(webhook_event.id),
            payload={
                "external_event_id": webhook_event.external_event_id,
                "event_type": webhook_event.event_type,
                "error_message": webhook_event.error_message,
            },
        )

    def _schedule_retry(self, *, webhook_event: BillingWebhookEvent) -> None:
        if webhook_event.retry_count >= len(WEBHOOK_RETRY_DELAYS_SECONDS):
            webhook_event.status = WebhookEventStatus.DEAD_LETTER
            webhook_event.next_retry_at = None
            webhook_event.save(update_fields=["status", "next_retry_at", "updated_at"])
            publish_domain_event(
                event_type="billing.webhook.dead_letter",
                tenant_id=str(webhook_event.tenant_id) if webhook_event.tenant_id else None,
                aggregate_type="billing_webhook_event",
                aggregate_id=str(webhook_event.id),
                payload={
                    "external_event_id": webhook_event.external_event_id,
                    "event_type": webhook_event.event_type,
                    "retry_count": webhook_event.retry_count,
                    "error_message": webhook_event.error_message,
                },
            )
            return
        delay = WEBHOOK_RETRY_DELAYS_SECONDS[webhook_event.retry_count]
        retry_count = webhook_event.retry_count + 1
        webhook_event.retry_count = retry_count
        webhook_event.next_retry_at = timezone.now() + timedelta(seconds=delay)
        webhook_event.save(update_fields=["retry_count", "next_retry_at", "updated_at"])

        from apps.billing.tasks import reprocess_webhook_event_task

        reprocess_webhook_event_task.apply_async(args=[str(webhook_event.id)], countdown=delay)

    def _handle_payment_captured(self, payload: dict[str, Any]) -> None:
        payment = payload.get("payload", {}).get("payment", {}).get("entity", {}) or {}
        order_id = payment.get("order_id")
        payment_id = payment.get("id")
        if not order_id:
            return

        session = self.checkout.mark_session_paid(order_id=str(order_id), payment_id=str(payment_id))
        if not session:
            return
        self._activate_paid_session(order_id=str(order_id), payment_id=str(payment_id), session=session)

    def _activate_paid_session(
        self,
        *,
        order_id: str,
        payment_id: str,
        session=None,
    ) -> None:
        session = session or self.checkout.mark_session_paid(
            order_id=str(order_id),
            payment_id=str(payment_id),
        )
        if not session:
            return

        from apps.businesses.services import BusinessService
        from apps.businesses.repositories import BusinessRepository

        from apps.businesses.models import BusinessProductSubscriptionStatus

        business_service = BusinessService(
            repository=BusinessRepository(),
            billing_service=self.billing_service,
        )
        subscription = business_service.subscribe_to_product(
            business=session.business,
            product_code=session.product_code,
            plan_code=session.plan_code,
            actor=None,
            set_active=True,
        )
        subscription.status = BusinessProductSubscriptionStatus.ACTIVE
        subscription.save(update_fields=["status", "updated_at"])
        self.billing_service.attach_external_billing_reference(
            subscription=subscription,
            external_reference=str(payment_id or order_id),
        )
