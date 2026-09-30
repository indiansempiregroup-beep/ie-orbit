from __future__ import annotations

from typing import Any

from apps.businesses.models import Business
from apps.tenancy.models import Tenant
from apps.workflow.services.engine import WorkflowEngine


def emit(
    *,
    tenant: Tenant,
    business: Business,
    event_key: str,
    context: dict[str, Any] | None = None,
    product_code: str | None = None,
    subject_type: str = "",
    subject_id: str = "",
    idempotency_prefix: str = "",
    dry_run: bool = False,
) -> dict[str, Any]:
    """Domain entrypoint: run active workflows matching this trigger type."""
    return WorkflowEngine().match_and_run(
        tenant=tenant,
        business=business,
        trigger_type=event_key,
        context=context,
        product_code=product_code,
        subject_type=subject_type,
        subject_id=subject_id,
        idempotency_prefix=idempotency_prefix,
        dry_run=dry_run,
    )
