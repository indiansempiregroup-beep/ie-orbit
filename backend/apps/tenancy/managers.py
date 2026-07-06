from __future__ import annotations

import uuid
from typing import Any

from apps.core.db.managers import ActiveManager, SoftDeleteQuerySet


class TenantAwareQuerySet(SoftDeleteQuerySet):
    def for_tenant(self, tenant: Any) -> TenantAwareQuerySet:
        tenant_id = getattr(tenant, "id", tenant)
        return self.filter(tenant_id=tenant_id)

    def require_tenant(self, tenant: Any) -> TenantAwareQuerySet:
        if tenant is None:
            raise ValueError("Tenant context is required for tenant-scoped queries.")
        return self.for_tenant(tenant)

    def visible_to_user(self, user: Any) -> TenantAwareQuerySet:
        if not user or not getattr(user, "is_authenticated", False):
            return self.none()
        if getattr(user, "is_superuser", False):
            return self
        return self.filter(tenant__owner=user)


class TenantAwareManager(ActiveManager.from_queryset(TenantAwareQuerySet)):
    def for_tenant(self, tenant: Any) -> TenantAwareQuerySet:
        return self.get_queryset().for_tenant(tenant)

    def require_tenant(self, tenant: Any) -> TenantAwareQuerySet:
        return self.get_queryset().require_tenant(tenant)

    def visible_to_user(self, user: Any) -> TenantAwareQuerySet:
        return self.get_queryset().visible_to_user(user)


def normalize_tenant_id(value: uuid.UUID | str | None) -> uuid.UUID | None:
    if value is None or isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))
