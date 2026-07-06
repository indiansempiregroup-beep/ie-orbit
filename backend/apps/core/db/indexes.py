from __future__ import annotations

from django.db import models


def tenant_lookup_index(*fields: str, name: str | None = None) -> models.Index:
    return models.Index(fields=["tenant", *fields], name=name)


def active_record_index(*, name: str | None = None) -> models.Index:
    return models.Index(fields=["is_active", "deleted_at"], name=name)


def audit_timestamp_index(*, name: str | None = None) -> models.Index:
    return models.Index(fields=["created_at", "updated_at"], name=name)
