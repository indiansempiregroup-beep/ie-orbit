from __future__ import annotations

from typing import Any
from uuid import UUID

from django.contrib.auth.models import AbstractBaseUser
from rest_framework.exceptions import NotFound, ValidationError

from apps.businesses.models import Business
from apps.tenancy.models import Tenant
from apps.workflow.models import (
    WorkflowCreatedVia,
    WorkflowDefinition,
    WorkflowRun,
    WorkflowStatus,
)
from apps.workflow.services.schema import validate_workflow_payload


def serialize_definition(row: WorkflowDefinition) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "business": str(row.business_id),
        "name": row.name,
        "description": row.description,
        "product_code": row.product_code,
        "status": row.status,
        "trigger": row.trigger or {},
        "conditions": row.conditions or [],
        "actions": row.actions or [],
        "created_via": row.created_via,
        "source_prompt": row.source_prompt,
        "metadata": row.metadata or {},
        "is_active": row.is_active,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def serialize_run(row: WorkflowRun) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "business": str(row.business_id),
        "definition": str(row.definition_id),
        "trigger_key": row.trigger_key,
        "subject_type": row.subject_type,
        "subject_id": row.subject_id,
        "status": row.status,
        "result": row.result or {},
        "error": row.error,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


STARTER_TEMPLATES: list[dict[str, Any]] = [
    {
        "key": "mart_pet_birthday",
        "product_code": "shopie",
        "name": "Pet birthday discount",
        "description": "Give 15% off on the pet's birthday at POS and online.",
        "trigger": {"type": "checkout.quote"},
        "conditions": [{"type": "pet.birthday_today"}],
        "actions": [
            {
                "type": "discount.offer",
                "label": "Pet birthday 15% off",
                "discount_type": "percent",
                "discount_value": "15",
                "applies_to_pos": True,
                "applies_to_online": True,
            },
            {
                "type": "notify.staff",
                "subject": "Pet birthday today",
                "body": "{pet}'s birthday — birthday offer is available at checkout.",
            },
        ],
    },
    {
        "key": "mart_vip_tag",
        "product_code": "shopie",
        "name": "VIP customer discount",
        "description": "Customers tagged vip get 10% off any day.",
        "trigger": {"type": "checkout.quote"},
        "conditions": [{"type": "customer.has_tag", "tag": "vip"}],
        "actions": [
            {
                "type": "discount.offer",
                "label": "VIP 10% off",
                "discount_type": "percent",
                "discount_value": "10",
                "applies_to_pos": True,
                "applies_to_online": True,
            }
        ],
    },
    {
        "key": "mart_day_sale",
        "product_code": "shopie",
        "name": "Special day sale",
        "description": "Show a day-only offer (set recurring MM-DD in conditions).",
        "trigger": {"type": "checkout.quote"},
        "conditions": [{"type": "datetime.recurring_mmdd", "mmdd": "11-01"}],
        "actions": [
            {
                "type": "discount.offer",
                "label": "Festival day 20% off",
                "discount_type": "percent",
                "discount_value": "20",
                "applies_to_pos": True,
                "applies_to_online": True,
            }
        ],
    },
    {
        "key": "appoint_customer_birthday",
        "product_code": "appointie",
        "name": "Customer birthday perk",
        "description": "Remind staff and hint a birthday discount when booking.",
        "trigger": {"type": "booking.quote"},
        "conditions": [{"type": "customer.birthday_today"}],
        "actions": [
            {
                "type": "offer.staff_hint",
                "label": "Birthday — suggest 15% off",
                "discount_type": "percent",
                "discount_value": "15",
                "message": "Wish them a happy birthday and offer 15% off today's visit.",
            },
            {
                "type": "notify.staff",
                "subject": "Customer birthday today",
                "body": "{customer} has a birthday today.",
            },
        ],
    },
    {
        "key": "appoint_vip",
        "product_code": "appointie",
        "name": "VIP booking perk",
        "description": "Staff hint for customers tagged vip.",
        "trigger": {"type": "booking.quote"},
        "conditions": [{"type": "customer.has_tag", "tag": "vip"}],
        "actions": [
            {
                "type": "offer.staff_hint",
                "label": "VIP — suggest 10% off",
                "discount_type": "percent",
                "discount_value": "10",
                "message": "VIP guest — consider a courtesy discount.",
            }
        ],
    },
]



