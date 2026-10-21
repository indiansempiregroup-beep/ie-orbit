"""Fire automations from domain events without failing the caller."""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction

logger = logging.getLogger("ie_orbit.workflow")


def emit_domain_on_commit(
    *,
    tenant,
    business,
    event_key: str,
    context: dict[str, Any] | None = None,
    product_code: str | None = None,
    subject_type: str = "",
    subject_id: str = "",
    idempotency_prefix: str = "",
) -> None:
    """Schedule a workflow emit after the current transaction commits."""
    payload = {
        "tenant": tenant,
        "business": business,
        "event_key": event_key,
        "context": dict(context or {}),
        "product_code": product_code,
        "subject_type": subject_type,
        "subject_id": subject_id,
        "idempotency_prefix": idempotency_prefix,
    }

    def _run() -> None:
        try:
            from apps.workflow.services.events import emit

            emit(
                tenant=payload["tenant"],
                business=payload["business"],
                event_key=payload["event_key"],
                context=payload["context"],
                product_code=payload["product_code"],
                subject_type=payload["subject_type"],
                subject_id=payload["subject_id"],
                idempotency_prefix=payload["idempotency_prefix"],
            )
        except Exception:  # noqa: BLE001 — automations must not break checkout or stock
            logger.exception("workflow emit failed for %s", payload["event_key"])

    transaction.on_commit(_run)
