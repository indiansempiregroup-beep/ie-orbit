from __future__ import annotations

from django.db import models

from apps.core.db.managers import (
    ActiveManager,
    AllObjectsManager,
    DeletedManager,
    SoftDeleteManager,
)
from apps.core.db.mixins import (
    AuditMixin,
    SoftDeleteMixin,
    TenantMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    VersionMixin,
)


class BaseModel(
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    AuditMixin,
    SoftDeleteMixin,
    VersionMixin,
):
    objects = SoftDeleteManager()
    active_objects = ActiveManager()
    deleted_objects = DeletedManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True
        indexes = [
            models.Index(fields=["is_active", "deleted_at"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["updated_at"]),
        ]


class TenantModel(TenantMixin, BaseModel):
    class Meta:
        abstract = True
        indexes = [
            models.Index(fields=["is_active", "deleted_at"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["updated_at"]),
            models.Index(fields=["tenant", "is_active", "deleted_at"]),
            models.Index(fields=["tenant", "created_at"]),
        ]


class AuditModel(BaseModel):
    class Meta:
        abstract = True
