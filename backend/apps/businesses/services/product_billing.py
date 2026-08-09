from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from typing import Any

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.businesses.constants import (
    DEFAULT_TRIAL_DAYS,
    VALID_PRODUCT_CODES,
    get_default_plan_code,
    get_plan_definition,
)
from apps.businesses.models import BusinessProductSubscription
from apps.tenancy.models import SubscriptionPlan

logger = logging.getLogger("ie_platform.businesses.billing")


@dataclass
class BillingEvent:
    event_type: str
    business_id: str
    tenant_id: str
    product_code: str
    plan_code: str | None = None
    external_reference: str | None = None


class ProductBillingHooks:
    """Extension points for payment providers and billing automation."""

    def on_subscription_started(self, *, subscription: BusinessProductSubscription) -> None:
        event = BillingEvent(
            event_type="subscription.started",
            business_id=str(subscription.business_id),
            tenant_id=str(subscription.tenant_id),
            product_code=subscription.product_code,
            plan_code=subscription.plan.code if subscription.plan else None,
            external_reference=subscription.external_billing_reference or None,
        )
        logger.info("billing.subscription_started", extra=asdict(event))

    def on_subscription_canceled(self, *, subscription: BusinessProductSubscription) -> None:
        event = BillingEvent(
            event_type="subscription.canceled",
            business_id=str(subscription.business_id),
            tenant_id=str(subscription.tenant_id),
            product_code=subscription.product_code,
            plan_code=subscription.plan.code if subscription.plan else None,
            external_reference=subscription.external_billing_reference or None,
        )
        logger.info("billing.subscription_canceled", extra=asdict(event))

    def on_plan_changed(
        self,
        *,
        subscription: BusinessProductSubscription,
        previous_plan_code: str | None,
    ) -> None:
        event = BillingEvent(
            event_type="subscription.plan_changed",
            business_id=str(subscription.business_id),
            tenant_id=str(subscription.tenant_id),
            product_code=subscription.product_code,
            plan_code=subscription.plan.code if subscription.plan else None,
            external_reference=subscription.external_billing_reference or None,
        )
        logger.info(
            "billing.plan_changed",
            extra={**asdict(event), "previous_plan_code": previous_plan_code},
        )


class ProductBillingService:
    def __init__(self, hooks: ProductBillingHooks | None = None) -> None:
        self.hooks = hooks or ProductBillingHooks()

    def list_product_plans(self, *, product_code: str | None = None) -> list[dict[str, Any]]:
        from apps.businesses.services.plan_catalog import list_plan_definitions

        if product_code:
            normalized = product_code.strip().lower()
            if normalized not in VALID_PRODUCT_CODES:
                raise ValidationError({"product_code": "Unknown product code."})
            return list_plan_definitions(normalized)

        return list_plan_definitions()

    def resolve_subscription_plan(
        self,
        *,
        product_code: str,
        plan_code: str | None = None,
    ) -> tuple[SubscriptionPlan, dict[str, Any] | None]:
        normalized_product = product_code.strip().lower()
        if normalized_product not in VALID_PRODUCT_CODES:
            raise ValidationError({"product_code": "Unknown product code."})

        selected_plan_code = plan_code or get_default_plan_code(normalized_product)
        plan_definition = (
            get_plan_definition(normalized_product, selected_plan_code)
            if selected_plan_code
            else None
        )

        if plan_code and plan_definition is None:
            raise ValidationError({"plan_code": "Unknown plan for this product."})

        if plan_definition is None and selected_plan_code:
            plan_definition = {
                "code": selected_plan_code,
                "name": selected_plan_code.replace("-", " ").title(),
                "billing_interval": "monthly",
                "trial_days": DEFAULT_TRIAL_DAYS,
            }

        if plan_definition is None:
            raise ValidationError({"plan_code": "No plan is configured for this product."})

        plan, _ = SubscriptionPlan.objects.get_or_create(
            code=str(plan_definition["code"]),
            defaults={
                "name": str(plan_definition["name"]),
                "description": str(plan_definition.get("description", "")),
                "is_public": True,
                "feature_flags": {"product_code": normalized_product},
            },
        )
        return plan, plan_definition

    def apply_plan_to_subscription(
        self,
        *,
        subscription: BusinessProductSubscription,
        plan: SubscriptionPlan,
        plan_definition: dict[str, Any] | None,
        now: datetime | None = None,
    ) -> None:
        current_time = now or timezone.now()
        trial_days = int(plan_definition.get("trial_days", DEFAULT_TRIAL_DAYS)) if plan_definition else DEFAULT_TRIAL_DAYS
        billing_interval = str(plan_definition.get("billing_interval", "monthly")) if plan_definition else "monthly"

        subscription.plan = plan
        subscription.billing_interval = billing_interval
        subscription.current_period_starts_at = current_time
        subscription.trial_ends_at = current_time + timedelta(days=trial_days)
        if billing_interval == "yearly":
            subscription.current_period_ends_at = current_time + timedelta(days=365)
        else:
            subscription.current_period_ends_at = current_time + timedelta(days=30)

    def attach_external_billing_reference(
        self,
        *,
        subscription: BusinessProductSubscription,
        external_reference: str,
    ) -> None:
        subscription.external_billing_reference = external_reference.strip()
        subscription.save(update_fields=["external_billing_reference", "updated_at"])
