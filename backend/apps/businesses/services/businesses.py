from __future__ import annotations

import logging
from datetime import datetime, time as dt_time
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.businesses.constants import VALID_PRODUCT_CODES, is_plan_upgrade
from apps.businesses.models import (
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
    BusinessProfile,
    BusinessSettings,
)
from apps.businesses.repositories import BusinessRepository
from apps.businesses.services.entitlements import EntitlementService
from apps.businesses.services.product_billing import ProductBillingService
from apps.businesses.services.subscription_lifecycle import SubscriptionLifecycleService

logger = logging.getLogger("ie_platform.businesses")

ACTIVE_SUBSCRIPTION_STATUSES = {
    BusinessProductSubscriptionStatus.TRIALING,
    BusinessProductSubscriptionStatus.ACTIVE,
    BusinessProductSubscriptionStatus.SOFT_LOCKED,
}

WEEKDAY_NAMES = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)


def _parse_clock(value: object, fallback: dt_time) -> dt_time:
    if isinstance(value, dt_time):
        return value
    text = str(value or "").strip()
    if not text:
        return fallback
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).time()
        except ValueError:
            continue
    return fallback


def _actor_can_force_immediate_plan_change(actor: Any) -> bool:
    if not actor or not getattr(actor, "is_authenticated", False):
        return False
    if getattr(actor, "is_superuser", False):
        return True
    return actor.user_roles.filter(
        role__is_active=True,
        role__code__in={"platform_admin", "super_admin"},
    ).exists()


