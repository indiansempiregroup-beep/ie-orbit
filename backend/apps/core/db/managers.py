from __future__ import annotations

import uuid

from django.db import models
from django.utils import timezone


class SoftDeleteQuerySet(models.QuerySet):
    def active(self) -> SoftDeleteQuerySet:
        return self.filter(deleted_at__isnull=True, is_active=True)

    def deleted(self) -> SoftDeleteQuerySet:
        return self.filter(deleted_at__isnull=False)

    def soft_delete(self, *, deleted_by: uuid.UUID | str | None = None) -> int:
        now = timezone.now()
        user_id = _normalize_actor_id(deleted_by)
        return self.active().update(
            deleted_at=now,
            deleted_by=user_id,
            is_active=False,
            updated_at=now,
        )

    def restore(self, *, restored_by: uuid.UUID | str | None = None) -> int:
        now = timezone.now()
        user_id = _normalize_actor_id(restored_by)
        return self.deleted().update(
            deleted_at=None,
            deleted_by=None,
            updated_by=user_id,
            is_active=True,
            updated_at=now,
        )

    def permanent_delete(self) -> tuple[int, dict[str, int]]:
        return super().delete()

    def delete(self) -> tuple[int, dict[str, int]]:
        count = self.soft_delete()
        return count, {}


class AllObjectsManager(models.Manager.from_queryset(SoftDeleteQuerySet)):
    pass


class ActiveManager(AllObjectsManager):
    def get_queryset(self) -> SoftDeleteQuerySet:
        return super().get_queryset().active()


class DeletedManager(AllObjectsManager):
    def get_queryset(self) -> SoftDeleteQuerySet:
        return super().get_queryset().deleted()


class SoftDeleteManager(ActiveManager):
    pass


def _normalize_actor_id(actor_id: uuid.UUID | str | None) -> uuid.UUID | None:
    if actor_id is None or isinstance(actor_id, uuid.UUID):
        return actor_id
    return uuid.UUID(str(actor_id))
