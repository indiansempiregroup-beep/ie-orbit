from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.businesses.api.permissions import BusinessManagePermission
from apps.businesses.models import Business, BusinessSettings
from apps.common.api.responses import success_response
from apps.notifications.api.whatsapp_serializers import (
    WhatsAppSettingsUpdateSerializer,
    WhatsAppTemplateActionSerializer,
)
from apps.notifications.models import Notification, NotificationChannel, NotificationStatus
from apps.notifications.services.whatsapp_settings import WhatsAppIntegrationService, webhook_url, webhook_verify_token


def _business(request: Request, business_id) -> Business:
    return get_object_or_404(
        Business.objects.require_tenant(request.current_tenant),
        id=business_id,
    )


def _validation_error(exc: DjangoValidationError) -> ValidationError:
    if hasattr(exc, "message_dict"):
        return ValidationError(exc.message_dict)
    if hasattr(exc, "messages"):
        return ValidationError(exc.messages)
    return ValidationError(str(exc))


class WhatsAppSettingsView(APIView):
    permission_classes = [BusinessManagePermission]
    service = WhatsAppIntegrationService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        return success_response(
            self.service.public_settings(business=business, webhook_url=webhook_url())
        )

    def patch(self, request: Request) -> Response:
        serializer = WhatsAppSettingsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        try:
            if data.get("disconnect"):
                payload = self.service.disconnect(business=business)
            elif "phone_number_id" in request.data or "waba_id" in request.data or "access_token" in request.data:
                payload = self.service.update_settings(
                    business=business,
                    phone_number_id=data.get("phone_number_id") or "",
                    waba_id=data.get("waba_id") or "",
                    access_token=data.get("access_token") or "",
                    enabled=data.get("enabled"),
                    test_connection=bool(data.get("test_connection")),
                )
            elif "enabled" in request.data:
                payload = self.service.set_enabled(business=business, enabled=bool(data.get("enabled")))
            else:
                payload = self.service.public_settings(business=business, webhook_url=webhook_url())
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        payload["webhook_url"] = webhook_url()
        return success_response(payload)


class WhatsAppTemplateListView(APIView):
    permission_classes = [BusinessManagePermission]
    service = WhatsAppIntegrationService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        return success_response(self.service.list_templates(business=business))

    def post(self, request: Request) -> Response:
        serializer = WhatsAppTemplateActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        action = str(request.query_params.get("action") or request.data.get("action") or "sync")
        try:
            if action == "refresh":
                payload = self.service.refresh_templates(business=business)
            else:
                payload = self.service.sync_templates(business=business, code=data.get("code"))
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(payload)


class WhatsAppTemplateDetailView(APIView):
    permission_classes = [BusinessManagePermission]
    service = WhatsAppIntegrationService()

    def patch(self, request: Request, code: str) -> Response:
        serializer = WhatsAppTemplateActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        try:
            payload = self.service.set_template_enabled(
                business=business,
                code=code,
                enabled=bool(data.get("enabled")),
            )
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(payload)


class WhatsAppTemplateTestView(APIView):
    permission_classes = [BusinessManagePermission]
    service = WhatsAppIntegrationService()

    def post(self, request: Request, code: str) -> Response:
        serializer = WhatsAppTemplateActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        business = _business(request, data["business_id"])
        to = str(data.get("to") or getattr(request.user, "phone_number", "") or "")
        try:
            payload = self.service.test_template(business=business, code=code, to=to)
        except DjangoValidationError as exc:
            raise _validation_error(exc) from exc
        return success_response(payload)


class WhatsAppMappingsView(APIView):
    permission_classes = [BusinessManagePermission]
    service = WhatsAppIntegrationService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        return success_response(self.service.list_mappings(business=business))


class WhatsAppActivityView(APIView):
    permission_classes = [BusinessManagePermission]
    service = WhatsAppIntegrationService()

    def get(self, request: Request) -> Response:
        business_id = request.query_params.get("business_id")
        if not business_id:
            raise ValidationError({"business_id": "This field is required."})
        business = _business(request, business_id)
        return success_response(self.service.recent_activity(business=business))


class WhatsAppWebhookView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request: Request):
        mode = request.query_params.get("hub.mode")
        token = request.query_params.get("hub.verify_token")
        challenge = request.query_params.get("hub.challenge")
        expected = webhook_verify_token()
        if mode == "subscribe" and expected and token == expected:
            return HttpResponse(challenge or "", content_type="text/plain")
        return HttpResponse("forbidden", status=403)

    def post(self, request: Request) -> Response:
        payload = request.data if isinstance(request.data, dict) else {}
        entries = payload.get("entry") if isinstance(payload.get("entry"), list) else []
        for entry in entries:
            changes = entry.get("changes") if isinstance(entry, dict) else None
            if not isinstance(changes, list):
                continue
            for change in changes:
                value = change.get("value") if isinstance(change, dict) else None
                if not isinstance(value, dict):
                    continue
                metadata = value.get("metadata") if isinstance(value.get("metadata"), dict) else {}
                phone_number_id = str(metadata.get("phone_number_id") or "")
                statuses = value.get("statuses") if isinstance(value.get("statuses"), list) else []
                for item in statuses:
                    if not isinstance(item, dict):
                        continue
                    wamid = str(item.get("id") or "")
                    wa_status = str(item.get("status") or "").lower()
                    if not wamid:
                        continue
                    notification = Notification.objects.filter(
                        channel=NotificationChannel.WHATSAPP,
                        external_id=wamid,
                    ).first()
                    if notification is None and phone_number_id:
                        settings_row = BusinessSettings.objects.filter(
                            whatsapp_integration__phone_number_id=phone_number_id
                        ).first()
                        if settings_row is not None:
                            notification = Notification.objects.filter(
                                business=settings_row.business,
                                channel=NotificationChannel.WHATSAPP,
                                external_id=wamid,
                            ).first()
                    if notification is None:
                        continue
                    if wa_status in {"failed", "undelivered"}:
                        notification.status = NotificationStatus.FAILED
                    elif wa_status in {"sent", "delivered", "read"}:
                        notification.status = NotificationStatus.SENT
                    notification.save(update_fields=["status", "updated_at"])
        return success_response({"received": True})
