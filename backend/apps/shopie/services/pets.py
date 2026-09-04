from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import ShopBusinessSettings, ShopPet, VerticalPack
from apps.tenancy.models import Tenant

BIRTHDAY_REMINDER_LEAD_DAYS = 5
BIRTHDAY_REMINDER_META_KEY = "birthday_reminder_year"


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
        if not self.has_pets_entitlement(business=business):
            raise ValidationError(
                {
                    "pack": (
                        "Pets pack is not subscribed. "
                        "Subscribe for ₹500/month from Product settings."
                    )
                }
            )
        settings = self.ensure_settings(tenant=tenant, business=business)
        if not settings.pets_enabled():
            self.set_pack_enabled(
                tenant=tenant, business=business, pack=VerticalPack.PETS, enabled=True
            )

    def has_pets_entitlement(self, *, business: Business) -> bool:
        from apps.businesses.models import BusinessProductSubscriptionStatus

        subscription = business.product_subscriptions.filter(product_code="shopie").first()
        if subscription is None:
            return False
        if subscription.status not in {
            BusinessProductSubscriptionStatus.TRIALING,
            BusinessProductSubscriptionStatus.ACTIVE,
        }:
            return False
        return bool(getattr(subscription, "pets_pack_enabled", False))

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
            photo_url=str(data.get("photo_url") or "").strip(),
            medical_notes=str(data.get("medical_notes") or "").strip(),
            medical_records=list(data.get("medical_records") or []),
            metadata=data.get("metadata") or {},
        )

    def update_pet(self, *, pet: ShopPet, data: dict[str, Any]) -> ShopPet:
        self.require_pets_pack(tenant=pet.tenant, business=pet.business)
        for field in ("name", "species", "breed", "sex", "medical_notes", "photo_url"):
            if field in data and data[field] is not None:
                setattr(pet, field, str(data[field]).strip())
        if "birthday" in data:
            pet.birthday = data["birthday"]
        if "medical_records" in data and data["medical_records"] is not None:
            pet.medical_records = data["medical_records"]
        if "metadata" in data and data["metadata"] is not None:
            pet.metadata = data["metadata"]
        if "customer_id" in data and data["customer_id"]:
            customer = Customer.objects.filter(
                tenant=pet.tenant,
                business=pet.business,
                id=data["customer_id"],
            ).first()
            if customer is None:
                raise ValidationError({"customer_id": "Customer not found."})
            pet.customer = customer
        pet.save()
        return pet

    def enable_pets_pack(self, *, tenant: Tenant, business: Business) -> ShopBusinessSettings:
        return self.set_pack_enabled(
            tenant=tenant, business=business, pack=VerticalPack.PETS, enabled=True
        )

    def notify_owner(
        self,
        *,
        pet: ShopPet,
        subject: str,
        body: str,
        channels: list[str] | None = None,
        event_type: str = "PetOwnerMessage",
        headline: str = "",
        extra_html: str = "",
    ) -> dict[str, Any]:
        self.require_pets_pack(tenant=pet.tenant, business=pet.business)
        from apps.notifications.services.customer_direct import CustomerDirectNotifier

        return CustomerDirectNotifier().notify_customer(
            tenant=pet.tenant,
            business=pet.business,
            customer=pet.customer,
            subject=subject.strip(),
            body=body.strip(),
            channels=channels or ["in_app", "email"],
            event_type=event_type,
            metadata={"pet_id": str(pet.id), "pet_name": pet.name},
            headline=headline,
            extra_html=extra_html,
        )

    def notify_managers(
        self,
        *,
        pet: ShopPet,
        subject: str,
        body: str,
        event_type: str = "PetStaffAlert",
        headline: str = "",
        extra_html: str = "",
    ) -> dict[str, Any]:
        self.require_pets_pack(tenant=pet.tenant, business=pet.business)
        from apps.notifications.services.staff_direct import StaffDirectNotifier

        return StaffDirectNotifier().notify_managers(
            tenant=pet.tenant,
            business=pet.business,
            subject=subject.strip(),
            body=body.strip(),
            event_type=event_type,
            metadata={
                "pet_id": str(pet.id),
                "pet_name": pet.name,
                "customer_id": str(pet.customer_id),
                "deep_link": f"shop/pets/{pet.id}",
            },
            channels=["in_app", "email"],
            headline=headline,
            extra_html=extra_html,
        )

    def send_birthday_reminders(self, *, lead_days: int = BIRTHDAY_REMINDER_LEAD_DAYS) -> dict[str, int]:
        """Notify pet owners and business managers lead_days before the pet's birthday."""
        today = timezone.localdate()
        target = today + timedelta(days=lead_days)
        year_key = str(today.year)
        sent = 0
        skipped = 0

        candidates = (
            ShopPet.objects.filter(birthday__isnull=False, deleted_at__isnull=True)
            .select_related("customer", "business", "tenant")
            .iterator(chunk_size=100)
        )
        for pet in candidates:
            birthday: date | None = pet.birthday
            if birthday is None:
                skipped += 1
                continue
            if birthday.month != target.month or birthday.day != target.day:
                continue

            settings = self.ensure_settings(tenant=pet.tenant, business=pet.business)
            if not self.has_pets_entitlement(business=pet.business):
                skipped += 1
                continue
            if not settings.pets_enabled():
                skipped += 1
                continue

            metadata = dict(pet.metadata) if isinstance(pet.metadata, dict) else {}
            if str(metadata.get(BIRTHDAY_REMINDER_META_KEY) or "") == year_key:
                skipped += 1
                continue

            owner_name = (
                getattr(pet.customer, "display_name", None)
                or getattr(pet.customer, "first_name", None)
                or "there"
            )
            business_name = (
                getattr(pet.business, "display_name", None)
                or getattr(pet.business, "business_name", None)
                or "your business"
            )
            birthday_label = birthday.strftime("%d %b")
            from apps.notifications.services.providers.email import email_info_card

            owner_subject = f"{pet.name}'s birthday is coming up"
            owner_body = (
                f"Hi {owner_name},\n\n"
                f"{pet.name}'s birthday is on {birthday_label} "
                f"(in {lead_days} days). "
                f"We thought you'd like a gentle reminder from {business_name}."
            )
            owner_extra = email_info_card(
                title=f"{pet.name}'s birthday",
                lines=[birthday_label, f"In {lead_days} days"],
            )
            staff_subject = f"Pet birthday in {lead_days} days: {pet.name}"
            staff_body = (
                f"{pet.name}'s birthday is on {birthday_label} (in {lead_days} days). "
                f"Owner: {owner_name}. "
                f"Open the pet profile to send an extra reminder or offer if you want."
            )
            staff_extra = email_info_card(
                title=pet.name,
                lines=[f"Birthday: {birthday_label}", f"Owner: {owner_name}", f"In {lead_days} days"],
            )

            with transaction.atomic():
                locked = (
                    ShopPet.objects.select_for_update()
                    .filter(id=pet.id, deleted_at__isnull=True)
                    .select_related("customer", "business", "tenant")
                    .first()
                )
                if locked is None:
                    skipped += 1
                    continue
                locked_meta = dict(locked.metadata) if isinstance(locked.metadata, dict) else {}
                if str(locked_meta.get(BIRTHDAY_REMINDER_META_KEY) or "") == year_key:
                    skipped += 1
                    continue

                owner_result = self.notify_owner(
                    pet=locked,
                    subject=owner_subject,
                    body=owner_body,
                    channels=["in_app", "email"],
                    event_type="PetBirthdayReminder",
                    headline="Birthday coming up",
                    extra_html=owner_extra,
                )
                staff_result = self.notify_managers(
                    pet=locked,
                    subject=staff_subject,
                    body=staff_body,
                    event_type="PetBirthdayReminder",
                    headline="Pet birthday reminder",
                    extra_html=staff_extra,
                )
                if not owner_result.get("sent_channels") and not staff_result.get("sent_channels"):
                    skipped += 1
                    continue

                locked_meta[BIRTHDAY_REMINDER_META_KEY] = year_key
                locked.metadata = locked_meta
                locked.save(update_fields=["metadata", "updated_at"])
                sent += 1

        return {"sent": sent, "skipped": skipped}
