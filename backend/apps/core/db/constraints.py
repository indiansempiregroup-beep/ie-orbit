from __future__ import annotations

from django.db import models
from django.db.models import Q


def active_unique_constraint(*, fields: list[str], name: str) -> models.UniqueConstraint:
    return models.UniqueConstraint(
        fields=fields,
        condition=Q(deleted_at__isnull=True, is_active=True),
        name=name,
    )


def non_negative_check(*, field: str, name: str) -> models.CheckConstraint:
    return models.CheckConstraint(check=Q(**{f"{field}__gte": 0}), name=name)
