from __future__ import annotations

import logging
from typing import Any

from apps.audit.models import AuditLogEntry
from apps.tenancy.models import Tenant

logger = logging.getLogger("ie_orbit.audit")


def record_audit(
    *,
    tenant: Tenant | None,
    action: str,
    resource_type: str,
    resource_id: str = "",
    actor_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str = "",
    metadata: dict[str, Any] | None = None,
) -> AuditLogEntry | None:
    if tenant is None:
        logger.warning("audit.skipped_missing_tenant", extra={"action": action})
        return None

    entry = AuditLogEntry.objects.create(
        tenant=tenant,
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        user_agent=user_agent,
        metadata=metadata or {},
    )
    logger.info(
        "audit.recorded",
        extra={
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "tenant_id": str(tenant.id),
        },
    )
    return entry
