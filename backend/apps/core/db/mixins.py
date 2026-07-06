from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.core.db.uuid import generate_uuid

AuditAction = Literal["create", "update", "delete", "restore"]


@dataclass(frozen=True)
class AuditEvent:
    action: AuditAction
    object_id: uuid.UUID
    actor_id: uuid.UUID | None
    occurred_at: object


class TimestampMixin(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        abstract = True


class AuditMixin(models.Model):
    created_by = models.UUIDField(null=True, blank=True, editable=False)
    updated_by = models.UUIDField(null=True, blank=True, editable=False)
    deleted_by = models.UUIDField(null=True, blank=True, editable=False)

    class Meta:
        abstract = True

    def mark_created(self, *, actor_id: uuid.UUID | str | None = None) -> AuditEvent:
        normalized_actor_id = self._normalize_actor_id(actor_id)
        self.created_by = normalized_actor_id
        self.updated_by = normalized_actor_id
        return self._build_audit_event("create", normalized_actor_id)

    def mark_updated(self, *, actor_id: uuid.UUID | str | None = None) -> AuditEvent:
        normalized_actor_id = self._normalize_actor_id(actor_id)
        self.updated_by = normalized_actor_id
        return self._build_audit_event("update", normalized_actor_id)

    def mark_deleted(self, *, actor_id: uuid.UUID | str | None = None) -> AuditEvent:
        normalized_actor_id = self._normalize_actor_id(actor_id)
        self.deleted_by = normalized_actor_id
        self.updated_by = normalized_actor_id
        return self._build_audit_event("delete", normalized_actor_id)

    def mark_restored(self, *, actor_id: uuid.UUID | str | None = None) -> AuditEvent:
        normalized_actor_id = self._normalize_actor_id(actor_id)
        self.deleted_by = None
        self.updated_by = normalized_actor_id
        return self._build_audit_event("restore", normalized_actor_id)

    def _build_audit_event(self, action: AuditAction, actor_id: uuid.UUID | None) -> AuditEvent:
        return AuditEvent(
            action=action,
            object_id=self.id,
            actor_id=actor_id,
            occurred_at=timezone.now(),
        )

    def _normalize_actor_id(self, actor_id: uuid.UUID | str | None) -> uuid.UUID | None:
        if actor_id is None or isinstance(actor_id, uuid.UUID):
            return actor_id
        return uuid.UUID(str(actor_id))


class SoftDeleteMixin(models.Model):
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        abstract = True

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self, *, deleted_by: uuid.UUID | str | None = None) -> None:
        now = timezone.now()
        self.deleted_at = now
        self.is_active = False
        if hasattr(self, "mark_deleted"):
            self.mark_deleted(actor_id=deleted_by)
        self.save(update_fields=self._soft_delete_update_fields())

    def restore(self, *, restored_by: uuid.UUID | str | None = None) -> None:
        self.deleted_at = None
        self.is_active = True
        if hasattr(self, "mark_restored"):
            self.mark_restored(actor_id=restored_by)
        self.save(update_fields=self._restore_update_fields())

    def permanent_delete(self, *args: object, **kwargs: object) -> tuple[int, dict[str, int]]:
        return super().delete(*args, **kwargs)

    def delete(self, *args: object, **kwargs: object) -> tuple[int, dict[str, int]]:
        deleted_by = kwargs.pop("deleted_by", None)
        self.soft_delete(deleted_by=deleted_by)
        return 1, {self._meta.label: 1}

    def _soft_delete_update_fields(self) -> list[str]:
        return self._existing_field_names(
            ["deleted_at", "deleted_by", "updated_by", "updated_at", "is_active", "version"]
        )

    def _restore_update_fields(self) -> list[str]:
        return self._existing_field_names(
            ["deleted_at", "deleted_by", "updated_by", "updated_at", "is_active", "version"]
        )

    def _existing_field_names(self, field_names: list[str]) -> list[str]:
        model_field_names = {field.name for field in self._meta.fields}
        return [field_name for field_name in field_names if field_name in model_field_names]


class VersionMixin(models.Model):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True

    def increment_version(self) -> None:
        self.version += 1

    def save(self, *args: object, **kwargs: object) -> None:
        if self.pk:
            self.increment_version()
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = set(update_fields) | {"version"}
        super().save(*args, **kwargs)


class TenantMixin(models.Model):
    tenant = models.ForeignKey(
        "tenancy.Tenant",
        on_delete=models.PROTECT,
        related_name="%(app_label)s_%(class)s_records",
    )

    class Meta:
        abstract = True

    def clean(self) -> None:
        super().clean()
        if not self.tenant_id:
            raise ValidationError({"tenant": "Tenant is required."})


class UUIDPrimaryKeyMixin(models.Model):
    id = models.UUIDField(primary_key=True, default=generate_uuid, editable=False)

    class Meta:
        abstract = True
