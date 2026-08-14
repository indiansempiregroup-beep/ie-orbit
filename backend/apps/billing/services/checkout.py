from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.billing.constants import (
    CHECKOUT_SESSION_TTL_HOURS,
    DEFAULT_CHECKOUT_CURRENCY,
    PLAN_PRICE_PAISE,
    YEARLY_PRICE_MULTIPLIER,
)
from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.billing.services.addon_pricing import get_addon_prices
from apps.billing.services.razorpay_client import RazorpayClient, get_razorpay_config
from apps.businesses.constants import DEFAULT_TRIAL_DAYS, VALID_PRODUCT_CODES, get_plan_definition
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
        from apps.businesses.services.plan_catalog import list_plan_definitions

        plans: list[dict[str, Any]] = []
        addon_prices = get_addon_prices()
        for definition in list_plan_definitions():
            plan_code = str(definition["code"])
            product_code = str(definition.get("product_code", ""))

            definition_amount = definition.get("amount_paise")
            amount_paise = (
                int(definition_amount) if definition_amount is not None else self._resolve_plan_price_paise(plan_code)
            )

            definition_yearly = definition.get("yearly_amount_paise")
            if definition_yearly is not None:
                yearly_amount = int(definition_yearly)
            else:
                yearly_amount = None if amount_paise is None else amount_paise * YEARLY_PRICE_MULTIPLIER

            plans.append(
                {
                    "product_code": product_code,
                    "plan_code": plan_code,
                    "name": str(definition.get("name", plan_code)),
                    "description": str(definition.get("description", "")),
                    "billing_interval": str(definition.get("billing_interval", "monthly")),
                    "trial_days": int(definition.get("trial_days", 0) or 0),
                    "is_default": bool(definition.get("is_default", False)),
                    "max_staff": int(definition.get("max_staff", 1) or 1),
                    "max_branches": int(definition.get("max_branches", 1) or 1),
                    "bi_features": list(definition.get("bi_features") or []),
                    "features": list(definition.get("features") or []),
                    "amount_paise": amount_paise,
                    "yearly_amount_paise": yearly_amount,
                    "addon_staff_price_paise": addon_prices["staff_price_paise"],
                    "addon_office_price_paise": addon_prices["office_price_paise"],
                    "addon_pets_price_paise": addon_prices["pets_price_paise"],
                    "is_public": bool(definition.get("is_public", True)),
                    "currency": DEFAULT_CHECKOUT_CURRENCY,
                }
            )
        return plans

    def list_public_plan_catalog(self, *, product_code: str | None = None) -> dict[str, Any]:
        plans = self.list_plan_catalog()
        normalized = (product_code or "").strip().lower()
        if normalized:
            plans = [plan for plan in plans if plan.get("product_code") == normalized]
        plans = [plan for plan in plans if plan.get("is_public", True)]
        addon_prices = get_addon_prices()
        trial_days = max((int(plan.get("trial_days") or 0) for plan in plans), default=DEFAULT_TRIAL_DAYS)
        return {
            "trial_days": trial_days or DEFAULT_TRIAL_DAYS,
            "addon_staff_price_paise": addon_prices["staff_price_paise"],
            "addon_office_price_paise": addon_prices["office_price_paise"],
            "addon_pets_price_paise": addon_prices["pets_price_paise"],
            "plans": plans,
        }

    def _resolve_plan_price_paise(self, plan_code: str, billing_interval: str = "monthly") -> int | None:
        overrides = getattr(settings, "BILLING_PLAN_PRICE_OVERRIDES", {}) or {}
        override = overrides.get(plan_code)
        monthly: int | None = None
        if override is not None:
            try:
                monthly = int(override)
            except (TypeError, ValueError):
                monthly = None

        if monthly is None:
            from apps.businesses.services.plan_catalog import list_plan_definitions

            for definition in list_plan_definitions():
                if str(definition.get("code", "")) == plan_code:
                    definition_amount = definition.get("amount_paise")
                    if definition_amount is not None:
                        monthly = int(definition_amount)
                    break

        if monthly is None:
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

    def create_upi_checkout_session(
        self,
        *,
        tenant: Tenant,
        business: Business,
        product_code: str,
        plan_code: str,
        amount_paise: int | None = None,
        extra_staff: int = 0,
        extra_offices: int = 0,
        pets_pack_enabled: bool = False,
        actor_id: str | None = None,
    ) -> dict[str, Any]:
        from apps.common.upi import build_upi_pay_url

        normalized_product = product_code.strip().lower()
        normalized_plan = plan_code.strip().lower()
        if normalized_product not in VALID_PRODUCT_CODES:
            raise ValidationError({"product_code": "Unknown product code."})
        if get_plan_definition(normalized_product, normalized_plan) is None:
            raise ValidationError({"plan_code": "Unknown plan for this product."})

        base = self._resolve_plan_price_paise(normalized_plan)
        if base is None:
            raise ValidationError({"plan_code": "Plan price is not configured for checkout."})
        addon_prices = get_addon_prices()
        total = amount_paise if amount_paise is not None else (
            base
            + max(0, int(extra_staff)) * addon_prices["staff_price_paise"]
            + max(0, int(extra_offices)) * addon_prices["office_price_paise"]
            + (addon_prices["pets_price_paise"] if pets_pack_enabled else 0)
        )
        if total <= 0:
            raise ValidationError({"amount": "Checkout amount must be positive."})

        vpa = str(getattr(settings, "PLATFORM_UPI_VPA", "") or "").strip()
        if not vpa:
            raise ValidationError({"upi": "Platform UPI ID is not configured."})

        order_id = f"upi_{uuid.uuid4().hex}"
        expires_at = timezone.now() + timedelta(hours=CHECKOUT_SESSION_TTL_HOURS)
        amount_rupees = total / 100
        pay_url = build_upi_pay_url(
            vpa=vpa,
            payee_name=str(getattr(settings, "PLATFORM_UPI_NAME", "") or "IE Platform"),
            amount=amount_rupees,
            note=f"{normalized_product}-{normalized_plan}",
            currency=DEFAULT_CHECKOUT_CURRENCY,
        )
        session = BillingCheckoutSession.objects.create(
            tenant=tenant,
            business=business,
            product_code=normalized_product,
            plan_code=normalized_plan,
            razorpay_order_id=order_id,
            amount_paise=total,
            currency=DEFAULT_CHECKOUT_CURRENCY,
            status=CheckoutSessionStatus.CREATED,
            expires_at=expires_at,
            metadata={
                "payment_channel": "upi_claim",
                "payment_status": "due",
                "created_by": actor_id,
                "extra_staff": int(extra_staff),
                "extra_offices": int(extra_offices),
                "pets_pack_enabled": bool(pets_pack_enabled),
                "upi_pay_url": pay_url,
                "upi_vpa": vpa,
            },
        )
        return {
            "session_id": str(session.id),
            "order_id": session.razorpay_order_id,
            "amount": session.amount_paise,
            "currency": session.currency,
            "product_code": session.product_code,
            "plan_code": session.plan_code,
            "upi_vpa": vpa,
            "upi_pay_url": pay_url,
            "payment_qr_url": str(getattr(settings, "PLATFORM_PAYMENT_QR_URL", "") or ""),
            "payment_status": "due",
            "expires_at": expires_at.isoformat(),
        }

    def claim_upi_session(
        self,
        *,
        session_id: str,
        business: Business,
        upi_utr: str,
        payment_proof_url: str = "",
    ) -> BillingCheckoutSession:
        session = BillingCheckoutSession.objects.filter(id=session_id, business=business).first()
        if session is None:
            raise ValidationError({"session": "Checkout session not found."})
        meta = dict(session.metadata or {})
        if str(meta.get("payment_channel") or "") != "upi_claim":
            raise ValidationError({"session": "Not a UPI claim session."})
        if session.status == CheckoutSessionStatus.PAID:
            raise ValidationError({"session": "Already paid."})
        utr = str(upi_utr or "").strip()
        proof = str(payment_proof_url or "").strip()
        if len(utr) < 6 and not proof:
            raise ValidationError(
                {"upi_utr": "Enter a UPI / UTR reference or upload a payment screenshot."}
            )
        meta.update(
            {
                "payment_status": "awaiting_confirmation",
                "upi_utr": utr,
                "payment_proof_url": proof,
                "claimed_at": timezone.now().isoformat(),
            }
        )
        session.metadata = meta
        session.save(update_fields=["metadata", "updated_at"])
        return session

    def confirm_upi_session(
        self,
        *,
        session_id: str,
        action: str,
        note: str = "",
        actor_id: str | None = None,
    ) -> BillingCheckoutSession:
        session = BillingCheckoutSession.objects.filter(id=session_id).first()
        if session is None:
            raise ValidationError({"session": "Checkout session not found."})
        meta = dict(session.metadata or {})
        act = str(action or "").strip().lower()
        if act == "confirm":
            session = self.mark_session_paid(
                order_id=session.razorpay_order_id,
                payment_id=str(meta.get("upi_utr") or session.razorpay_order_id),
            )
            if session is None:
                raise ValidationError({"session": "Unable to mark paid."})
            meta = dict(session.metadata or {})
            meta["payment_status"] = "paid"
            meta["confirm_note"] = str(note or "").strip()
            meta["confirmed_by"] = actor_id
            session.metadata = meta
            session.save(update_fields=["metadata", "updated_at"])
            self._activate_subscription_for_session(session)
            return session
        if act == "reject":
            meta["payment_status"] = "rejected"
            meta["reject_note"] = str(note or "").strip()
            meta["rejected_by"] = actor_id
            session.metadata = meta
            session.save(update_fields=["metadata", "updated_at"])
            return session
        raise ValidationError({"action": "action must be confirm or reject."})

    def _activate_subscription_for_session(self, session: BillingCheckoutSession) -> None:
        from apps.businesses.models import BusinessProductSubscriptionStatus
        from apps.businesses.repositories import BusinessRepository
        from apps.businesses.services import BusinessService
        from apps.billing.services.webhooks import default_product_billing_service

        billing_service = default_product_billing_service()
        business_service = BusinessService(
            repository=BusinessRepository(),
            billing_service=billing_service,
        )
        subscription = business_service.subscribe_to_product(
            business=session.business,
            product_code=session.product_code,
            plan_code=session.plan_code,
            actor=None,
            set_active=True,
        )
        meta = session.metadata or {}
        if "extra_staff" in meta or "extra_offices" in meta or "pets_pack_enabled" in meta:
            subscription.extra_staff = int(meta.get("extra_staff") or 0)
            subscription.extra_offices = int(meta.get("extra_offices") or 0)
            subscription.pets_pack_enabled = bool(meta.get("pets_pack_enabled"))
            subscription.status = BusinessProductSubscriptionStatus.ACTIVE
            subscription.save(
                update_fields=[
                    "extra_staff",
                    "extra_offices",
                    "pets_pack_enabled",
                    "status",
                    "updated_at",
                ]
            )
        else:
            subscription.status = BusinessProductSubscriptionStatus.ACTIVE
            subscription.save(update_fields=["status", "updated_at"])
        billing_service.attach_external_billing_reference(
            subscription=subscription,
            external_reference=str((meta or {}).get("upi_utr") or session.razorpay_order_id),
        )
