from __future__ import annotations

import logging
from typing import Any

from django.utils import timezone

from apps.audit.models import DomainEvent, DomainEventStatus
from apps.tenancy.models import Tenant

logger = logging.getLogger("ie_orbit.events")


def publish_domain_event(
    *,
    event_type: str,
    tenant_id: str | None,
    aggregate_type: str,
    aggregate_id: str,
    payload: dict[str, Any] | None = None,
) -> DomainEvent | None:
    if not tenant_id:
        logger.warning("domain_event.skipped_missing_tenant", extra={"event_type": event_type})
        return None

    try:
        tenant = Tenant.objects.get(id=tenant_id)
    except Tenant.DoesNotExist:
        logger.warning(
            "domain_event.skipped_unknown_tenant",
            extra={"event_type": event_type, "tenant_id": tenant_id},
        )
        return None

    event = DomainEvent.objects.create(
        tenant=tenant,
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload=payload or {},
        status=DomainEventStatus.PENDING,
    )
    event.status = DomainEventStatus.PUBLISHED
    event.published_at = timezone.now()
    event.save(update_fields=["status", "published_at", "updated_at"])
    logger.info(
        "domain_event.published",
        extra={
            "event_type": event_type,
            "aggregate_type": aggregate_type,
            "aggregate_id": aggregate_id,
            "tenant_id": tenant_id,
        },
    )
    return event
