from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.billing.constants import (
    ADDON_OFFICE_PRICE_PAISE,
    ADDON_STAFF_PRICE_PAISE,
    CHECKOUT_SESSION_TTL_HOURS,
    DEFAULT_CHECKOUT_CURRENCY,
    PLAN_PRICE_PAISE,
    YEARLY_PRICE_MULTIPLIER,
)
from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.billing.services.razorpay_client import RazorpayClient, get_razorpay_config
from apps.businesses.constants import PRODUCT_PLAN_CATALOG, VALID_PRODUCT_CODES, get_plan_definition
from apps.businesses.models import Business
from apps.tenancy.models import Tenant

logger = logging.getLogger("ie_platform.billing.checkout")


class CheckoutService:
    def __init__(self, razorpay_client: RazorpayClient | None = None) -> None:
        self.razorpay = razorpay_client or RazorpayClient()

    def get_status(self) -> dict[str, Any]:
        config = get_razorpay_config()
        return {
            "provider": "razorpay",
            "configured": config.is_configured,
            "key_id": config.key_id if config.is_configured else None,
            "webhook_configured": bool(config.webhook_secret),
            "currency": DEFAULT_CHECKOUT_CURRENCY,
            "mock_mode": not config.is_configured,
        }

    def create_checkout_session(
        self,
        *,
        tenant: Tenant,
        business: Business,
        product_code: str,
        plan_code: str,
        actor_id: str | None = None,
    ) -> dict[str, Any]:
        normalized_product = product_code.strip().lower()
        normalized_plan = plan_code.strip().lower()

        if normalized_product not in VALID_PRODUCT_CODES:
            raise ValidationError({"product_code": "Unknown product code."})
        if get_plan_definition(normalized_product, normalized_plan) is None:
            raise ValidationError({"plan_code": "Unknown plan for this product."})

        amount_paise = self._resolve_plan_price_paise(normalized_plan)
        if amount_paise is None:
            raise ValidationError({"plan_code": "Plan price is not configured for checkout."})
        if settings.BILLING_ENFORCE_LIVE_CHECKOUT and not self.razorpay.is_configured:
            raise ValidationError(
                {
                    "billing": (
                        "Live checkout is enforced. Configure Razorpay credentials "
                        "before creating checkout sessions."
                    )
                }
            )

        receipt = f"biz-{business.id}-{normalized_plan}-{uuid.uuid4().hex[:8]}"
        order = self.razorpay.create_order(
            amount_paise=amount_paise,
            currency=DEFAULT_CHECKOUT_CURRENCY,
            receipt=receipt,
            notes={
                "tenant_id": str(tenant.id),
                "business_id": str(business.id),
                "product_code": normalized_product,
                "plan_code": normalized_plan,
            },
        )

        expires_at = timezone.now() + timedelta(hours=CHECKOUT_SESSION_TTL_HOURS)
        session = BillingCheckoutSession.objects.create(
            tenant=tenant,
            business=business,
            product_code=normalized_product,
            plan_code=normalized_plan,
            razorpay_order_id=str(order["id"]),
            amount_paise=amount_paise,
            currency=str(order.get("currency", DEFAULT_CHECKOUT_CURRENCY)),
            status=CheckoutSessionStatus.CREATED,
            expires_at=expires_at,
            metadata={
                "receipt": receipt,
                "created_by": actor_id,
                "mock": bool(order.get("mock")),
            },
        )

        config = get_razorpay_config()
        return {
            "session_id": str(session.id),
            "order_id": session.razorpay_order_id,
            "amount": session.amount_paise,
            "currency": session.currency,
            "product_code": session.product_code,
            "plan_code": session.plan_code,
            "configured": config.is_configured,
            "key_id": config.key_id if config.is_configured else None,
            "mock_mode": not config.is_configured,
            "expires_at": expires_at.isoformat(),
        }

    def list_plan_catalog(self) -> list[dict[str, Any]]:
        plans: list[dict[str, Any]] = []
        for product_code, product_plans in PRODUCT_PLAN_CATALOG.items():
            for plan in product_plans:
                plan_code = str(plan["code"])
                amount_paise = self._resolve_plan_price_paise(plan_code)
                yearly_amount = (
                    None if amount_paise is None else amount_paise * YEARLY_PRICE_MULTIPLIER
                )
                plans.append(
                    {
                        "product_code": product_code,
                        "plan_code": plan_code,
                        "name": str(plan.get("name", plan_code)),
                        "description": str(plan.get("description", "")),
                        "billing_interval": str(plan.get("billing_interval", "monthly")),
                        "trial_days": int(plan.get("trial_days", 0) or 0),
                        "is_default": bool(plan.get("is_default", False)),
                        "max_staff": int(plan.get("max_staff", 1) or 1),
                        "max_branches": int(plan.get("max_branches", 1) or 1),
                        "bi_features": list(plan.get("bi_features") or []),
                        "features": list(plan.get("features") or []),
                        "amount_paise": amount_paise,
                        "yearly_amount_paise": yearly_amount,
                        "addon_staff_price_paise": ADDON_STAFF_PRICE_PAISE,
                        "addon_office_price_paise": ADDON_OFFICE_PRICE_PAISE,
                        "currency": DEFAULT_CHECKOUT_CURRENCY,
                    }
                )
        return plans

    def _resolve_plan_price_paise(self, plan_code: str, billing_interval: str = "monthly") -> int | None:
        overrides = getattr(settings, "BILLING_PLAN_PRICE_OVERRIDES", {}) or {}
        override = overrides.get(plan_code)
        monthly: int | None
        if override is not None:
            try:
                monthly = int(override)
            except (TypeError, ValueError):
                monthly = PLAN_PRICE_PAISE.get(plan_code)
        else:
            monthly = PLAN_PRICE_PAISE.get(plan_code)
        if monthly is None:
            return None
        if billing_interval == "yearly":
            return monthly * YEARLY_PRICE_MULTIPLIER
        return monthly

    def mark_session_paid(
        self,
        *,
        order_id: str,
        payment_id: str | None = None,
    ) -> BillingCheckoutSession | None:
        try:
            session = BillingCheckoutSession.objects.get(razorpay_order_id=order_id)
        except BillingCheckoutSession.DoesNotExist:
            logger.warning("billing.checkout_session_not_found", extra={"order_id": order_id})
            return None

        if session.status == CheckoutSessionStatus.PAID:
            return session

        session.status = CheckoutSessionStatus.PAID
        session.paid_at = timezone.now()
        session.metadata = {
            **session.metadata,
            "payment_id": payment_id,
        }
        session.save(update_fields=["status", "paid_at", "metadata", "updated_at"])
        return session
