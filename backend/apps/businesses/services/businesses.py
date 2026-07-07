from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.businesses.constants import VALID_PRODUCT_CODES
from apps.businesses.models import (
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
    BusinessProfile,
    BusinessSettings,
)
from apps.businesses.repositories import BusinessRepository
from apps.businesses.services.product_billing import ProductBillingService

logger = logging.getLogger("ie_platform.businesses")

ACTIVE_SUBSCRIPTION_STATUSES = {
    BusinessProductSubscriptionStatus.TRIALING,
    BusinessProductSubscriptionStatus.ACTIVE,
}


class BusinessService:
    def __init__(
        self,
        repository: BusinessRepository | None = None,
        billing_service: ProductBillingService | None = None,
    ) -> None:
        self.repository = repository or BusinessRepository()
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
        if business.selected_product:
            self.subscribe_to_product(
                business=business,
                product_code=business.selected_product,
                actor=actor,
                set_active=True,
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
        settings, _ = BusinessSettings.objects.get_or_create(
            tenant=business.tenant,
            business=business,
        )
        for field, value in data.items():
            setattr(settings, field, value)
        settings.full_clean()
        settings.save()
        return settings

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
    ) -> BusinessProductSubscription:
        normalized_code = product_code.strip().lower()
        subscription = business.product_subscriptions.filter(product_code=normalized_code).first()
        if not subscription or subscription.status not in ACTIVE_SUBSCRIPTION_STATUSES:
            raise ValidationError({"product_code": "Subscribe to this product before changing its plan."})

        previous_plan_code = subscription.plan.code if subscription.plan else None
        plan, plan_definition = self.billing_service.resolve_subscription_plan(
            product_code=normalized_code,
            plan_code=plan_code,
        )
        self.billing_service.apply_plan_to_subscription(
            subscription=subscription,
            plan=plan,
            plan_definition=plan_definition,
        )
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
            },
        )
        return subscription
