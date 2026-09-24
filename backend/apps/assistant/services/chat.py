from __future__ import annotations

import logging
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.assistant.models import (
    AssistantMessage,
    AssistantMessageRole,
    AssistantProposedAction,
    AssistantProposedActionStatus,
    AssistantThread,
)
from apps.assistant.services.access import (
    consume_confirm_quota,
    consume_message_quota,
    ensure_assistant_access,
)
from apps.assistant.services.brains import get_brain
from apps.assistant.services.brains.base import BrainResult
from apps.assistant.services.friendly_errors import GENERIC_FAIL_REPLY, validation_message
from apps.assistant.services import tools as toolset
from apps.assistant.services.usage import (
    get_or_create_usage,
    increment_confirm_usage,
    increment_message_usage,
    usage_snapshot,
)
from apps.businesses.models import Business
from apps.tenancy.models import Tenant

logger = logging.getLogger(__name__)


def serialize_proposed_action(action: AssistantProposedAction | None) -> dict[str, Any] | None:
    if action is None:
        return None
    return {
        "id": str(action.id),
        "action_type": action.action_type,
        "summary": action.summary,
        "payload": action.payload,
        "status": action.status,
        "result": action.result or {},
    }


def serialize_message(message: AssistantMessage) -> dict[str, Any]:
    proposal = message.proposed_actions.order_by("-created_at").first()
    return {
        "id": str(message.id),
        "role": message.role,
        "content": message.content,
        "metadata": message.metadata or {},
        "created_at": message.created_at.isoformat(),
        "proposed_action": serialize_proposed_action(proposal),
    }


def serialize_thread(thread: AssistantThread, *, include_messages: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": str(thread.id),
        "title": thread.title,
        "created_at": thread.created_at.isoformat(),
        "updated_at": thread.updated_at.isoformat(),
    }
    if include_messages:
        messages = list(thread.messages.order_by("created_at"))
        payload["messages"] = [serialize_message(item) for item in messages]
    return payload