def ensure_birthday_day_notify_companion(*, definition: WorkflowDefinition) -> WorkflowDefinition | None:
    """When a pet-birthday POS/online discount is activated, ensure a once-a-day notify rule exists."""
    trigger_type = str((definition.trigger or {}).get("type") or "")
    if trigger_type != "checkout.quote":
        return None
    conditions = definition.conditions or []
    if not any(str((c or {}).get("type") or "") == "pet.birthday_today" for c in conditions if isinstance(c, dict)):
        return None
    discount = None
    for action in definition.actions or []:
        if isinstance(action, dict) and str(action.get("type") or "") == "discount.offer":
            discount = action
            break
    if discount is None:
        return None

    companion_key = f"birthday_notify:{definition.id}"
    existing = (
        WorkflowDefinition.objects.filter(
            tenant=definition.tenant,
            business=definition.business,
            metadata__companion_of=str(definition.id),
            deleted_at__isnull=True,
        ).first()
    )
    label = str(discount.get("label") or "Birthday offer").strip()
    dtype = str(discount.get("discount_type") or "percent")
    dval = str(discount.get("discount_value") or "15")
    payload = {
        "name": f"{definition.name} · birthday message",
        "description": "Sends an attractive email + in-app alert on the pet's birthday morning.",
        "product_code": definition.product_code,
        "trigger": {"type": "schedule.daily"},
        "conditions": [{"type": "pet.birthday_today"}],
        "actions": [
            {
                "type": "notify.customer",
                "channels": "in_app,email",
                "offer_label": label,
                "discount_type": dtype,
                "discount_value": dval,
                "label": label,
            }
        ],
        "metadata": {
            "companion_of": str(definition.id),
            "companion_key": companion_key,
            "purpose": "birthday_day_notify",
        },
    }
    validated = validate_workflow_payload(data=payload, product_code=definition.product_code)
    if existing is None:
        return WorkflowDefinition.objects.create(
            tenant=definition.tenant,
            business=definition.business,
            name=validated["name"],
            description=validated["description"],
            product_code=validated["product_code"],
            status=WorkflowStatus.ACTIVE,
            trigger=validated["trigger"],
            conditions=validated["conditions"],
            actions=validated["actions"],
            created_via=definition.created_via,
            source_prompt=definition.source_prompt or "",
            created_by=definition.created_by,
            metadata=validated["metadata"],
        )
    existing.name = validated["name"]
    existing.description = validated["description"]
    existing.product_code = validated["product_code"]
    existing.status = WorkflowStatus.ACTIVE
    existing.trigger = validated["trigger"]
    existing.conditions = validated["conditions"]
    existing.actions = validated["actions"]
    existing.metadata = validated["metadata"]
    existing.save()
    return existing


def _companion_qs(*, definition: WorkflowDefinition):
    return WorkflowDefinition.objects.filter(
        tenant=definition.tenant,
        business=definition.business,
        metadata__companion_of=str(definition.id),
        deleted_at__isnull=True,
    )


def sync_birthday_companions(*, definition: WorkflowDefinition, status: str) -> None:
    """Keep birthday notify companions aligned with the parent discount automation."""
    companions = list(_companion_qs(definition=definition))
    if status == WorkflowStatus.ACTIVE:
        ensure_birthday_day_notify_companion(definition=definition)
        return
    for row in companions:
        if status == WorkflowStatus.PAUSED and row.status != WorkflowStatus.PAUSED:
            row.status = WorkflowStatus.PAUSED
            row.save(update_fields=["status", "updated_at"])
        elif status == "deleted":
            if row.status == WorkflowStatus.ACTIVE:
                row.status = WorkflowStatus.PAUSED
                row.save(update_fields=["status", "updated_at"])
            row.delete()


