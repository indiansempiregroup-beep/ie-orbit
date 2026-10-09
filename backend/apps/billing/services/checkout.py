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
    INTL_CHECKOUT_CURRENCY,
    PLAN_PRICE_PAISE,
    PLAN_PRICE_USD_CENTS,
    YEARLY_PRICE_MULTIPLIER,
    yearly_months_from_definition,
)
from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.billing.services.addon_pricing import get_addon_prices, get_addon_prices_minor
from apps.billing.services.cashfree_client import CashfreeClient, get_cashfree_config
from apps.billing.services.razorpay_client import RazorpayClient, get_razorpay_config
from apps.billing.services.region import (
    billing_region_for_business,
    price_minor_for_currency,
    saas_currency_for_business,
)
from apps.billing.services.stripe_client import StripeClient, get_stripe_config
from apps.businesses.constants import DEFAULT_TRIAL_DAYS, VALID_PRODUCT_CODES, get_plan_definition
from apps.businesses.models import Business
from apps.tenancy.models import Tenant

logger = logging.getLogger("ie_orbit.billing.checkout")


class CheckoutService:
    def __init__(
        self,
        razorpay_client: RazorpayClient | None = None,
        cashfree_client: CashfreeClient | None = None,
        stripe_client: StripeClient | None = None,
    ) -> None:
        self.razorpay = razorpay_client or RazorpayClient()
        self.cashfree = cashfree_client or CashfreeClient()
        self.stripe = stripe_client or StripeClient()

    def get_status(self, *, business: Business | None = None) -> dict[str, Any]:
        razorpay = get_razorpay_config()
        cashfree = get_cashfree_config()
        stripe = get_stripe_config()
        razorpay_configured = razorpay.is_configured
        cashfree_configured = cashfree.is_configured
        stripe_configured = stripe.is_configured
        region = billing_region_for_business(business) if business is not None else "IN"
        saas_currency = saas_currency_for_business(business) if business is not None else DEFAULT_CHECKOUT_CURRENCY
        india_configured = razorpay_configured or cashfree_configured
        configured = stripe_configured if region == "INTL" else india_configured
        razorpay_webhook = bool(razorpay.webhook_secret)
        cashfree_webhook = cashfree_configured
        webhook_configured = (
            bool(stripe.webhook_secret)
            if region == "INTL"
            else (razorpay_configured and razorpay_webhook) or (cashfree_configured and cashfree_webhook)
        )
        if region == "INTL":
            provider = "stripe"
        elif razorpay_configured and cashfree_configured:
            provider = "both"
        elif cashfree_configured and not razorpay_configured:
            provider = "cashfree"
        else:
            provider = "razorpay"
        return {
            "provider": provider,
            "billing_region": region,
            "configured": configured,
            "key_id": razorpay.key_id if razorpay_configured else None,
            "webhook_configured": webhook_configured,
            "currency": saas_currency,
            "mock_mode": not configured,
            "razorpay": {
                "configured": razorpay_configured,
                "key_id": razorpay.key_id if razorpay_configured else None,
                "webhook_configured": razorpay_webhook,
            },
            "cashfree": {
                "configured": cashfree_configured,
                "app_id": cashfree.app_id if cashfree_configured else None,
                "webhook_configured": cashfree_webhook,
                "env": cashfree.env,
            },
            "stripe": {
                "configured": stripe_configured,
                "publishable_key": stripe.publishable_key if stripe_configured else None,
                "webhook_configured": bool(stripe.webhook_secret),
            },
        }

    def _resolve_checkout_provider(self, provider: str | None) -> str:
        requested = str(provider or "").strip().lower()
        razorpay_ok = self.razorpay.is_configured
        cashfree_ok = self.cashfree.is_configured
        if requested in {"razorpay", "cashfree"}:
            return requested
        if razorpay_ok:
            return "razorpay"
        if cashfree_ok:
            return "cashfree"
        return "razorpay"

    def create_checkout_session(
        self,
        *,
        tenant: Tenant,
        business: Business,
        product_code: str,
        plan_code: str,
        actor_id: str | None = None,
        provider: str | None = None,
    ) -> dict[str, Any]:
        normalized_product = product_code.strip().lower()
        normalized_plan = plan_code.strip().lower()

        if normalized_product not in VALID_PRODUCT_CODES:
            raise ValidationError({"product_code": "Unknown product code."})
        if get_plan_definition(normalized_product, normalized_plan) is None:
            raise ValidationError({"plan_code": "Unknown plan for this product."})

        region = billing_region_for_business(business)
        saas_currency = saas_currency_for_business(business)
        # Keep stored field in sync with country-derived lock.
        if str(getattr(business, "saas_currency", "") or "") != saas_currency:
            business.saas_currency = saas_currency
            business.save(update_fields=["saas_currency", "updated_at"])

        interval = "monthly"
        subscription = (
            business.product_subscriptions.filter(product_code=normalized_product).only("billing_interval").first()
        )
        if subscription is not None and subscription.billing_interval:
            interval = subscription.billing_interval
        amount_minor = self._resolve_plan_price_minor(normalized_plan, interval, currency=saas_currency)
        if amount_minor is None:
            raise ValidationError({"plan_code": "Plan price is not configured for checkout."})

        if region == "INTL":
            requested = str(provider or "").strip().lower()
            if requested in {"razorpay", "cashfree", "upi"}:
                raise ValidationError(
                    {
                        "provider": "International businesses must pay with Stripe in USD.",
                        "code": "intl_stripe_required",
                    }
                )
            return self._create_stripe_session(
                tenant=tenant,
                business=business,
                normalized_product=normalized_product,
                normalized_plan=normalized_plan,
                amount_cents=amount_minor,
                actor_id=actor_id,
            )

        amount_paise = amount_minor
        checkout_provider = self._resolve_checkout_provider(provider)
        selected_provider_ready = (
            self.cashfree.is_configured
            if checkout_provider == "cashfree"
            else self.razorpay.is_configured
        )
        if settings.BILLING_ENFORCE_LIVE_CHECKOUT and not selected_provider_ready:
            raise ValidationError(
                {
                    "billing": (
                        f"Live checkout is enforced. Configure {checkout_provider.title()} "
                        "credentials before using this provider."
                    )
                }
            )
        if checkout_provider == "cashfree":
            return self._create_cashfree_session(
                tenant=tenant,
                business=business,
                normalized_product=normalized_product,
                normalized_plan=normalized_plan,
                amount_paise=amount_paise,
                actor_id=actor_id,
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
                "provider": "razorpay",
            },
        )

        config = get_razorpay_config()
        return {
            "session_id": str(session.id),
            "provider": "razorpay",
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

    def _create_cashfree_session(
        self,
        *,
        tenant: Tenant,
        business: Business,
        normalized_product: str,
        normalized_plan: str,
        amount_paise: int,
        actor_id: str | None,
    ) -> dict[str, Any]:
        order_id = f"ie{uuid.uuid4().hex[:18]}"
        phone = "".join(ch for ch in str(business.primary_contact or "") if ch.isdigit())[-10:]
        remote = self.cashfree.create_order(
            amount_paise=amount_paise,
            currency=DEFAULT_CHECKOUT_CURRENCY,
            order_id=order_id,
            customer_id=str(business.id).replace("-", "")[:50],
            customer_phone=phone or "9999999999",
            customer_email=str(business.email or ""),
            notes={
                "tenant_id": str(tenant.id),
                "business_id": str(business.id),
                "product_code": normalized_product,
                "plan_code": normalized_plan,
            },
        )
        cashfree_order_id = str(remote.get("order_id") or order_id)
        payment_session_id = str(remote.get("payment_session_id") or "")
        expires_at = timezone.now() + timedelta(hours=CHECKOUT_SESSION_TTL_HOURS)
        session = BillingCheckoutSession.objects.create(
            tenant=tenant,
            business=business,
            product_code=normalized_product,
            plan_code=normalized_plan,
            razorpay_order_id=f"cf_{cashfree_order_id}"[:120],
            cashfree_order_id=cashfree_order_id,
            amount_paise=amount_paise,
            currency=str(remote.get("order_currency") or DEFAULT_CHECKOUT_CURRENCY),
            status=CheckoutSessionStatus.CREATED,
            expires_at=expires_at,
            metadata={
                "created_by": actor_id,
                "mock": bool(remote.get("mock")),
                "provider": "cashfree",
                "payment_session_id": payment_session_id,
            },
        )
        config = get_cashfree_config()
        return {
            "session_id": str(session.id),
            "provider": "cashfree",
            "order_id": cashfree_order_id,
            "payment_session_id": payment_session_id,
            "amount": session.amount_paise,
            "currency": session.currency,
            "product_code": session.product_code,
            "plan_code": session.plan_code,
            "configured": config.is_configured,
            "key_id": None,
            "app_id": config.app_id if config.is_configured else None,
            "env": config.env,
            "mock_mode": not config.is_configured,
            "expires_at": expires_at.isoformat(),
        }

    def _create_stripe_session(
        self,
        *,
        tenant: Tenant,
        business: Business,
        normalized_product: str,
        normalized_plan: str,
        amount_cents: int,
        actor_id: str | None,
    ) -> dict[str, Any]:
        if settings.BILLING_ENFORCE_LIVE_CHECKOUT and not self.stripe.is_configured:
            raise ValidationError(
                {
                    "billing": "Live checkout is enforced. Configure Stripe credentials for international billing.",
                    "code": "stripe_not_configured",
                }
            )
        web_base = str(getattr(settings, "WEB_APP_BASE_URL", "") or "https://app.ie-orbit.com").rstrip("/")
        success_url = f"{web_base}/settings/billing?stripe=success&session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{web_base}/settings/billing?stripe=cancel"
        remote = self.stripe.create_checkout_session(
            amount_cents=amount_cents,
            currency=INTL_CHECKOUT_CURRENCY,
            product_name=f"IE Orbit {normalized_plan}",
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=str(business.email or "") or None,
            metadata={
                "tenant_id": str(tenant.id),
                "business_id": str(business.id),
                "product_code": normalized_product,
                "plan_code": normalized_plan,
            },
        )
        stripe_session_id = str(remote.get("id") or "")
        expires_at = timezone.now() + timedelta(hours=CHECKOUT_SESSION_TTL_HOURS)
        session = BillingCheckoutSession.objects.create(
            tenant=tenant,
            business=business,
            product_code=normalized_product,
            plan_code=normalized_plan,
            razorpay_order_id=f"st_{stripe_session_id}"[:120],
            amount_paise=amount_cents,
            currency=INTL_CHECKOUT_CURRENCY,
            status=CheckoutSessionStatus.CREATED,
            expires_at=expires_at,
            metadata={
                "created_by": actor_id,
                "mock": bool(remote.get("mock")),
                "provider": "stripe",
                "stripe_checkout_session_id": stripe_session_id,
                "checkout_url": str(remote.get("url") or ""),
            },
        )
        config = get_stripe_config()
        return {
            "session_id": str(session.id),
            "provider": "stripe",
            "order_id": stripe_session_id,
            "checkout_url": str(remote.get("url") or ""),
            "amount": session.amount_paise,
            "currency": session.currency,
            "product_code": session.product_code,
            "plan_code": session.plan_code,
            "configured": config.is_configured,
            "publishable_key": config.publishable_key if config.is_configured else None,
            "mock_mode": not config.is_configured,
            "expires_at": expires_at.isoformat(),
        }

    def list_plan_catalog(
        self,
        *,
        currency: str | None = None,
        business: Business | None = None,
    ) -> list[dict[str, Any]]:
        from apps.businesses.services.plan_catalog import list_plan_definitions

        if business is not None:
            saas_currency = saas_currency_for_business(business)
        else:
            saas_currency = str(currency or DEFAULT_CHECKOUT_CURRENCY).strip().upper()
            if saas_currency not in {"INR", "USD"}:
                saas_currency = DEFAULT_CHECKOUT_CURRENCY

        plans: list[dict[str, Any]] = []
        addon_prices = get_addon_prices(currency=saas_currency)
        addon_minor = get_addon_prices_minor()
        for definition in list_plan_definitions():
            plan_code = str(definition["code"])
            product_code = str(definition.get("product_code", ""))
            months_charged = yearly_months_from_definition(definition)
            prices_minor = definition.get("prices_minor") or {}
            amount_minor = price_minor_for_currency(
                prices_minor,
                currency=saas_currency,
                interval="monthly",
                inr_monthly=(
                    int(definition["amount_paise"])
                    if definition.get("amount_paise") is not None
                    else self._resolve_plan_price_paise(plan_code)
                ),
                inr_yearly=(
                    int(definition["yearly_amount_paise"])
                    if definition.get("yearly_amount_paise") is not None
                    else None
                ),
            )
            if amount_minor is None:
                amount_minor = self._resolve_plan_price_minor(plan_code, "monthly", currency=saas_currency)
            yearly_amount = price_minor_for_currency(
                prices_minor,
                currency=saas_currency,
                interval="yearly",
                inr_monthly=amount_minor if saas_currency == "INR" else None,
                inr_yearly=(
                    int(definition["yearly_amount_paise"])
                    if definition.get("yearly_amount_paise") is not None
                    else None
                ),
            )
            if yearly_amount is None and amount_minor is not None:
                yearly_amount = amount_minor * months_charged

            # Legacy INR fields always reflect INR catalog for admin/back-compat.
            inr_monthly = price_minor_for_currency(
                prices_minor,
                currency="INR",
                interval="monthly",
                inr_monthly=(
                    int(definition["amount_paise"]) if definition.get("amount_paise") is not None else None
                ),
            )
            if inr_monthly is None:
                inr_monthly = self._resolve_plan_price_paise(plan_code)
            inr_yearly = price_minor_for_currency(
                prices_minor,
                currency="INR",
                interval="yearly",
                inr_monthly=inr_monthly,
                inr_yearly=(
                    int(definition["yearly_amount_paise"])
                    if definition.get("yearly_amount_paise") is not None
                    else None
                ),
            )
            if inr_yearly is None and inr_monthly is not None:
                inr_yearly = inr_monthly * months_charged

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
                    "max_extra_staff": definition.get("max_extra_staff"),
                    "max_extra_offices": definition.get("max_extra_offices"),
                    "bi_features": list(definition.get("bi_features") or []),
                    "features": list(definition.get("features") or []),
                    "amount_paise": inr_monthly if saas_currency == "INR" else amount_minor,
                    "yearly_amount_paise": inr_yearly if saas_currency == "INR" else yearly_amount,
                    "amount_minor": amount_minor,
                    "yearly_amount_minor": yearly_amount,
                    "yearly_months_charged": months_charged,
                    "addon_staff_price_paise": addon_prices["staff_price_paise"],
                    "addon_office_price_paise": addon_prices["office_price_paise"],
                    "addon_pets_price_paise": addon_prices["pets_price_paise"],
                    "prices_minor": prices_minor
                    or {
                        "INR": {"monthly": inr_monthly, "yearly": inr_yearly},
                        "USD": {
                            "monthly": PLAN_PRICE_USD_CENTS.get(plan_code),
                            "yearly": (
                                PLAN_PRICE_USD_CENTS[plan_code] * months_charged
                                if plan_code in PLAN_PRICE_USD_CENTS
                                else None
                            ),
                        },
                    },
                    "addon_prices_minor": addon_minor,
                    "is_public": bool(definition.get("is_public", True)),
                    "currency": saas_currency,
                }
            )
        return plans

    def list_public_plan_catalog(
        self,
        *,
        product_code: str | None = None,
        currency: str | None = None,
    ) -> dict[str, Any]:
        saas_currency = str(currency or DEFAULT_CHECKOUT_CURRENCY).strip().upper()
        if saas_currency not in {"INR", "USD"}:
            saas_currency = DEFAULT_CHECKOUT_CURRENCY
        plans = self.list_plan_catalog(currency=saas_currency)
        normalized = (product_code or "").strip().lower()
        if normalized:
            plans = [plan for plan in plans if plan.get("product_code") == normalized]
        plans = [plan for plan in plans if plan.get("is_public", True)]
        addon_prices = get_addon_prices(currency=saas_currency)
        trial_days = max((int(plan.get("trial_days") or 0) for plan in plans), default=DEFAULT_TRIAL_DAYS)
        return {
            "trial_days": trial_days or DEFAULT_TRIAL_DAYS,
            "currency": saas_currency,
            "addon_staff_price_paise": addon_prices["staff_price_paise"],
            "addon_office_price_paise": addon_prices["office_price_paise"],
            "addon_pets_price_paise": addon_prices["pets_price_paise"],
            "addon_prices_minor": get_addon_prices_minor(),
            "plans": plans,
        }

    def _resolve_plan_price_minor(
        self,
        plan_code: str,
        billing_interval: str = "monthly",
        *,
        currency: str = "INR",
    ) -> int | None:
        code = str(currency or "INR").strip().upper()
        if code == "USD":
            monthly = PLAN_PRICE_USD_CENTS.get(plan_code)
            from apps.businesses.services.plan_catalog import list_plan_definitions

            months_charged = YEARLY_PRICE_MULTIPLIER
            yearly_override: int | None = None
            for definition in list_plan_definitions():
                if str(definition.get("code", "")) != plan_code:
                    continue
                months_charged = yearly_months_from_definition(definition)
                usd = (definition.get("prices_minor") or {}).get("USD") or {}
                if usd.get("monthly") is not None:
                    monthly = int(usd["monthly"])
                if usd.get("yearly") is not None:
                    yearly_override = int(usd["yearly"])
                break
            if monthly is None and yearly_override is None:
                return None
            if billing_interval == "yearly":
                return yearly_override if yearly_override is not None else (monthly or 0) * months_charged
            return monthly
        return self._resolve_plan_price_paise(plan_code, billing_interval)

    def _resolve_plan_price_paise(self, plan_code: str, billing_interval: str = "monthly") -> int | None:
        overrides = getattr(settings, "BILLING_PLAN_PRICE_OVERRIDES", {}) or {}
        override = overrides.get(plan_code)
        monthly: int | None = None
        yearly_override: int | None = None
        months_charged = YEARLY_PRICE_MULTIPLIER
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
                    definition_yearly = definition.get("yearly_amount_paise")
                    if definition_yearly is not None:
                        try:
                            yearly_override = int(definition_yearly)
                        except (TypeError, ValueError):
                            yearly_override = None
                    months_charged = yearly_months_from_definition(definition)
                    break

        if monthly is None:
            monthly = PLAN_PRICE_PAISE.get(plan_code)
        if monthly is None and yearly_override is None:
            return None
        if billing_interval == "yearly":
            if yearly_override is not None:
                return yearly_override
            if monthly is None:
                return None
            return monthly * months_charged
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
            session = BillingCheckoutSession.objects.filter(cashfree_order_id=order_id).first()
            if session is None and order_id.startswith("cs_"):
                # Stripe Checkout session id may be stored as st_{cs_…} on razorpay_order_id.
                session = BillingCheckoutSession.objects.filter(
                    razorpay_order_id=f"st_{order_id}"[:120]
                ).first()
            if session is None:
                session = (
                    BillingCheckoutSession.objects.filter(
                        metadata__stripe_checkout_session_id=order_id
                    ).first()
                )
            if session is None:
                logger.warning("billing.checkout_session_not_found", extra={"order_id": order_id})
                return None

        if session.status == CheckoutSessionStatus.PAID:
            self._record_affiliate_commission(session)
            return session

        session.status = CheckoutSessionStatus.PAID
        session.paid_at = timezone.now()
        session.metadata = {
            **session.metadata,
            "payment_id": payment_id,
        }
        session.save(update_fields=["status", "paid_at", "metadata", "updated_at"])
        self._record_affiliate_commission(session)
        return session

    def _record_affiliate_commission(self, session: BillingCheckoutSession) -> None:
        kind = str((session.metadata or {}).get("kind") or "")
        if kind in {"smart_lookup_top_up", "assistant_top_up"}:
            return
        try:
            from apps.platform_admin.affiliate_service import AffiliateService

            AffiliateService().record_checkout_commission(session=session)
        except Exception:
            logger.exception(
                "billing.affiliate_commission_failed",
                extra={"session_id": str(session.id), "tenant_id": str(session.tenant_id)},
            )

    def _normalize_upi_line_item(self, raw: dict[str, Any], *, business: Business) -> dict[str, Any]:
        from apps.businesses.models import BusinessProductSubscriptionStatus
        from apps.businesses.services.entitlements import EntitlementService

        product_code = str(raw.get("product_code") or "").strip().lower()
        plan_code = str(raw.get("plan_code") or "").strip().lower()
        extra_staff = max(0, int(raw.get("extra_staff") or 0))
        extra_offices = max(0, int(raw.get("extra_offices") or 0))
        pets_pack_enabled = bool(raw.get("pets_pack_enabled"))
        requested_interval = str(raw.get("billing_interval") or "").strip().lower()
        if product_code not in VALID_PRODUCT_CODES:
            raise ValidationError({"product_code": "Unknown product code."})
        if get_plan_definition(product_code, plan_code) is None:
            raise ValidationError({"plan_code": "Unknown plan for this product."})
        if requested_interval and requested_interval not in {"monthly", "yearly"}:
            raise ValidationError({"billing_interval": "Use monthly or yearly."})

        EntitlementService().ensure_addon_caps(
            business=business,
            product_code=product_code,
            extra_staff=extra_staff,
            extra_offices=extra_offices,
            plan_code=plan_code,
        )
        subscription = (
            business.product_subscriptions.filter(product_code=product_code).select_related("plan").first()
        )
        interval = requested_interval or "monthly"
        if not requested_interval and subscription is not None and subscription.billing_interval:
            interval = subscription.billing_interval
        base = self._resolve_plan_price_paise(plan_code, interval)
        if base is None:
            raise ValidationError({"plan_code": "Plan price is not configured for checkout."})
        addon_prices = get_addon_prices()
        plan_definition = get_plan_definition(product_code, plan_code) or {}
        multiplier = yearly_months_from_definition(plan_definition) if interval == "yearly" else 1
        amount_paise = (
            base
            + extra_staff * addon_prices["staff_price_paise"] * multiplier
            + extra_offices * addon_prices["office_price_paise"] * multiplier
            + (addon_prices["pets_price_paise"] * multiplier if pets_pack_enabled else 0)
        )
        intent = "subscribe"
        if subscription is not None and subscription.status in {
            BusinessProductSubscriptionStatus.TRIALING,
            BusinessProductSubscriptionStatus.ACTIVE,
            BusinessProductSubscriptionStatus.SOFT_LOCKED,
        }:
            intent = "renew"
        return {
            "product_code": product_code,
            "plan_code": plan_code,
            "extra_staff": extra_staff,
            "extra_offices": extra_offices,
            "pets_pack_enabled": pets_pack_enabled,
            "billing_interval": interval,
            "amount_paise": int(amount_paise),
            "intent": intent,
        }

    def create_upi_checkout_session(
        self,
        *,
        tenant: Tenant,
        business: Business,
        product_code: str = "",
        plan_code: str = "",
        amount_paise: int | None = None,
        extra_staff: int = 0,
        extra_offices: int = 0,
        pets_pack_enabled: bool = False,
        billing_interval: str | None = None,
        items: list[dict[str, Any]] | None = None,
        actor_id: str | None = None,
    ) -> dict[str, Any]:
        from apps.common.upi import build_upi_pay_url

        if billing_region_for_business(business) != "IN":
            raise ValidationError(
                {
                    "upi": "UPI billing is only available for India. International businesses pay in USD via Stripe.",
                    "code": "intl_stripe_required",
                }
            )

        raw_items = list(items or [])
        if not raw_items:
            raw_items = [
                {
                    "product_code": product_code,
                    "plan_code": plan_code,
                    "extra_staff": extra_staff,
                    "extra_offices": extra_offices,
                    "pets_pack_enabled": pets_pack_enabled,
                    **(
                        {"billing_interval": billing_interval}
                        if billing_interval
                        else {}
                    ),
                }
            ]
        if len(raw_items) > 8:
            raise ValidationError({"items": "Select up to 8 products to pay at once."})

        seen: set[str] = set()
        line_items: list[dict[str, Any]] = []
        for raw in raw_items:
            if not isinstance(raw, dict):
                raise ValidationError({"items": "Each item must include a product and plan."})
            item = self._normalize_upi_line_item(raw, business=business)
            if item["product_code"] in seen:
                raise ValidationError({"items": "Each product can appear once in a payment."})
            seen.add(item["product_code"])
            line_items.append(item)

        first = line_items[0]
        computed_total = sum(int(item["amount_paise"]) for item in line_items)
        total = int(amount_paise) if amount_paise is not None else computed_total
        if total <= 0:
            raise ValidationError({"amount": "Checkout amount must be positive."})

        vpa = str(getattr(settings, "PLATFORM_UPI_VPA", "") or "").strip()
        if not vpa:
            raise ValidationError({"upi": "Platform UPI ID is not configured."})

        order_id = f"upi_{uuid.uuid4().hex}"
        expires_at = timezone.now() + timedelta(hours=CHECKOUT_SESSION_TTL_HOURS)
        amount_rupees = total / 100
        note = ",".join(f"{item['product_code']}-{item['plan_code']}" for item in line_items)[:80]
        pay_url = build_upi_pay_url(
            vpa=vpa,
            payee_name=str(getattr(settings, "PLATFORM_UPI_NAME", "") or "IE Orbit"),
            amount=amount_rupees,
            note=note,
            currency=DEFAULT_CHECKOUT_CURRENCY,
        )
        intent = "renew" if any(item["intent"] == "renew" for item in line_items) else "subscribe"
        session = BillingCheckoutSession.objects.create(
            tenant=tenant,
            business=business,
            product_code=first["product_code"],
            plan_code=first["plan_code"],
            razorpay_order_id=order_id,
            amount_paise=total,
            currency=DEFAULT_CHECKOUT_CURRENCY,
            status=CheckoutSessionStatus.CREATED,
            expires_at=expires_at,
            metadata={
                "payment_channel": "upi_claim",
                "payment_status": "due",
                "created_by": actor_id,
                "extra_staff": int(first["extra_staff"]),
                "extra_offices": int(first["extra_offices"]),
                "pets_pack_enabled": bool(first["pets_pack_enabled"]),
                "upi_pay_url": pay_url,
                "upi_vpa": vpa,
                "line_items": line_items,
                "claim_intent": intent,
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
            "claim_intent": intent,
            "line_items": line_items,
            "expires_at": expires_at.isoformat(),
        }

    def claim_upi_session(
        self,
        *,
        session_id: str,
        business: Business,
        upi_utr: str,
        payment_proof_url: str = "",
        payment_proof_media_id: str = "",
    ) -> BillingCheckoutSession:
        from apps.billing.services.upi_notifications import notify_upi_claim_submitted
        from apps.billing.services.upi_proof import resolve_payment_proof_url

        session = BillingCheckoutSession.objects.filter(id=session_id, business=business).first()
        if session is None:
            raise ValidationError({"session": "Checkout session not found."})
        meta = dict(session.metadata or {})
        if str(meta.get("payment_channel") or "") != "upi_claim":
            raise ValidationError({"session": "Not a UPI claim session."})
        if session.status == CheckoutSessionStatus.PAID:
            raise ValidationError({"session": "Already paid."})
        utr = str(upi_utr or "").strip()
        proof, media_id = resolve_payment_proof_url(
            payment_proof_url=payment_proof_url,
            payment_proof_media_id=payment_proof_media_id,
        )
        if media_id:
            from uuid import UUID

            from apps.platform_media.models import Media

            try:
                UUID(str(media_id))
            except ValueError as exc:
                raise ValidationError({"payment_proof_media_id": "Screenshot not found."}) from exc
            media = Media.objects.filter(id=media_id, business=business).first()
            if media is None:
                raise ValidationError({"payment_proof_media_id": "Screenshot not found."})
        if len(utr) < 6 and not proof:
            raise ValidationError(
                {"upi_utr": "Enter a UPI / UTR reference or upload a payment screenshot."}
            )
        meta.update(
            {
                "payment_status": "awaiting_confirmation",
                "upi_utr": utr,
                "payment_proof_url": proof,
                "payment_proof_media_id": media_id,
                "claimed_at": timezone.now().isoformat(),
            }
        )
        session.metadata = meta
        session.save(update_fields=["metadata", "updated_at"])
        try:
            notify_upi_claim_submitted(session)
        except Exception:
            logger.exception("upi_claim_notify_failed session_id=%s", session.id)
        return session

    def confirm_upi_session(
        self,
        *,
        session_id: str,
        action: str,
        note: str = "",
        actor_id: str | None = None,
    ) -> BillingCheckoutSession:
        from apps.billing.services.upi_notifications import notify_upi_claim_resolved

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
            meta["confirmed_at"] = timezone.now().isoformat()
            session.metadata = meta
            session.save(update_fields=["metadata", "updated_at"])
            if str(meta.get("kind") or "") == "smart_lookup_top_up":
                self._credit_smart_lookup_wallet(session)
            elif str(meta.get("kind") or "") == "assistant_top_up":
                self._credit_assistant_wallet(session)
            else:
                self._activate_subscription_for_session(session)
            try:
                from apps.billing.services.tax_invoices import TaxInvoiceService

                TaxInvoiceService().issue_tax_invoice_for_session(session)
            except Exception:
                logger.exception("tax_invoice_issue_failed session_id=%s", session.id)
            try:
                notify_upi_claim_resolved(session, action="confirm", note=str(note or ""))
            except Exception:
                logger.exception("upi_confirm_notify_failed session_id=%s", session.id)
            return session
        if act == "reject":
            meta["payment_status"] = "rejected"
            meta["reject_note"] = str(note or "").strip()
            meta["rejected_by"] = actor_id
            meta["rejected_at"] = timezone.now().isoformat()
            session.metadata = meta
            session.save(update_fields=["metadata", "updated_at"])
            try:
                notify_upi_claim_resolved(session, action="reject", note=str(note or ""))
            except Exception:
                logger.exception("upi_reject_notify_failed session_id=%s", session.id)
            return session
        raise ValidationError({"action": "action must be confirm or reject."})

    def _line_items_for_session(self, session: BillingCheckoutSession) -> list[dict[str, Any]]:
        meta = session.metadata or {}
        items = meta.get("line_items")
        if isinstance(items, list) and items:
            return [item for item in items if isinstance(item, dict)]
        return [
            {
                "product_code": session.product_code,
                "plan_code": session.plan_code,
                "extra_staff": int(meta.get("extra_staff") or 0),
                "extra_offices": int(meta.get("extra_offices") or 0),
                "pets_pack_enabled": bool(meta.get("pets_pack_enabled")),
            }
        ]

    def create_smart_lookup_upi_session(
        self,
        *,
        tenant: Tenant,
        business: Business,
        amount_paise: int,
        actor_id: str | None = None,
    ) -> dict[str, Any]:
        """Prepaid Smart lookup wallet top-up via the same UPI claim flow as subscriptions."""
        from apps.common.upi import build_upi_pay_url
        from apps.shopie.services.smart_lookup import SmartLookupService

        total = int(amount_paise or 0)
        if total < 100:
            raise ValidationError({"amount_paise": "Minimum top-up is ₹1."})
        if total > 100_000_00:
            raise ValidationError({"amount_paise": "Maximum top-up is ₹1,00,000."})

        smart = SmartLookupService()
        if not smart.platform_allows(tenant=tenant):
            raise ValidationError({"smart_lookup": "Smart lookup is disabled by the platform."})
        if not smart.plan_allows(business=business):
            raise ValidationError(
                {
                    "smart_lookup": (
                        "Smart product lookup is not included in the current plan. "
                        "Ask your platform admin to enable it on the package Features tab."
                    )
                }
            )

        vpa = str(getattr(settings, "PLATFORM_UPI_VPA", "") or "").strip()
        if not vpa:
            raise ValidationError({"upi": "Platform UPI ID is not configured."})

        order_id = f"upi_sl_{uuid.uuid4().hex}"
        expires_at = timezone.now() + timedelta(hours=CHECKOUT_SESSION_TTL_HOURS)
        amount_rupees = total / 100
        pay_url = build_upi_pay_url(
            vpa=vpa,
            payee_name=str(getattr(settings, "PLATFORM_UPI_NAME", "") or "IE Orbit"),
            amount=amount_rupees,
            note="Smart lookup wallet",
            currency=DEFAULT_CHECKOUT_CURRENCY,
        )
        session = BillingCheckoutSession.objects.create(
            tenant=tenant,
            business=business,
            product_code="shopie",
            plan_code="smart_lookup_wallet",
            razorpay_order_id=order_id,
            amount_paise=total,
            currency=DEFAULT_CHECKOUT_CURRENCY,
            status=CheckoutSessionStatus.CREATED,
            expires_at=expires_at,
            metadata={
                "payment_channel": "upi_claim",
                "payment_status": "due",
                "kind": "smart_lookup_top_up",
                "created_by": actor_id,
                "upi_pay_url": pay_url,
                "upi_vpa": vpa,
                "claim_intent": "smart_lookup_top_up",
                "line_items": [
                    {
                        "product_code": "shopie",
                        "plan_code": "smart_lookup_wallet",
                        "amount_paise": total,
                        "intent": "smart_lookup_top_up",
                        "extra_staff": 0,
                        "extra_offices": 0,
                        "pets_pack_enabled": False,
                    }
                ],
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
            "claim_intent": "smart_lookup_top_up",
            "kind": "smart_lookup_top_up",
            "expires_at": expires_at.isoformat(),
        }

    def _credit_smart_lookup_wallet(self, session: BillingCheckoutSession) -> None:
        from apps.shopie.services.smart_lookup import SmartLookupService

        meta = dict(session.metadata or {})
        if meta.get("wallet_credited"):
            return
        SmartLookupService().credit_wallet(
            tenant=session.tenant,
            business=session.business,
            amount_paise=int(session.amount_paise),
            reason=f"upi_top_up:{session.razorpay_order_id}",
        )
        meta["wallet_credited"] = True
        meta["wallet_credited_at"] = timezone.now().isoformat()
        session.metadata = meta
        session.save(update_fields=["metadata", "updated_at"])

    def create_assistant_upi_session(
        self,
        *,
        tenant: Tenant,
        business: Business,
        amount_paise: int,
        actor_id: str | None = None,
    ) -> dict[str, Any]:
        """Prepaid Business Assistant wallet top-up via the same UPI claim flow."""
        from apps.assistant.services.access import ensure_assistant_access
        from apps.assistant.services.wallet import AssistantWalletService
        from apps.common.upi import build_upi_pay_url

        total = int(amount_paise or 0)
        if total < 100:
            raise ValidationError({"amount_paise": "Minimum top-up is ₹1."})
        if total > 100_000_00:
            raise ValidationError({"amount_paise": "Maximum top-up is ₹1,00,000."})

        ensure_assistant_access(business=business)
        wallet = AssistantWalletService()
        if not wallet.platform_overage_enabled():
            raise ValidationError(
                {"assistant": "Assistant prepaid top-ups are disabled by the platform."}
            )

        vpa = str(getattr(settings, "PLATFORM_UPI_VPA", "") or "").strip()
        if not vpa:
            raise ValidationError({"upi": "Platform UPI ID is not configured."})

        order_id = f"upi_as_{uuid.uuid4().hex}"
        expires_at = timezone.now() + timedelta(hours=CHECKOUT_SESSION_TTL_HOURS)
        amount_rupees = total / 100
        pay_url = build_upi_pay_url(
            vpa=vpa,
            payee_name=str(getattr(settings, "PLATFORM_UPI_NAME", "") or "IE Orbit"),
            amount=amount_rupees,
            note="Assistant wallet",
            currency=DEFAULT_CHECKOUT_CURRENCY,
        )
        session = BillingCheckoutSession.objects.create(
            tenant=tenant,
            business=business,
            product_code="shopie",
            plan_code="assistant_wallet",
            razorpay_order_id=order_id,
            amount_paise=total,
            currency=DEFAULT_CHECKOUT_CURRENCY,
            status=CheckoutSessionStatus.CREATED,
            expires_at=expires_at,
            metadata={
                "payment_channel": "upi_claim",
                "payment_status": "due",
                "kind": "assistant_top_up",
                "created_by": actor_id,
                "upi_pay_url": pay_url,
                "upi_vpa": vpa,
                "claim_intent": "assistant_top_up",
                "line_items": [
                    {
                        "product_code": "shopie",
                        "plan_code": "assistant_wallet",
                        "amount_paise": total,
                        "intent": "assistant_top_up",
                        "extra_staff": 0,
                        "extra_offices": 0,
                        "pets_pack_enabled": False,
                    }
                ],
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
            "claim_intent": "assistant_top_up",
            "kind": "assistant_top_up",
            "expires_at": expires_at.isoformat(),
        }

    def _credit_assistant_wallet(self, session: BillingCheckoutSession) -> None:
        from apps.assistant.services.wallet import AssistantWalletService

        meta = dict(session.metadata or {})
        if meta.get("wallet_credited"):
            return
        AssistantWalletService().credit_wallet(
            tenant=session.tenant,
            business=session.business,
            amount_paise=int(session.amount_paise),
            reason=f"upi_top_up:{session.razorpay_order_id}",
        )
        meta["wallet_credited"] = True
        meta["wallet_credited_at"] = timezone.now().isoformat()
        session.metadata = meta
        session.save(update_fields=["metadata", "updated_at"])

    def _activate_subscription_for_session(self, session: BillingCheckoutSession) -> None:
        from apps.billing.services.webhooks import default_product_billing_service
        from apps.businesses.models import BusinessProductSubscriptionStatus
        from apps.businesses.repositories import BusinessRepository
        from apps.businesses.services import BusinessService

        billing_service = default_product_billing_service()
        business_service = BusinessService(
            repository=BusinessRepository(),
            billing_service=billing_service,
        )
        meta = session.metadata or {}
        reference = str(meta.get("upi_utr") or session.razorpay_order_id)
        for item in self._line_items_for_session(session):
            product_code = str(item.get("product_code") or session.product_code)
            plan_code = str(item.get("plan_code") or session.plan_code)
            billing_interval = str(item.get("billing_interval") or "").strip().lower() or None
            if billing_interval not in {None, "monthly", "yearly"}:
                billing_interval = None
            subscription = business_service.subscribe_to_product(
                business=session.business,
                product_code=product_code,
                plan_code=plan_code,
                actor=None,
                set_active=True,
                billing_interval=billing_interval,
            )
            subscription.extra_staff = int(item.get("extra_staff") or 0)
            subscription.extra_offices = int(item.get("extra_offices") or 0)
            subscription.pets_pack_enabled = bool(item.get("pets_pack_enabled"))
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
            billing_service.attach_external_billing_reference(
                subscription=subscription,
                external_reference=reference,
            )
