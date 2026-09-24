from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assistant.models import AssistantProposedAction
from apps.assistant.services.access import ensure_assistant_access, resolve_assistant_access
from apps.assistant.services.chat import AssistantChatService, serialize_thread
from apps.assistant.services import tools as toolset
from apps.assistant.services.usage import usage_snapshot
from apps.assistant.services.wallet import AssistantWalletService
from apps.billing.services.checkout import CheckoutService
from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.common.permissions.base import IsAuthenticatedAndActive


def _resolve_business(request: Request) -> Business:
    business = getattr(request, "current_business", None)
    if business is None:
        raise PermissionDenied("A business context is required.")
    return business


class AssistantAccessView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = AssistantChatService()

    @extend_schema(tags=["Assistant"])
    def get(self, request: Request) -> Response:
        business = _resolve_business(request)
        access = resolve_assistant_access(business=business)
        suggestions = (
            toolset.suggestion_chips(access=access, business=business) if access.any_enabled else []
        )
        return success_response(
            {
                "enabled": access.any_enabled,
                "mart_enabled": access.mart_enabled,
                "appoint_enabled": access.appoint_enabled,
                "suggestions": suggestions,
                "usage": usage_snapshot(tenant=request.current_tenant, business=business)
                if access.any_enabled
                else None,
            },
            request_id=getattr(request, "request_id", None),
        )


class AssistantThreadListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = AssistantChatService()

    @extend_schema(tags=["Assistant"])
    def get(self, request: Request) -> Response:
        business = _resolve_business(request)
        threads = self.service.list_threads(
            tenant=request.current_tenant,
            business=business,
            user=request.user,
        )
        return success_response(
            {"threads": [serialize_thread(item) for item in threads]},
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Assistant"])
    def post(self, request: Request) -> Response:
        business = _resolve_business(request)
        thread = self.service.create_thread(
            tenant=request.current_tenant,
            business=business,
            user=request.user,
        )
        return success_response(
            serialize_thread(thread, include_messages=True),
            status_code=201,
            request_id=getattr(request, "request_id", None),
        )


class AssistantThreadDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = AssistantChatService()

    @extend_schema(tags=["Assistant"])
    def get(self, request: Request, thread_id: str) -> Response:
        business = _resolve_business(request)
        try:
            thread = self.service.get_thread(
                tenant=request.current_tenant,
                business=business,
                thread_id=thread_id,
            )
        except Exception as exc:
            raise NotFound("Thread not found.") from exc
        return success_response(
            serialize_thread(thread, include_messages=True),
            request_id=getattr(request, "request_id", None),
        )


class AssistantThreadMessageView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = AssistantChatService()

    @extend_schema(tags=["Assistant"])
    def post(self, request: Request, thread_id: str) -> Response:
        business = _resolve_business(request)
        try:
            thread = self.service.get_thread(
                tenant=request.current_tenant,
                business=business,
                thread_id=thread_id,
            )
        except Exception as exc:
            raise NotFound("Thread not found.") from exc
        payload = self.service.post_message(
            tenant=request.current_tenant,
            business=business,
            thread=thread,
            user=request.user,
            text=str(request.data.get("text") or ""),
        )
        return success_response(payload, request_id=getattr(request, "request_id", None))


class AssistantProposedActionConfirmView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = AssistantChatService()

    @extend_schema(tags=["Assistant"])
    def post(self, request: Request, action_id: str) -> Response:
        business = _resolve_business(request)
        ensure_assistant_access(business=business)
        try:
            action = AssistantProposedAction.objects.require_tenant(request.current_tenant).get(
                business=business,
                id=action_id,
            )
        except AssistantProposedAction.DoesNotExist as exc:
            raise NotFound("Proposed action not found.") from exc
        payload = self.service.confirm_action(
            tenant=request.current_tenant,
            business=business,
            action=action,
            user=request.user,
        )
        return success_response(payload, request_id=getattr(request, "request_id", None))


class AssistantProposedActionCancelView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    service = AssistantChatService()

    @extend_schema(tags=["Assistant"])
    def post(self, request: Request, action_id: str) -> Response:
        business = _resolve_business(request)
        ensure_assistant_access(business=business)
        try:
            action = AssistantProposedAction.objects.require_tenant(request.current_tenant).get(
                business=business,
                id=action_id,
            )
        except AssistantProposedAction.DoesNotExist as exc:
            raise NotFound("Proposed action not found.") from exc
        payload = self.service.cancel_action(
            tenant=request.current_tenant,
            business=business,
            action=action,
        )
        return success_response(payload, request_id=getattr(request, "request_id", None))


class AssistantUsageView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]

    @extend_schema(tags=["Assistant"])
    def get(self, request: Request) -> Response:
        business = _resolve_business(request)
        ensure_assistant_access(business=business)
        return success_response(
            usage_snapshot(tenant=request.current_tenant, business=business),
            request_id=getattr(request, "request_id", None),
        )


class AssistantWalletView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    wallet = AssistantWalletService()

    @extend_schema(tags=["Assistant"])
    def get(self, request: Request) -> Response:
        business = _resolve_business(request)
        ensure_assistant_access(business=business)
        return success_response(
            self.wallet.wallet_snapshot(tenant=request.current_tenant, business=business),
            request_id=getattr(request, "request_id", None),
        )


class AssistantWalletTopUpView(APIView):
    """Start a UPI claim session to prepaid-credit the Assistant wallet."""

    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    checkout = CheckoutService()

    @extend_schema(tags=["Assistant"])
    def post(self, request: Request) -> Response:
        business = _resolve_business(request)
        ensure_assistant_access(business=business)
        try:
            amount_paise = int(request.data.get("amount_paise") or 0)
        except (TypeError, ValueError) as exc:
            raise ValidationError({"amount_paise": "Enter a valid amount in paise."}) from exc
        session = self.checkout.create_assistant_upi_session(
            tenant=request.current_tenant,
            business=business,
            amount_paise=amount_paise,
            actor_id=str(getattr(request.user, "id", "") or ""),
        )
        return success_response(
            session,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class AssistantWalletHistoryView(APIView):
    permission_classes = [IsAuthenticated, IsAuthenticatedAndActive]
    wallet = AssistantWalletService()

    @extend_schema(tags=["Assistant"])
    def get(self, request: Request) -> Response:
        business = _resolve_business(request)
        ensure_assistant_access(business=business)
        try:
            page = int(request.query_params.get("page") or 1)
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get("page_size") or 20)
        except (TypeError, ValueError):
            page_size = 20
        return success_response(
            self.wallet.wallet_history(
                tenant=request.current_tenant,
                business=business,
                page=page,
                page_size=page_size,
            ),
            request_id=getattr(request, "request_id", None),
        )