class AssistantChatService:
    def create_thread(self, *, tenant: Tenant, business: Business, user) -> AssistantThread:
        ensure_assistant_access(business=business)
        return AssistantThread.objects.create(
            tenant=tenant,
            business=business,
            created_by=user if getattr(user, "is_authenticated", False) else None,
            title="",
        )

    def list_threads(self, *, tenant: Tenant, business: Business, user=None):
        ensure_assistant_access(business=business)
        qs = AssistantThread.objects.require_tenant(tenant).filter(business=business)
        if user is not None and getattr(user, "is_authenticated", False):
            qs = qs.filter(created_by=user)
        return qs.order_by("-updated_at")[:30]

    def get_thread(self, *, tenant: Tenant, business: Business, thread_id: str) -> AssistantThread:
        ensure_assistant_access(business=business)
        return AssistantThread.objects.require_tenant(tenant).get(business=business, id=thread_id)

    @transaction.atomic
    def post_message(
        self,
        *,
        tenant: Tenant,
        business: Business,
        thread: AssistantThread,
        user,
        text: str,
    ) -> dict[str, Any]:
        access = ensure_assistant_access(business=business)
        usage = get_or_create_usage(tenant=tenant, business=business)
        charge_path = consume_message_quota(
            tenant=tenant, business=business, used=usage.message_count
        )

        content = (text or "").strip()
        if not content:
            raise ValidationError({"text": "Message text is required."})

        user_message = AssistantMessage.objects.create(
            tenant=tenant,
            business=business,
            thread=thread,
            role=AssistantMessageRole.USER,
            content=content,
        )
        if not thread.title:
            thread.title = content[:80]
            thread.save(update_fields=["title", "updated_at"])

        brain = get_brain()
        last_assistant = (
            thread.messages.filter(role=AssistantMessageRole.ASSISTANT).order_by("-created_at").first()
        )
        prior_flow = {}
        if last_assistant and isinstance(last_assistant.metadata, dict):
            prior_flow = last_assistant.metadata.get("flow") or {}
        try:
            result = brain.handle(
                text=content,
                context={
                    "tenant": tenant,
                    "business": business,
                    "access": access,
                    "user": user,
                    "flow": prior_flow,
                },
            )
        except (ValidationError, DjangoValidationError) as exc:
            # Never surface raw field/API validation as a red client error for chat asks.
            result = BrainResult(
                reply=validation_message(exc),
                suggestions=toolset.suggestion_chips(access=access, business=business),
            )
        except Exception:
            logger.exception("Assistant brain failed for thread %s", thread.id)
            result = BrainResult(
                reply=GENERIC_FAIL_REPLY,
                suggestions=toolset.suggestion_chips(access=access, business=business),
            )

        metadata: dict[str, Any] = {
            "brain": brain.name,
            "suggestions": result.suggestions,
            **(result.metadata or {}),
        }
        assistant_message = AssistantMessage.objects.create(
            tenant=tenant,
            business=business,
            thread=thread,
            role=AssistantMessageRole.ASSISTANT,
            content=result.reply,
            metadata=metadata,
        )

        proposed = None
        if result.proposal:
            proposed = AssistantProposedAction.objects.create(
                tenant=tenant,
                business=business,
                thread=thread,
                message=assistant_message,
                created_by=user if getattr(user, "is_authenticated", False) else None,
                action_type=result.proposal["action_type"],
                summary=result.proposal["summary"],
                payload=result.proposal.get("payload") or {},
                status=AssistantProposedActionStatus.PENDING,
            )

        if charge_path == "free":
            increment_message_usage(tenant=tenant, business=business)
        thread.updated_at = timezone.now()
        thread.save(update_fields=["updated_at"])

        return {
            "user_message": serialize_message(user_message),
            "assistant_message": serialize_message(assistant_message),
            "proposed_action": serialize_proposed_action(proposed),
            "suggestions": result.suggestions,
            "usage": usage_snapshot(tenant=tenant, business=business),
        }

    @transaction.atomic
    def confirm_action(
        self,
        *,
        tenant: Tenant,
        business: Business,
        action: AssistantProposedAction,
        user,
    ) -> dict[str, Any]:
        ensure_assistant_access(business=business)
        if action.status != AssistantProposedActionStatus.PENDING:
            raise ValidationError({"detail": "This action is no longer pending."})
        usage = get_or_create_usage(tenant=tenant, business=business)
        charge_path = consume_confirm_quota(
            tenant=tenant, business=business, used=usage.confirm_count
        )
        try:
            result = toolset.execute_proposed_action(
                tenant=tenant,
                business=business,
                action_type=action.action_type,
                payload=action.payload or {},
                actor=user,
            )
        except Exception as exc:
            action.status = AssistantProposedActionStatus.FAILED
            action.result = {"error": str(exc)}
            action.save(update_fields=["status", "result", "updated_at"])
            raise ValidationError({"detail": str(exc)}) from exc

        action.status = AssistantProposedActionStatus.CONFIRMED
        action.result = result
        action.confirmed_at = timezone.now()
        action.save(update_fields=["status", "result", "confirmed_at", "updated_at"])
        if charge_path == "free":
            increment_confirm_usage(tenant=tenant, business=business)

        follow_up = AssistantMessage.objects.create(
            tenant=tenant,
            business=business,
            thread=action.thread,
            role=AssistantMessageRole.ASSISTANT,
            content=f"Done. {action.summary}",
            metadata={"confirmed_action_id": str(action.id), "result": result},
        )
        return {
            "proposed_action": serialize_proposed_action(action),
            "assistant_message": serialize_message(follow_up),
            "usage": usage_snapshot(tenant=tenant, business=business),
        }

    @transaction.atomic
    def cancel_action(
        self,
        *,
        tenant: Tenant,
        business: Business,
        action: AssistantProposedAction,
    ) -> dict[str, Any]:
        ensure_assistant_access(business=business)
        if action.status != AssistantProposedActionStatus.PENDING:
            raise ValidationError({"detail": "This action is no longer pending."})
        action.status = AssistantProposedActionStatus.CANCELLED
        action.cancelled_at = timezone.now()
        action.save(update_fields=["status", "cancelled_at", "updated_at"])
        follow_up = AssistantMessage.objects.create(
            tenant=tenant,
            business=business,
            thread=action.thread,
            role=AssistantMessageRole.ASSISTANT,
            content="Cancelled. No changes were made.",
            metadata={"cancelled_action_id": str(action.id)},
        )
        return {
            "proposed_action": serialize_proposed_action(action),
            "assistant_message": serialize_message(follow_up),
            "usage": usage_snapshot(tenant=tenant, business=business),
        }
