from __future__ import annotations

from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import ShopBusinessSettings, ShopPet, VerticalPack
from apps.tenancy.models import Tenant


class PetsService:
    def ensure_settings(self, *, tenant: Tenant, business: Business) -> ShopBusinessSettings:
        settings, _ = ShopBusinessSettings.objects.get_or_create(
            tenant=tenant,
            business=business,
            defaults={"enabled_packs": []},
        )
        return settings

    def set_pack_enabled(
        self,
        *,
        tenant: Tenant,
        business: Business,
        pack: str,
        enabled: bool,
    ) -> ShopBusinessSettings:
        settings = self.ensure_settings(tenant=tenant, business=business)
        packs = list(settings.enabled_packs or [])
        if enabled and pack not in packs:
            packs.append(pack)
        if not enabled and pack in packs:
            packs = [p for p in packs if p != pack]
        settings.enabled_packs = packs
        settings.save(update_fields=["enabled_packs", "updated_at", "version"])
        return settings

    def require_pets_pack(self, *, tenant: Tenant, business: Business) -> None:
        settings = self.ensure_settings(tenant=tenant, business=business)
        if not settings.pets_enabled():
            raise ValidationError({"pack": "Pets pack is not enabled for this business."})

    def list_pets(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer_id: UUID | None = None,
    ):
        self.require_pets_pack(tenant=tenant, business=business)
        qs = ShopPet.objects.filter(tenant=tenant, business=business).select_related("customer")
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return qs.order_by("name")

    def create_pet(
        self,
        *,
        tenant: Tenant,
        business: Business,
        customer: Customer,
        data: dict[str, Any],
    ) -> ShopPet:
        self.require_pets_pack(tenant=tenant, business=business)
        name = str(data.get("name") or "").strip()
        if not name:
            raise ValidationError({"name": "Pet name is required."})
        return ShopPet.objects.create(
            tenant=tenant,
            business=business,
            customer=customer,
            name=name,
            species=str(data.get("species") or "").strip(),
            breed=str(data.get("breed") or "").strip(),
            sex=str(data.get("sex") or "").strip(),
            birthday=data.get("birthday"),
            medical_notes=str(data.get("medical_notes") or "").strip(),
            medical_records=list(data.get("medical_records") or []),
            metadata=data.get("metadata") or {},
        )

    def update_pet(self, *, pet: ShopPet, data: dict[str, Any]) -> ShopPet:
        self.require_pets_pack(tenant=pet.tenant, business=pet.business)
        for field in ("name", "species", "breed", "sex", "medical_notes"):
            if field in data and data[field] is not None:
                setattr(pet, field, str(data[field]).strip())
        if "birthday" in data:
            pet.birthday = data["birthday"]
        if "medical_records" in data and data["medical_records"] is not None:
            pet.medical_records = data["medical_records"]
        if "metadata" in data and data["metadata"] is not None:
            pet.metadata = data["metadata"]
        pet.save()
        return pet

    def enable_pets_pack(self, *, tenant: Tenant, business: Business) -> ShopBusinessSettings:
        return self.set_pack_enabled(
            tenant=tenant, business=business, pack=VerticalPack.PETS, enabled=True
        )
