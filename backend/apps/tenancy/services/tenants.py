from __future__ import annotations

import logging
from typing import Any

from django.db import transaction

from apps.tenancy.models import Tenant
from apps.tenancy.repositories import TenantRepository

logger = logging.getLogger("ie_platform.tenancy")


class TenantService:
    def __init__(self, repository: TenantRepository | None = None) -> None:
        self.repository = repository or TenantRepository()

    @transaction.atomic
    def create_tenant(self, *, data: dict[str, Any], actor: Any) -> Tenant:
        owner = data.pop("owner", None) or actor
        tenant = Tenant(**data, owner=owner)
        if getattr(actor, "is_authenticated", False):
            tenant.mark_created(actor_id=actor.id)
        tenant.save()
        self.repository.ensure_foundation_records(tenant)
        logger.info(
            "Tenant created",
            extra={"tenant_id": str(tenant.id), "tenant_slug": tenant.slug},
        )
        return tenant

    @transaction.atomic
    def update_tenant(self, *, tenant: Tenant, data: dict[str, Any], actor: Any) -> Tenant:
        for field, value in data.items():
            setattr(tenant, field, value)
        if getattr(actor, "is_authenticated", False):
            tenant.mark_updated(actor_id=actor.id)
        tenant.save()
        logger.info("Tenant updated", extra={"tenant_id": str(tenant.id)})
        return tenant

    @transaction.atomic
    def delete_tenant(self, *, tenant: Tenant, actor: Any) -> None:
        deleted_by = (
            getattr(actor, "id", None) if getattr(actor, "is_authenticated", False) else None
        )
        tenant.soft_delete(deleted_by=deleted_by)
        logger.info("Tenant soft deleted", extra={"tenant_id": str(tenant.id)})
