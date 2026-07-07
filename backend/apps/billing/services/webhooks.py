from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from django.utils import timezone

from apps.audit.services.events import publish_domain_event
from apps.billing.models import BillingWebhookEvent, WebhookEventStatus
from apps.billing.services.checkout import CheckoutService
from apps.billing.services.razorpay_client import RazorpayClient
from apps.businesses.models import BusinessProductSubscription
from apps.businesses.services.product_billing import ProductBillingHooks, ProductBillingService

logger = logging.getLogger("ie_platform.billing.webhooks")


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
        checkout_service: CheckoutService | None = None,
        billing_service: ProductBillingService | None = None,
    ) -> None:
        self.razorpay = razorpay_client or RazorpayClient()
        self.checkout = checkout_service or CheckoutService(razorpay_client=self.razorpay)
        self.billing_service = billing_service or default_product_billing_service()

    def process_razorpay_webhook(self, *, body: bytes, signature: str) -> dict[str, Any]:
        if not self.razorpay.verify_webhook_signature(body, signature):
            return {"accepted": False, "reason": "invalid_signature"}

        payload = json.loads(body.decode())
        event_id = str(
            payload.get("payload", {}).get("payment", {}).get("entity", {}).get("id")
            or payload.get("created_at")
            or uuid.uuid4()
        )

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
            defaults=defaults,
        )
        if not created:
            return {"accepted": True, "duplicate": True, "event_id": webhook_event.external_event_id}

        try:
            self._handle_event(payload)
            webhook_event.status = WebhookEventStatus.PROCESSED
            webhook_event.processed_at = timezone.now()
            webhook_event.save(update_fields=["status", "processed_at", "updated_at"])
            return {"accepted": True, "event_id": webhook_event.external_event_id}
        except Exception as exc:
            webhook_event.status = WebhookEventStatus.FAILED
            webhook_event.error_message = str(exc)
            webhook_event.processed_at = timezone.now()
            webhook_event.save(
                update_fields=["status", "error_message", "processed_at", "updated_at"]
            )
            logger.exception("billing.webhook_processing_failed", extra={"event_type": event_type})
            raise

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

    def _handle_event(self, payload: dict[str, Any]) -> None:
        event_type = str(payload.get("event", ""))
        if event_type == "payment.captured":
            self._handle_payment_captured(payload)
        else:
            logger.info("billing.webhook_ignored", extra={"event_type": event_type})

    def _handle_payment_captured(self, payload: dict[str, Any]) -> None:
        payment = payload.get("payload", {}).get("payment", {}).get("entity", {}) or {}
        order_id = payment.get("order_id")
        payment_id = payment.get("id")
        if not order_id:
            return

        session = self.checkout.mark_session_paid(order_id=str(order_id), payment_id=str(payment_id))
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