class BusinessService:
    def __init__(
        self,
        repository: BusinessRepository | None = None,
        billing_service: ProductBillingService | None = None,
        entitlements: EntitlementService | None = None,
    ) -> None:
        self.repository = repository or BusinessRepository()
        self.entitlements = entitlements or EntitlementService()
        if billing_service is not None:
            self.billing_service = billing_service
        else:
            # Delayed import avoids circular import between businesses and billing hooks.
            from apps.billing.services.webhooks import default_product_billing_service

            self.billing_service = default_product_billing_service()

    @transaction.atomic
    def create_business(
        self,
        *,
        data: dict[str, Any],
        tenant: Any,
        organization: Any,
        actor: Any,
    ) -> Business:
        profile_data = data.pop("profile", None)
        settings_data = data.pop("settings", None)
        plan_code = data.pop("plan_code", None)
        plan_codes = data.pop("plan_codes", None) or {}
        selected_products = data.pop("selected_products", None) or []
        if isinstance(plan_code, str):
            plan_code = plan_code.strip() or None
        else:
            plan_code = None
        if not isinstance(plan_codes, dict):
            plan_codes = {}
        business = Business(
            tenant=tenant,
            organization=data.pop("organization", None) or organization,
            timezone=data.pop("timezone", tenant.timezone),
            currency=data.pop("currency", tenant.currency),
            language=data.pop("language", tenant.language),
            **data,
        )
        if getattr(actor, "is_authenticated", False):
            business.mark_created(actor_id=actor.id)
        business.full_clean()
        business.save()
        self.ensure_foundation_records(business)
        if isinstance(profile_data, dict):
            self.update_profile(business=business, data=profile_data)
        if isinstance(settings_data, dict):
            self.update_settings(business=business, data=settings_data)
        products = [
            str(code).strip().lower()
            for code in selected_products
            if str(code).strip()
        ]
        if business.selected_product and business.selected_product not in products:
            products.insert(0, business.selected_product)
        primary = business.selected_product or (products[0] if products else "")
        for product_code in products:
            resolved_plan = None
            if isinstance(plan_codes.get(product_code), str):
                resolved_plan = str(plan_codes.get(product_code) or "").strip() or None
            if not resolved_plan and product_code == primary:
                resolved_plan = plan_code
            self.subscribe_to_product(
                business=business,
                product_code=product_code,
                actor=actor,
                set_active=product_code == primary,
                plan_code=resolved_plan,
            )
        logger.info(
            "Business created",
            extra={"tenant_id": str(tenant.id), "business_id": str(business.id)},
        )
        return business

    @transaction.atomic
    def update_business(self, *, business: Business, data: dict[str, Any], actor: Any) -> Business:
        profile_data = data.pop("profile", None)
        settings_data = data.pop("settings", None)
        selected_product = data.get("selected_product")
        if selected_product and not self.has_active_subscription(
            business=business,
            product_code=selected_product,
        ):
            raise ValidationError(
                {"selected_product": "Subscribe to this product before setting it as active."}
            )
        for field, value in data.items():
            setattr(business, field, value)
        if getattr(actor, "is_authenticated", False):
            business.mark_updated(actor_id=actor.id)
        business.full_clean()
        business.save()
        if isinstance(profile_data, dict):
            self.update_profile(business=business, data=profile_data)
        if isinstance(settings_data, dict):
            self.update_settings(business=business, data=settings_data)
        logger.info("Business updated", extra={"business_id": str(business.id)})
        return business

    @transaction.atomic
    def delete_business(self, *, business: Business, actor: Any) -> None:
        deleted_by = (
            getattr(actor, "id", None) if getattr(actor, "is_authenticated", False) else None
        )
        business.soft_delete(deleted_by=deleted_by)
        logger.info("Business soft deleted", extra={"business_id": str(business.id)})

    def ensure_foundation_records(self, business: Business) -> None:
        BusinessProfile.objects.get_or_create(tenant=business.tenant, business=business)
        BusinessSettings.objects.get_or_create(
            tenant=business.tenant,
            business=business,
            defaults={
                "localization": {
                    "timezone": business.timezone,
                    "currency": business.currency,
                    "language": business.language,
                }
            },
        )

    def update_profile(self, *, business: Business, data: dict[str, Any]) -> BusinessProfile:
        profile, _ = BusinessProfile.objects.get_or_create(
            tenant=business.tenant,
            business=business,
        )
        for field, value in data.items():
            setattr(profile, field, value)
        profile.full_clean()
        profile.save()
        return profile

    def update_settings(self, *, business: Business, data: dict[str, Any]) -> BusinessSettings:
        from apps.customers.services.loyalty import LoyaltyService

        settings, _ = BusinessSettings.objects.get_or_create(
            tenant=business.tenant,
            business=business,
        )
        payload = dict(data)
        if "loyalty_preferences" in payload:
            raw = payload.get("loyalty_preferences") or {}
            if not isinstance(raw, dict):
                raise ValidationError({"loyalty_preferences": "Must be an object."})
            try:
                payload["loyalty_preferences"] = LoyaltyService().normalize_loyalty_preferences(
                    business=business,
                    data=raw,
                )
            except PermissionDenied as exc:
                raise ValidationError({"loyalty_preferences": str(exc.detail)}) from exc
        for field, value in payload.items():
            setattr(settings, field, value)
        settings.full_clean()
        settings.save()
        self._sync_weekly_hours_from_settings(business=business, settings=settings)
        return settings

    def _sync_weekly_hours_from_settings(self, *, business: Business, settings: BusinessSettings) -> None:
        hours = settings.business_hours if isinstance(settings.business_hours, dict) else {}
        days = hours.get("days")
        if not isinstance(days, dict) or not days:
            return

        from apps.bookings.models import BusinessSchedule, BusinessWeeklySchedule

        schedule = (
            BusinessSchedule.objects.filter(tenant=business.tenant, business=business, is_default=True)
            .order_by("created_at")
            .first()
        )
        if schedule is None:
            schedule = BusinessSchedule.objects.create(
                tenant=business.tenant,
                business=business,
                name="Default",
                timezone=business.timezone or "UTC",
                is_default=True,
            )
        for weekday, name in enumerate(WEEKDAY_NAMES):
            day = days.get(name)
            if not isinstance(day, dict):
                continue
            BusinessWeeklySchedule.objects.update_or_create(
                tenant=business.tenant,
                schedule=schedule,
                weekday=weekday,
                defaults={
                    "business": business,
                    "is_open": bool(day.get("open")),
                    "opening_time": _parse_clock(day.get("start"), dt_time(9, 0)),
                    "closing_time": _parse_clock(day.get("end"), dt_time(18, 0)),
                },
            )

    def has_active_subscription(self, *, business: Business, product_code: str) -> bool:
        return business.product_subscriptions.filter(
            product_code=product_code,
            status__in=ACTIVE_SUBSCRIPTION_STATUSES,
        ).exists()

    @transaction.atomic
    def subscribe_to_product(
        self,
        *,
        business: Business,
        product_code: str,
        actor: Any,
        set_active: bool = True,
        plan_code: str | None = None,
    ) -> BusinessProductSubscription:
        normalized_code = product_code.strip().lower()
        if normalized_code not in VALID_PRODUCT_CODES:
            raise ValidationError({"product_code": "Unknown product code."})

        plan, plan_definition = self.billing_service.resolve_subscription_plan(
            product_code=normalized_code,
            plan_code=plan_code,
        )

        subscription, created = BusinessProductSubscription.objects.get_or_create(
            tenant=business.tenant,
            business=business,
            product_code=normalized_code,
            defaults={"status": BusinessProductSubscriptionStatus.TRIALING},
        )
        reactivated = subscription.status == BusinessProductSubscriptionStatus.CANCELED
        if reactivated:
            subscription.status = BusinessProductSubscriptionStatus.TRIALING
            subscription.canceled_at = None

        self.billing_service.apply_plan_to_subscription(
            subscription=subscription,
            plan=plan,
            plan_definition=plan_definition,
        )
        # Checkout / renew clears any deferred downgrade and unlocks access.
        SubscriptionLifecycleService().clear_pending(subscription=subscription)
        if subscription.status in {
            BusinessProductSubscriptionStatus.SOFT_LOCKED,
            BusinessProductSubscriptionStatus.CANCELED,
        }:
            subscription.status = BusinessProductSubscriptionStatus.ACTIVE
        subscription.renewal_reminder_last_sent_on = None
        subscription.save()

        if created or reactivated:
            self.billing_service.hooks.on_subscription_started(subscription=subscription)

        if set_active:
            business.selected_product = normalized_code
            if getattr(actor, "is_authenticated", False):
                business.mark_updated(actor_id=actor.id)
            business.full_clean()
            business.save(update_fields=["selected_product", "updated_at", "updated_by"])

        logger.info(
            "Business product subscription %s",
            "created" if created else "updated",
            extra={
                "business_id": str(business.id),
                "product_code": normalized_code,
                "plan_code": plan.code,
            },
        )
        return subscription

    @transaction.atomic
    def unsubscribe_from_product(
        self,
        *,
        business: Business,
        product_code: str,
        actor: Any,
    ) -> Business:
        normalized_code = product_code.strip().lower()
        subscription = business.product_subscriptions.filter(product_code=normalized_code).first()
        if not subscription:
            raise ValidationError({"product_code": "This business is not subscribed to the product."})
        if subscription.status == BusinessProductSubscriptionStatus.CANCELED:
            raise ValidationError({"product_code": "This product subscription is already canceled."})

        subscription.status = BusinessProductSubscriptionStatus.CANCELED
        subscription.canceled_at = timezone.now()
        subscription.save(update_fields=["status", "canceled_at", "updated_at"])
        self.billing_service.hooks.on_subscription_canceled(subscription=subscription)

        if business.selected_product == normalized_code:
            fallback = (
                business.product_subscriptions.filter(status__in=ACTIVE_SUBSCRIPTION_STATUSES)
                .exclude(product_code=normalized_code)
                .order_by("subscribed_at")
                .first()
            )
            business.selected_product = fallback.product_code if fallback else ""
            if getattr(actor, "is_authenticated", False):
                business.mark_updated(actor_id=actor.id)
            business.full_clean()
            business.save(update_fields=["selected_product", "updated_at", "updated_by"])

        logger.info(
            "Business product unsubscribed",
            extra={"business_id": str(business.id), "product_code": normalized_code},
        )
        return business

    @transaction.atomic
    def change_product_plan(
        self,
        *,
        business: Business,
        product_code: str,
        plan_code: str,
        actor: Any,
        billing_interval: str | None = None,
        force_immediate: bool = False,
    ) -> BusinessProductSubscription:
        normalized_code = product_code.strip().lower()
        subscription = (
            business.product_subscriptions.filter(product_code=normalized_code)
            .select_related("plan")
            .first()
        )
        if not subscription or subscription.status not in ACTIVE_SUBSCRIPTION_STATUSES:
            raise ValidationError({"product_code": "Subscribe to this product before changing its plan."})

        current_plan_code = subscription.plan.code if subscription.plan else None
        upgrade = is_plan_upgrade(current_plan_code=current_plan_code, target_plan_code=plan_code)
        # Only platform admins / superusers may bypass period lock.
        force = bool(force_immediate) and _actor_can_force_immediate_plan_change(actor)
        period_active = (
            subscription.status == BusinessProductSubscriptionStatus.ACTIVE
            and subscription.current_period_ends_at is not None
            and subscription.current_period_ends_at > timezone.now()
        )
        # Paid active period: downgrades/lateral changes are scheduled for period end.
        defer = period_active and not upgrade and not force

        if not upgrade:
            self.entitlements.ensure_can_downgrade(
                business=business,
                target_plan_code=plan_code,
                product_code=normalized_code,
            )

        plan, plan_definition = self.billing_service.resolve_subscription_plan(
            product_code=normalized_code,
            plan_code=plan_code,
        )
        if billing_interval:
            plan_definition = {**(plan_definition or {}), "billing_interval": billing_interval}

        if defer:
            subscription.pending_plan = plan
            subscription.pending_billing_interval = (
                billing_interval or subscription.billing_interval or ""
            )
            subscription.pending_plan_scheduled_at = timezone.now()
            subscription.pending_cancel = False
            subscription.save(
                update_fields=[
                    "pending_plan",
                    "pending_billing_interval",
                    "pending_plan_scheduled_at",
                    "pending_cancel",
                    "updated_at",
                ]
            )
            if getattr(actor, "is_authenticated", False):
                business.mark_updated(actor_id=actor.id)
                business.save(update_fields=["updated_at", "updated_by"])
            logger.info(
                "Business product plan change scheduled",
                extra={
                    "business_id": str(business.id),
                    "product_code": normalized_code,
                    "pending_plan_code": plan.code,
                    "effective_at": str(subscription.current_period_ends_at),
                },
            )
            return subscription

        previous_plan_code = current_plan_code
        self.billing_service.apply_plan_to_subscription(
            subscription=subscription,
            plan=plan,
            plan_definition=plan_definition,
        )
        SubscriptionLifecycleService().clear_pending(subscription=subscription)
        # Paid plan selection ends trial / soft-lock.
        if subscription.status in {
            BusinessProductSubscriptionStatus.TRIALING,
            BusinessProductSubscriptionStatus.SOFT_LOCKED,
        }:
            subscription.status = BusinessProductSubscriptionStatus.ACTIVE
        subscription.renewal_reminder_last_sent_on = None
        subscription.save()
        self.billing_service.hooks.on_plan_changed(
            subscription=subscription,
            previous_plan_code=previous_plan_code,
        )

        if getattr(actor, "is_authenticated", False):
            business.mark_updated(actor_id=actor.id)
            business.save(update_fields=["updated_at", "updated_by"])

        logger.info(
            "Business product plan changed",
            extra={
                "business_id": str(business.id),
                "product_code": normalized_code,
                "plan_code": plan.code,
                "forced": force,
            },
        )
        return subscription

    @transaction.atomic
    def cancel_pending_plan_change(
        self,
        *,
        business: Business,
        product_code: str,
        actor: Any,
    ) -> BusinessProductSubscription:
        normalized_code = product_code.strip().lower()
        subscription = business.product_subscriptions.filter(product_code=normalized_code).first()
        if not subscription:
            raise ValidationError({"product_code": "No subscription found for this product."})
        if not subscription.pending_plan_id and not subscription.pending_cancel:
            raise ValidationError({"pending_plan": "There is no pending plan change to cancel."})
        SubscriptionLifecycleService().clear_pending(subscription=subscription)
        subscription.save(
            update_fields=[
                "pending_plan",
                "pending_billing_interval",
                "pending_extra_staff",
                "pending_extra_offices",
                "pending_plan_scheduled_at",
                "pending_cancel",
                "updated_at",
            ]
        )
        if getattr(actor, "is_authenticated", False):
            business.mark_updated(actor_id=actor.id)
            business.save(update_fields=["updated_at", "updated_by"])
        return subscription

    @transaction.atomic
    def schedule_cancel_at_period_end(
        self,
        *,
        business: Business,
        product_code: str,
        actor: Any,
    ) -> BusinessProductSubscription:
        normalized_code = product_code.strip().lower()
        subscription = business.product_subscriptions.filter(product_code=normalized_code).first()
        if not subscription or subscription.status not in ACTIVE_SUBSCRIPTION_STATUSES:
            raise ValidationError({"product_code": "Subscribe to this product before canceling."})
        period_active = (
            subscription.status == BusinessProductSubscriptionStatus.ACTIVE
            and subscription.current_period_ends_at is not None
            and subscription.current_period_ends_at > timezone.now()
        )
        if not period_active and not _actor_can_force_immediate_plan_change(actor):
            raise ValidationError({"status": "No active paid period to schedule cancellation against."})
        subscription.pending_cancel = True
        subscription.pending_plan = None
        subscription.pending_billing_interval = ""
        subscription.pending_plan_scheduled_at = timezone.now()
        subscription.save(
            update_fields=[
                "pending_cancel",
                "pending_plan",
                "pending_billing_interval",
                "pending_plan_scheduled_at",
                "updated_at",
            ]
        )
        if getattr(actor, "is_authenticated", False):
            business.mark_updated(actor_id=actor.id)
            business.save(update_fields=["updated_at", "updated_by"])
        return subscription

    @transaction.atomic
    def update_product_addons(
        self,
        *,
        business: Business,
        product_code: str,
        extra_staff: int,
        extra_offices: int,
        actor: Any,
        pets_pack_enabled: bool | None = None,
    ) -> BusinessProductSubscription:
        normalized_code = product_code.strip().lower()
        subscription = business.product_subscriptions.filter(product_code=normalized_code).first()
        if not subscription or subscription.status not in ACTIVE_SUBSCRIPTION_STATUSES:
            raise ValidationError({"product_code": "Subscribe to this product before updating add-ons."})
        if subscription.status == BusinessProductSubscriptionStatus.SOFT_LOCKED:
            raise ValidationError({"status": "Upgrade your plan before changing add-ons."})

        next_pets = (
            bool(pets_pack_enabled)
            if pets_pack_enabled is not None
            else bool(getattr(subscription, "pets_pack_enabled", False))
        )
        if next_pets and normalized_code != "shopie":
            raise ValidationError({"pets_pack_enabled": "Pets pack is only available with ShopIE."})

        # Reducing add-ons must still fit current usage.
        self.entitlements.ensure_can_downgrade(
            business=business,
            target_plan_code=subscription.plan.code if subscription.plan else "appointie-starter",
            product_code=normalized_code,
            extra_staff=extra_staff,
            extra_offices=extra_offices,
        )
        subscription.extra_staff = extra_staff
        subscription.extra_offices = extra_offices
        subscription.pets_pack_enabled = next_pets
        subscription.save(
            update_fields=["extra_staff", "extra_offices", "pets_pack_enabled", "updated_at"]
        )

        if normalized_code == "shopie":
            from apps.shopie.models import VerticalPack
            from apps.shopie.services.pets import PetsService

            PetsService().set_pack_enabled(
                tenant=business.tenant,
                business=business,
                pack=VerticalPack.PETS,
                enabled=next_pets,
            )

        if getattr(actor, "is_authenticated", False):
            business.mark_updated(actor_id=actor.id)
            business.save(update_fields=["updated_at", "updated_by"])
        logger.info(
            "Business product addons updated",
            extra={
                "business_id": str(business.id),
                "product_code": normalized_code,
                "extra_staff": extra_staff,
                "extra_offices": extra_offices,
                "pets_pack_enabled": next_pets,
            },
        )
        return subscription
    def billing_snapshot(self, *, business: Business, product_code: str | None = None) -> dict[str, Any]:
        code = (product_code or business.selected_product or "appointie").strip().lower()
        return self.entitlements.billing_snapshot(business=business, product_code=code)
