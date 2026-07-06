from __future__ import annotations

from django.db import models


def lock_for_update(queryset: models.QuerySet) -> models.QuerySet:
    return queryset.select_for_update()


def tenant_filter(tenant_id: object) -> dict[str, object]:
    return {"tenant_id": tenant_id}
