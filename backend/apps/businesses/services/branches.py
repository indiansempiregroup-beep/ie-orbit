from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError

from apps.businesses.models import Branch, Business
from apps.businesses.repositories.branches import BranchRepository

logger = logging.getLogger("ie_platform.businesses")


class BranchService:
    def __init__(self, repository: BranchRepository | None = None) -> None:
        self.repository = repository or BranchRepository()

    def list_branches(self, *, tenant: Any, business: Business) -> Any:
        return self.repository.list_for_business(tenant=tenant, business_id=str(business.id))

    @transaction.atomic
    def create_branch(self, *, business: Business, data: dict[str, Any], actor: Any) -> Branch:
        branch_code = data.get("branch_code") or slugify(data.get("branch_name", ""))[:50]
        if not branch_code:
            raise ValidationError({"branch_code": "Branch code is required."})
        branch = Branch(
            tenant=business.tenant,
            business=business,
            branch_code=branch_code,
            branch_name=data["branch_name"],
            display_name=data.get("display_name") or data["branch_name"],
            is_primary=bool(data.get("is_primary", False)),
            email=data.get("email", ""),
            phone_number=data.get("phone_number", ""),
            address_line1=data.get("address_line1", ""),
            address_line2=data.get("address_line2", ""),
            city=data.get("city", ""),
            state=data.get("state", ""),
            country=data.get("country", ""),
            postal_code=data.get("postal_code", ""),
            timezone=data.get("timezone", business.timezone),
            status=data.get("status", "active"),
        )
        if getattr(actor, "is_authenticated", False):
            branch.mark_created(actor_id=actor.id)
        if branch.is_primary:
            Branch.objects.filter(business=business, is_primary=True).update(is_primary=False)
        branch.full_clean()
        branch.save()
        logger.info("Branch created", extra={"business_id": str(business.id), "branch_id": str(branch.id)})
        return branch

    @transaction.atomic
    def update_branch(self, *, branch: Branch, data: dict[str, Any], actor: Any) -> Branch:
        for field, value in data.items():
            if field == "branch_code":
                continue
            setattr(branch, field, value)
        if data.get("is_primary"):
            Branch.objects.filter(business=branch.business, is_primary=True).exclude(id=branch.id).update(
                is_primary=False
            )
            branch.is_primary = True
        if getattr(actor, "is_authenticated", False):
            branch.mark_updated(actor_id=actor.id)
        branch.full_clean()
        branch.save()
        return branch
