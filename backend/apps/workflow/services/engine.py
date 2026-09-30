from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from django.db import IntegrityError, transaction

from apps.businesses.models import Business
from apps.tenancy.models import Tenant
from apps.workflow.models import (
    WorkflowDefinition,
    WorkflowRun,
    WorkflowRunStatus,
    WorkflowStatus,
)
from apps.workflow.services.access import has_automations
from apps.workflow.services.registry import get_action, get_condition
from apps.workflow.services.schema import flatten_step_params

logger = logging.getLogger("ie_orbit.workflow")


class WorkflowEngine:
    def list_active(
        self,
        *,
        tenant: Tenant,
        business: Business,
        trigger_type: str | None = None,
        product_code: str | None = None,
    ) -> list[WorkflowDefinition]:
        qs = WorkflowDefinition.objects.filter(
            tenant=tenant,
            business=business,
            status=WorkflowStatus.ACTIVE,
            is_active=True,
        )
        if product_code:
            qs = qs.filter(product_code=product_code)
        rows = list(qs.order_by("created_at"))
        if trigger_type:
            rows = [
                row
                for row in rows
                if str((row.trigger or {}).get("type") or "") == trigger_type
            ]
        return rows

    def evaluate_conditions(
        self, *, definition: WorkflowDefinition, context: dict[str, Any]
    ) -> bool:
        conditions = definition.conditions or []
        if not conditions:
            return True
        for raw in conditions:
            if not isinstance(raw, dict):
                return False
            step = flatten_step_params(raw)
            ctype = str(step.get("type") or "").strip()
            handler = get_condition(ctype)
            if handler is None:
                return False
            params = {k: v for k, v in step.items() if k != "type"}
            if not handler(params, context):
                return False
        return True

    # Safe to evaluate during quote/preview — no emails, pushes, or DB coupon writes.
    _DRY_RUN_ACTIONS = frozenset({"discount.offer", "offer.staff_hint"})

    def run_actions(
        self, *, definition: WorkflowDefinition, context: dict[str, Any]
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        dry_run = bool(context.get("dry_run"))
        for raw in definition.actions or []:
            if not isinstance(raw, dict):
                continue
            step = flatten_step_params(raw)
            atype = str(step.get("type") or "").strip()
            if dry_run and atype not in self._DRY_RUN_ACTIONS:
                results.append({"type": atype, "ok": True, "skipped": True, "reason": "dry_run"})
                continue
            handler = get_action(atype)
            if handler is None:
                results.append({"type": atype, "ok": False, "reason": "unknown_action"})
                continue
            params = {k: v for k, v in step.items() if k != "type"}
            try:
                result = handler(params, context) or {}
            except Exception as exc:  # noqa: BLE001
                logger.exception("workflow action failed: %s", atype)
                result = {"ok": False, "reason": str(exc)}
            results.append({"type": atype, **result})
        return results

    @transaction.atomic
    def execute(
        self,
        *,
        tenant: Tenant,
        business: Business,
        definition: WorkflowDefinition,
        trigger_key: str,
        context: dict[str, Any] | None = None,
        subject_type: str = "",
        subject_id: str = "",
        idempotency_key: str = "",
        dry_run: bool = False,
    ) -> dict[str, Any]:
        ctx: dict[str, Any] = {
            "tenant": tenant,
            "business": business,
            "trigger_key": trigger_key,
            "workflow_id": str(definition.id),
            "workflow_name": definition.name,
            "offers": [],
            "staff_hints": [],
            **(context or {}),
            "dry_run": bool(dry_run),
        }
        if not self.evaluate_conditions(definition=definition, context=ctx):
            return {
                "matched": False,
                "run_id": None,
                "result": {"skipped": True, "reason": "conditions_not_met"},
                "offers": [],
                "staff_hints": [],
            }

        if dry_run:
            action_results = self.run_actions(definition=definition, context=ctx)
            return {
                "matched": True,
                "run_id": None,
                "result": {"dry_run": True, "actions": action_results},
                "offers": list(ctx.get("offers") or []),
                "staff_hints": list(ctx.get("staff_hints") or []),
            }

        if idempotency_key:
            existing = WorkflowRun.objects.filter(
                tenant=tenant,
                business=business,
                idempotency_key=idempotency_key,
            ).first()
            if existing is not None:
                return {
                    "matched": True,
                    "run_id": str(existing.id),
                    "result": existing.result,
                    "offers": list((existing.result or {}).get("offers") or []),
                    "staff_hints": list((existing.result or {}).get("staff_hints") or []),
                    "idempotent": True,
                }

        action_results = self.run_actions(definition=definition, context=ctx)
        payload = {
            "actions": action_results,
            "offers": list(ctx.get("offers") or []),
            "staff_hints": list(ctx.get("staff_hints") or []),
        }
        failed = any(not item.get("ok", True) for item in action_results)
        try:
            run = WorkflowRun.objects.create(
                tenant=tenant,
                business=business,
                definition=definition,
                trigger_key=trigger_key,
                subject_type=subject_type or "",
                subject_id=str(subject_id or ""),
                status=WorkflowRunStatus.FAILED if failed else WorkflowRunStatus.SUCCEEDED,
                idempotency_key=idempotency_key or "",
                context={
                    k: (v.isoformat() if hasattr(v, "isoformat") else v)
                    for k, v in (context or {}).items()
                    if k not in {"tenant", "business", "customer", "pet", "pets"}
                    and not callable(v)
                },
                result=payload,
                error="" if not failed else "One or more actions reported failure.",
            )
        except IntegrityError:
            existing = WorkflowRun.objects.filter(
                tenant=tenant,
                business=business,
                idempotency_key=idempotency_key,
            ).first()
            if existing:
                return {
                    "matched": True,
                    "run_id": str(existing.id),
                    "result": existing.result,
                    "offers": list((existing.result or {}).get("offers") or []),
                    "staff_hints": list((existing.result or {}).get("staff_hints") or []),
                    "idempotent": True,
                }
            raise
        return {
            "matched": True,
            "run_id": str(run.id),
            "result": payload,
            "offers": payload["offers"],
            "staff_hints": payload["staff_hints"],
        }

    def match_and_run(
        self,
        *,
        tenant: Tenant,
        business: Business,
        trigger_type: str,
        context: dict[str, Any] | None = None,
        product_code: str | None = None,
        subject_type: str = "",
        subject_id: str = "",
        idempotency_prefix: str = "",
        dry_run: bool = False,
    ) -> dict[str, Any]:
        if not has_automations(business=business):
            return {"entitled": False, "runs": [], "offers": [], "staff_hints": []}
        definitions = self.list_active(
            tenant=tenant,
            business=business,
            trigger_type=trigger_type,
            product_code=product_code,
        )
        runs: list[dict[str, Any]] = []
        offers: list[dict[str, Any]] = []
        hints: list[dict[str, Any]] = []
        for definition in definitions:
            key = ""
            if idempotency_prefix:
                key = f"{idempotency_prefix}:{definition.id}"
            outcome = self.execute(
                tenant=tenant,
                business=business,
                definition=definition,
                trigger_key=trigger_type,
                context=context,
                subject_type=subject_type,
                subject_id=subject_id,
                idempotency_key=key,
                dry_run=dry_run,
            )
            if outcome.get("matched"):
                runs.append(outcome)
                offers.extend(outcome.get("offers") or [])
                hints.extend(outcome.get("staff_hints") or [])
        return {"entitled": True, "runs": runs, "offers": offers, "staff_hints": hints}
