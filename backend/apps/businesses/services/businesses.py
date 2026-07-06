from __future__ import annotations

import logging
from typing import Any

from django.db import transaction

from apps.businesses.models import Business, BusinessProfile, BusinessSettings
from apps.businesses.repositories import BusinessRepository

logger = logging.getLogger("ie_platform.businesses")


class BusinessService:
    def __init__(self, repository: BusinessRepository | None = None) -> None:
        self.repository = repository or BusinessRepository()

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
        logger.info(
            "Business created",
            extra={"tenant_id": str(tenant.id), "business_id": str(business.id)},
        )
        return business

    @transaction.atomic
    def update_business(self, *, business: Business, data: dict[str, Any], actor: Any) -> Business:
        profile_data = data.pop("profile", None)
        settings_data = data.pop("settings", None)
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
