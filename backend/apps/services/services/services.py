from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.platform_media.models import Media
from apps.services.models import Service, ServiceCategory, ServiceDuration, ServiceImage, ServicePricing
from apps.services.repositories import ServiceRepository

logger = logging.getLogger("ie_orbit.services")


class ServiceCatalogService:
    def __init__(self, repository: ServiceRepository | None = None) -> None:
        self.repository = repository or ServiceRepository()

    @transaction.atomic
    def create_category(self, *, data: dict[str, Any], tenant: Any, actor: Any) -> ServiceCategory:
        category = ServiceCategory(tenant=tenant, **data)
        if getattr(actor, "is_authenticated", False):
            category.mark_created(actor_id=actor.id)
        self._validate_business_tenant(category)
        category.full_clean()
        category.save()
        return category

    @transaction.atomic
    def update_category(
        self,
        *,
        category: ServiceCategory,
        data: dict[str, Any],
        actor: Any,
    ) -> ServiceCategory:
        for field, value in data.items():
            setattr(category, field, value)
        if getattr(actor, "is_authenticated", False):
            category.mark_updated(actor_id=actor.id)
        self._validate_business_tenant(category)
        category.full_clean()
        category.save()
        return category

    @transaction.atomic
    def create_service(self, *, data: dict[str, Any], tenant: Any, actor: Any) -> Service:
        duration_data = data.pop("default_duration", None)
        pricing_data = data.pop("default_price", None)
        image_data = data.pop("primary_image", None)
        service = Service(tenant=tenant, **data)
        if getattr(actor, "is_authenticated", False):
            service.mark_created(actor_id=actor.id)
        self._validate_business_tenant(service)
        service.full_clean()
        service.save()
        self.ensure_foundation_records(service)
        if isinstance(duration_data, dict):
            self.update_duration(service=service, data=duration_data)
        if isinstance(pricing_data, dict):
            self.update_pricing(service=service, data=pricing_data)
        if isinstance(image_data, dict):
            self.upsert_primary_image(service=service, data=image_data)
        logger.info("Service created", extra={"service_id": str(service.id)})
        return service

    @transaction.atomic
    def update_service(self, *, service: Service, data: dict[str, Any], actor: Any) -> Service:
        duration_data = data.pop("default_duration", None)
        pricing_data = data.pop("default_price", None)
        image_data = data.pop("primary_image", None)
        for field, value in data.items():
            setattr(service, field, value)
        if getattr(actor, "is_authenticated", False):
            service.mark_updated(actor_id=actor.id)
        self._validate_business_tenant(service)
        service.full_clean()
        service.save()
        if isinstance(duration_data, dict):
            self.update_duration(service=service, data=duration_data)
        if isinstance(pricing_data, dict):
            self.update_pricing(service=service, data=pricing_data)
        if isinstance(image_data, dict):
            self.upsert_primary_image(service=service, data=image_data)
        logger.info("Service updated", extra={"service_id": str(service.id)})
        return service

    def ensure_foundation_records(self, service: Service) -> None:
        ServiceDuration.objects.get_or_create(tenant=service.tenant, service=service)
        ServicePricing.objects.get_or_create(
            tenant=service.tenant,
            service=service,
            defaults={"currency": service.business.currency},
        )

    def update_duration(self, *, service: Service, data: dict[str, Any]) -> ServiceDuration:
        duration, _ = ServiceDuration.objects.get_or_create(
            tenant=service.tenant,
            service=service,
            variant=data.pop("variant", None),
        )
        for field, value in data.items():
            setattr(duration, field, value)
        duration.full_clean()
        duration.save()
        return duration

    def update_pricing(self, *, service: Service, data: dict[str, Any]) -> ServicePricing:
        price, _ = ServicePricing.objects.get_or_create(
            tenant=service.tenant,
            service=service,
            variant=data.pop("variant", None),
            defaults={"currency": service.business.currency},
        )
        for field, value in data.items():
            setattr(price, field, value)
        price.full_clean()
        price.save()
        return price

    def upsert_primary_image(self, *, service: Service, data: dict[str, Any]) -> ServiceImage | None:
        if data.get("clear"):
            service.images.filter(is_primary=True).delete()
            return None

        media_id = data.get("media_id") or data.get("media")
        if not media_id:
            return None

        media = (
            Media.objects.require_tenant(service.tenant)
            .filter(id=media_id, business=service.business)
            .first()
        )
        if media is None:
            raise ValidationError({"primary_image": "Media asset not found for this business."})

        image, _ = ServiceImage.objects.update_or_create(
            tenant=service.tenant,
            service=service,
            is_primary=True,
            defaults={
                "media": media,
                "alt_text": str(data.get("alt_text") or service.display_name or service.name),
                "display_order": 0,
            },
        )
        service.images.exclude(id=image.id).update(is_primary=False)
        return image

    def _validate_business_tenant(self, obj: Any) -> None:
        if obj.business.tenant_id != obj.tenant_id:
            raise ValidationError("Business does not belong to the current tenant.")
        category = getattr(obj, "category", None)
        if category and category.tenant_id != obj.tenant_id:
            raise ValidationError("Category does not belong to the current tenant.")


from apps.common.utils.business_context import resolve_business_id


class ServiceSearchService:
    def __init__(self, repository: ServiceRepository | None = None) -> None:
        self.repository = repository or ServiceRepository()

    def search(self, *, tenant: Any, user: Any, params: Any, request: Any | None = None):
        tags = [tag.strip().lower() for tag in params.get("tags", "").split(",") if tag.strip()]
        return self.repository.search(
            tenant=tenant,
            user=user,
            query=params.get("q", ""),
            business_id=resolve_business_id(request, params) if request is not None else params.get("business", ""),
            category_id=params.get("category", ""),
            status_value=params.get("status", ""),
            visibility=params.get("visibility", ""),
            tags=tags,
        )
