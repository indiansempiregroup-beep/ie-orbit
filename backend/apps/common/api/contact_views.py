from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.api.utils import client_ip, user_agent
from apps.common.api.responses import error_response, success_response
from apps.common.services.contact_form import ContactFormService


class ContactFormSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=1, max_length=120)
    email = serializers.EmailField(max_length=254)
    message = serializers.CharField(min_length=1, max_length=5000)
    website = serializers.CharField(required=False, allow_blank=True, max_length=200)


class ContactFormView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "contact_form"
    serializer_class = ContactFormSerializer

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.contact_form_service = ContactFormService()

    @extend_schema(request=ContactFormSerializer)
    def post(self, request: Request) -> Response:
        serializer = ContactFormSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("website", "").strip():
            return success_response(
                {"submitted": True},
                request_id=getattr(request, "request_id", request.headers.get("X-Request-ID")),
            )
        try:
            self.contact_form_service.submit(
                name=serializer.validated_data["name"].strip(),
                email=serializer.validated_data["email"].strip(),
                message=serializer.validated_data["message"].strip(),
                ip_address=client_ip(request),
                user_agent=user_agent(request),
            )
        except Exception:
            return error_response(
                code="CONTACT_FORM_UNAVAILABLE",
                message="We could not send your message right now. Please email support@indiansempire.com instead.",
                status_code=503,
            )
        return success_response(
            {"submitted": True},
            request_id=getattr(request, "request_id", request.headers.get("X-Request-ID")),
        )
