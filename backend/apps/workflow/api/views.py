from __future__ import annotations

from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.common.permissions.base import IsAuthenticatedAndActive
from apps.customers.models import Customer
from apps.workflow.models import WorkflowCreatedVia, WorkflowStatus
from apps.workflow.services.access import (
    ensure_automations,
    has_automations,
    resolve_automation_product_code,
    resolve_product_code,
)
from apps.workflow.services.definitions import (
    WorkflowDefinitionService,
    serialize_definition,
    serialize_run,
)
from apps.workflow.services.engine import WorkflowEngine
from apps.workflow.services.gemini_creator import GeminiAutomationCreator


def _resolve_business(request: Request) -> Business:
    business = getattr(request, "current_business", None)
    if business is None:
        business_id = request.query_params.get("business_id") or (request.data or {}).get(
            "business_id"
        )
        if business_id and getattr(request, "current_tenant", None) is not None:
            business = Business.objects.filter(
                tenant=request.current_tenant, id=business_id
            ).first()
    if business is None:
        raise PermissionDenied("A business context is required.")
    return business


class WorkflowAccessView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]

    @extend_schema(tags=["Automations"])
    def get(self, request: Request) -> Response:
        business = _resolve_business(request)
        from apps.workflow.services.access import active_product_codes

        product_code = resolve_product_code(business=business)
        entitled = has_automations(business=business)
        templates = (
            WorkflowDefinitionService().templates_for_product(product_code=product_code)
            if entitled
            else []
        )
        return success_response(
            {
                "entitled": entitled,
                "product_code": product_code,
                "available_product_codes": active_product_codes(business=business),
                "selected_product": str(getattr(business, "selected_product", "") or ""),
                "templates": templates,
            },
            request_id=getattr(request, "request_id", None),
        )


class WorkflowDefinitionListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = WorkflowDefinitionService()

    @extend_schema(tags=["Automations"])
    def get(self, request: Request) -> Response:
        business = _resolve_business(request)
        ensure_automations(business=business)
        product = request.query_params.get("product_code") or None
        rows = self.service.list_definitions(
            tenant=request.current_tenant,
            business=business,
            product_code=product,
        )
        return success_response(
            {"definitions": [serialize_definition(row) for row in rows]},
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Automations"])
    def post(self, request: Request) -> Response:
        business = _resolve_business(request)
        ensure_automations(business=business)
        data = dict(request.data or {})
        data.setdefault("product_code", resolve_product_code(business=business))
        template_key = str(data.pop("template_key", "") or "").strip()
        if template_key:
            templates = {
                t["key"]: t
                for t in self.service.templates_for_product(product_code=data["product_code"])
            }
            tpl = templates.get(template_key)
            if not tpl:
                raise ValidationError({"template_key": "Unknown template."})
            data = {
                "name": tpl["name"],
                "description": tpl.get("description") or "",
                "product_code": tpl["product_code"],
                "trigger": tpl["trigger"],
                "conditions": tpl["conditions"],
                "actions": tpl["actions"],
            }
            created_via = WorkflowCreatedVia.TEMPLATE
        else:
            created_via = WorkflowCreatedVia.MANUAL
        status_value = str(data.pop("status", WorkflowStatus.DRAFT) or WorkflowStatus.DRAFT)
        row = self.service.create(
            tenant=request.current_tenant,
            business=business,
            data=data,
            user=request.user,
            created_via=created_via,
            status=status_value
            if status_value in {WorkflowStatus.DRAFT, WorkflowStatus.ACTIVE, WorkflowStatus.PAUSED}
            else WorkflowStatus.DRAFT,
        )
        return success_response(
            serialize_definition(row),
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class WorkflowDefinitionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = WorkflowDefinitionService()

    def _get(self, request: Request, definition_id: UUID):
        business = _resolve_business(request)
        ensure_automations(business=business)
        return business, self.service.get(
            tenant=request.current_tenant, business=business, definition_id=definition_id
        )

    @extend_schema(tags=["Automations"])
    def get(self, request: Request, definition_id: UUID) -> Response:
        _, row = self._get(request, definition_id)
        return success_response(
            serialize_definition(row), request_id=getattr(request, "request_id", None)
        )

    @extend_schema(tags=["Automations"])
    def patch(self, request: Request, definition_id: UUID) -> Response:
        _, row = self._get(request, definition_id)
        row = self.service.update(definition=row, data=dict(request.data or {}))
        return success_response(
            serialize_definition(row), request_id=getattr(request, "request_id", None)
        )

    @extend_schema(tags=["Automations"])
    def delete(self, request: Request, definition_id: UUID) -> Response:
        _, row = self._get(request, definition_id)
        self.service.delete(definition=row)
        return success_response({"ok": True}, request_id=getattr(request, "request_id", None))


class WorkflowActivateView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = WorkflowDefinitionService()

    @extend_schema(tags=["Automations"])
    def post(self, request: Request, definition_id: UUID) -> Response:
        business = _resolve_business(request)
        ensure_automations(business=business)
        row = self.service.get(
            tenant=request.current_tenant, business=business, definition_id=definition_id
        )
        row = self.service.set_status(definition=row, status=WorkflowStatus.ACTIVE)
        return success_response(
            serialize_definition(row), request_id=getattr(request, "request_id", None)
        )


class WorkflowPauseView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = WorkflowDefinitionService()

    @extend_schema(tags=["Automations"])
    def post(self, request: Request, definition_id: UUID) -> Response:
        business = _resolve_business(request)
        ensure_automations(business=business)
        row = self.service.get(
            tenant=request.current_tenant, business=business, definition_id=definition_id
        )
        row = self.service.set_status(definition=row, status=WorkflowStatus.PAUSED)
        return success_response(
            serialize_definition(row), request_id=getattr(request, "request_id", None)
        )


class WorkflowDraftFromPromptView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    creator = GeminiAutomationCreator()

    @extend_schema(tags=["Automations"])
    def post(self, request: Request) -> Response:
        business = _resolve_business(request)
        ensure_automations(business=business)
        data = request.data or {}
        prompt = str(data.get("prompt") or "")
        # Infer Mart vs Appoint from the owner's wording when possible (POS/online => Mart).
        product_code = resolve_automation_product_code(business=business, prompt=prompt)
        prior_draft = data.get("prior_draft") if isinstance(data.get("prior_draft"), dict) else None
        conversation = data.get("conversation") if isinstance(data.get("conversation"), list) else None
        save_draft = bool(data.get("save_draft"))
        result = self.creator.draft_from_prompt(
            tenant=request.current_tenant,
            business=business,
            prompt=prompt,
            product_code=product_code,
            user=request.user,
            save_draft=save_draft,
            prior_draft=prior_draft,
            conversation=conversation,
        )
        definition = result.get("definition")
        return success_response(
            {
                "draft": result["draft"],
                "explanation": result.get("explanation") or {},
                "suggestions": result.get("suggestions") or [],
                "usage": result["usage"],
                "definition": serialize_definition(definition) if definition else None,
            },
            status_code=status.HTTP_201_CREATED if definition else status.HTTP_200_OK,
            request_id=getattr(request, "request_id", None),
        )


class WorkflowActivateDraftView(APIView):
    """Create + activate a validated draft payload (after owner agrees to the preview)."""

    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = WorkflowDefinitionService()

    @extend_schema(tags=["Automations"])
    def post(self, request: Request) -> Response:
        business = _resolve_business(request)
        ensure_automations(business=business)
        data = dict(request.data or {})
        data.setdefault("product_code", resolve_product_code(business=business))
        source_prompt = str(data.pop("source_prompt", "") or "")
        row = self.service.create(
            tenant=request.current_tenant,
            business=business,
            data=data,
            user=request.user,
            created_via=WorkflowCreatedVia.GEMINI if source_prompt else WorkflowCreatedVia.MANUAL,
            source_prompt=source_prompt,
            status=WorkflowStatus.DRAFT,
        )
        row = self.service.set_status(definition=row, status=WorkflowStatus.ACTIVE)
        return success_response(
            serialize_definition(row),
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class WorkflowPreviewView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = WorkflowDefinitionService()
    engine = WorkflowEngine()

    @extend_schema(tags=["Automations"])
    def post(self, request: Request) -> Response:
        business = _resolve_business(request)
        ensure_automations(business=business)
        data = request.data or {}
        definition_id = data.get("definition_id")
        if not definition_id:
            raise ValidationError({"definition_id": "Required."})
        definition = self.service.get(
            tenant=request.current_tenant,
            business=business,
            definition_id=definition_id,
        )
        customer = None
        customer_id = data.get("customer_id")
        if customer_id:
            customer = Customer.objects.filter(
                tenant=request.current_tenant, business=business, id=customer_id
            ).first()
            if customer is None:
                raise NotFound("Customer not found.")
        pet = None
        pet_id = data.get("pet_id")
        if pet_id:
            from apps.shopie.models import ShopPet

            pet = ShopPet.objects.filter(
                tenant=request.current_tenant, business=business, id=pet_id
            ).first()
        outcome = self.engine.execute(
            tenant=request.current_tenant,
            business=business,
            definition=definition,
            trigger_key=str((definition.trigger or {}).get("type") or "preview"),
            context={"customer": customer, "pet": pet},
            subject_type="customer" if customer else "",
            subject_id=str(customer.id) if customer else "",
            dry_run=True,
        )
        return success_response(outcome, request_id=getattr(request, "request_id", None))


class WorkflowRunListView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = WorkflowDefinitionService()

    @extend_schema(tags=["Automations"])
    def get(self, request: Request) -> Response:
        business = _resolve_business(request)
        ensure_automations(business=business)
        rows = self.service.list_runs(tenant=request.current_tenant, business=business)
        return success_response(
            {"runs": [serialize_run(row) for row in rows]},
            request_id=getattr(request, "request_id", None),
        )
