from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError

from apps.businesses.constants import PRODUCT_SHOPIE
from apps.businesses.models import Branch, BranchStatus, Business
from apps.businesses.repositories.branches import BranchRepository
from apps.businesses.services.entitlements import EntitlementService

logger = logging.getLogger("ie_platform.businesses")


class BranchService:
    def __init__(
        self,
        repository: BranchRepository | None = None,
        entitlements: EntitlementService | None = None,
    ) -> None:
        self.repository = repository or BranchRepository()
        self.entitlements = entitlements or EntitlementService()

    @staticmethod
    def _sync_shop_stock_locations(*, business: Business) -> None:
        if business.selected_product != PRODUCT_SHOPIE:
            return
        # Keep the businesses app independent at import time while making office
        # creation and updates immediately visible to ShopIE inventory.
        from apps.shopie.services.godowns import GodownsService

        GodownsService().sync_office_godowns(
            tenant=business.tenant,
            business=business,
        )

    def list_branches(self, *, tenant: Any, business: Business) -> Any:
        return self.repository.list_for_business(tenant=tenant, business_id=str(business.id))

    def _validate_office_location(
        self,
        data: dict[str, Any],
        *,
        partial: bool = False,
        branch: Branch | None = None,
    ) -> None:
        address_line1 = data.get(
            "address_line1",
            getattr(branch, "address_line1", "") if branch else "",
        )
        city = data.get("city", getattr(branch, "city", "") if branch else "")
        country = data.get("country", getattr(branch, "country", "") if branch else "")
        latitude = data.get("latitude", getattr(branch, "latitude", None) if branch else None)
        longitude = data.get("longitude", getattr(branch, "longitude", None) if branch else None)
        errors: dict[str, str] = {}
        if not partial or "address_line1" in data or not address_line1:
            if not str(address_line1 or "").strip():
                errors["address_line1"] = "Office address is required."
        if not partial or "city" in data or not city:
            if not str(city or "").strip():
                errors["city"] = "City is required."
        if not partial or "country" in data or not country:
            if not str(country or "").strip():
                errors["country"] = "Country is required."
        if not partial or "latitude" in data or latitude is None:
            if latitude is None:
                errors["latitude"] = "Google Map latitude is required."
        if not partial or "longitude" in data or longitude is None:
            if longitude is None:
                errors["longitude"] = "Google Map longitude is required."
        if errors:
            raise ValidationError(errors)

    @transaction.atomic
    def create_branch(self, *, business: Business, data: dict[str, Any], actor: Any) -> Branch:
        self.entitlements.ensure_can_add_branch(business=business)
        self._validate_office_location(data, partial=False)
        branch_code = data.get("branch_code") or slugify(data.get("branch_name", ""))[:50]
        if not branch_code:
            raise ValidationError({"branch_code": "Branch code is required."})
        existing_count = Branch.objects.filter(business=business, is_active=True).count()
        is_primary = bool(data.get("is_primary", existing_count == 0))
        branch = Branch(
            tenant=business.tenant,
            business=business,
            branch_code=branch_code,
            branch_name=data["branch_name"],
            display_name=data.get("display_name") or data["branch_name"],
            is_primary=is_primary,
            email=data.get("email", ""),
            phone_number=data.get("phone_number", ""),
            address_line1=data.get("address_line1", ""),
            address_line2=data.get("address_line2", ""),
            city=data.get("city", ""),
            state=data.get("state", ""),
            country=data.get("country", ""),
            postal_code=data.get("postal_code", ""),
            latitude=data.get("latitude"),
            longitude=data.get("longitude"),
            timezone=data.get("timezone", business.timezone),
            status=data.get("status", "active"),
        )
        if getattr(actor, "is_authenticated", False):
            branch.mark_created(actor_id=actor.id)
        if branch.is_primary:
            Branch.objects.filter(business=business, is_primary=True).update(is_primary=False)
        branch.full_clean()
        branch.save()
        self._sync_shop_stock_locations(business=business)
        logger.info(
            "Branch created",
            extra={"business_id": str(business.id), "branch_id": str(branch.id)},
        )
        return branch

    @transaction.atomic
    def update_branch(self, *, branch: Branch, data: dict[str, Any], actor: Any) -> Branch:
        next_status = data.get("status", branch.status)
        becoming_inactive = (
            next_status in {BranchStatus.INACTIVE, BranchStatus.ARCHIVED}
            or data.get("is_active") is False
        )
        if becoming_inactive:
            active_count = Branch.objects.filter(
                business=branch.business,
                status=BranchStatus.ACTIVE,
                is_active=True,
            ).exclude(id=branch.id).count()
            if active_count == 0:
                raise ValidationError({"status": "At least one active office is required."})
        self._validate_office_location(data, partial=True, branch=branch)
        for field, value in data.items():
            if field == "branch_code":
                continue
            setattr(branch, field, value)
        if data.get("is_primary"):
            Branch.objects.filter(
                business=branch.business,
                is_primary=True,
            ).exclude(id=branch.id).update(is_primary=False)
            branch.is_primary = True
        if getattr(actor, "is_authenticated", False):
            branch.mark_updated(actor_id=actor.id)
        branch.full_clean()
        branch.save()
        self._sync_shop_stock_locations(business=branch.business)
        return branch