class WorkflowDefinitionService:
    def list_definitions(
        self, *, tenant: Tenant, business: Business, product_code: str | None = None
    ) -> list[WorkflowDefinition]:
        qs = WorkflowDefinition.objects.filter(tenant=tenant, business=business)
        if product_code:
            qs = qs.filter(product_code=product_code)
        # Hide auto-companion notify rules — they mirror a parent checkout discount.
        rows = [
            row
            for row in qs.order_by("-updated_at")
            if str((row.metadata or {}).get("purpose") or "") != "birthday_day_notify"
        ]
        return rows

    def get(self, *, tenant: Tenant, business: Business, definition_id: UUID) -> WorkflowDefinition:
        row = WorkflowDefinition.objects.filter(
            tenant=tenant, business=business, id=definition_id
        ).first()
        if row is None:
            raise NotFound("Automation not found.")
        return row

    def create(
        self,
        *,
        tenant: Tenant,
        business: Business,
        data: dict[str, Any],
        user: AbstractBaseUser | None = None,
        created_via: str = WorkflowCreatedVia.MANUAL,
        source_prompt: str = "",
        status: str = WorkflowStatus.DRAFT,
    ) -> WorkflowDefinition:
        product_code = str(data.get("product_code") or "").strip().lower()
        payload = validate_workflow_payload(data=data, product_code=product_code)
        return WorkflowDefinition.objects.create(
            tenant=tenant,
            business=business,
            name=payload["name"],
            description=payload["description"],
            product_code=payload["product_code"],
            status=status,
            trigger=payload["trigger"],
            conditions=payload["conditions"],
            actions=payload["actions"],
            created_via=created_via,
            source_prompt=source_prompt or "",
            created_by=user if user and getattr(user, "is_authenticated", False) else None,
            metadata=payload["metadata"],
        )

    def update(
        self,
        *,
        definition: WorkflowDefinition,
        data: dict[str, Any],
    ) -> WorkflowDefinition:
        merged = {
            "name": data.get("name", definition.name),
            "description": data.get("description", definition.description),
            "product_code": data.get("product_code", definition.product_code),
            "trigger": data.get("trigger", definition.trigger),
            "conditions": data.get("conditions", definition.conditions),
            "actions": data.get("actions", definition.actions),
            "metadata": data.get("metadata", definition.metadata),
        }
        payload = validate_workflow_payload(
            data=merged, product_code=str(merged["product_code"])
        )
        definition.name = payload["name"]
        definition.description = payload["description"]
        definition.product_code = payload["product_code"]
        definition.trigger = payload["trigger"]
        definition.conditions = payload["conditions"]
        definition.actions = payload["actions"]
        definition.metadata = payload["metadata"]
        definition.save()
        if definition.status == WorkflowStatus.ACTIVE:
            sync_birthday_companions(definition=definition, status=WorkflowStatus.ACTIVE)
        return definition

    def set_status(self, *, definition: WorkflowDefinition, status: str) -> WorkflowDefinition:
        if status not in {WorkflowStatus.DRAFT, WorkflowStatus.ACTIVE, WorkflowStatus.PAUSED}:
            raise ValidationError({"status": "Invalid status."})
        if status == WorkflowStatus.ACTIVE:
            from apps.workflow.services.gemini_creator import _coerce_for_product

            coerced = _coerce_for_product(
                {
                    "name": definition.name,
                    "description": definition.description,
                    "product_code": definition.product_code,
                    "trigger": definition.trigger,
                    "conditions": definition.conditions,
                    "actions": definition.actions,
                    "metadata": definition.metadata,
                },
                product_code=definition.product_code,
            )
            payload = validate_workflow_payload(
                data=coerced,
                product_code=definition.product_code,
            )
            # Heal older drafts that used the wrong product action types.
            definition.trigger = payload["trigger"]
            definition.conditions = payload["conditions"]
            definition.actions = payload["actions"]
            definition.metadata = payload["metadata"]
        definition.status = status
        definition.save(
            update_fields=["status", "trigger", "conditions", "actions", "metadata", "updated_at"]
            if status == WorkflowStatus.ACTIVE
            else ["status", "updated_at"]
        )
        sync_birthday_companions(definition=definition, status=status)
        return definition

    def delete(self, *, definition: WorkflowDefinition) -> None:
        # Soft-delete; pause first so a deleted row never keeps firing.
        sync_birthday_companions(definition=definition, status="deleted")
        if definition.status == WorkflowStatus.ACTIVE:
            definition.status = WorkflowStatus.PAUSED
            definition.save(update_fields=["status", "updated_at"])
        definition.delete()

    def templates_for_product(self, *, product_code: str) -> list[dict[str, Any]]:
        code = (product_code or "").strip().lower()
        return [row for row in STARTER_TEMPLATES if row["product_code"] == code]

    def list_runs(
        self, *, tenant: Tenant, business: Business, limit: int = 50
    ) -> list[WorkflowRun]:
        return list(
            WorkflowRun.objects.filter(tenant=tenant, business=business).order_by("-created_at")[
                : max(1, min(limit, 200))
            ]
        )
