from __future__ import annotations

from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.api.serializers import (
    OtpCapabilitiesQuerySerializer,
    OtpSendSerializer,
    OtpVerifySerializer,
    UserProfileSerializer,
)
from apps.authentication.api.utils import client_ip, user_agent
from apps.authentication.services.auth_otp import AuthOtpService
from apps.authentication.services.roles import RoleService
from apps.common.api.responses import success_response


class OtpCapabilitiesView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request: Request) -> Response:
        serializer = OtpCapabilitiesQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        caps = AuthOtpService().capabilities(
            client=serializer.validated_data["client"],
            tenant_slug=serializer.validated_data.get("tenant_slug"),
            business_code=serializer.validated_data.get("business_code"),
        )
        return success_response(caps.as_dict(), request_id=getattr(request, "request_id", None))


class OtpSendView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth_otp"

    def post(self, request: Request) -> Response:
        serializer = OtpSendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        payload = AuthOtpService().send(
            client=data["client"],
            channel=data["channel"],
            identifier=data["identifier"],
            tenant_slug=data.get("tenant_slug"),
            business_code=data.get("business_code"),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(payload, request_id=getattr(request, "request_id", None))


class OtpVerifyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth_otp"

    def post(self, request: Request) -> Response:
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = AuthOtpService().verify_and_login(
            client=data["client"],
            channel=data["channel"],
            identifier=data["identifier"],
            code=data["code"],
            remember_me=data.get("remember_me", True),
            tenant_slug=data.get("tenant_slug"),
            business_code=data.get("business_code"),
            create_if_missing=data.get("create_if_missing", False),
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", ""),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        user = RoleService().ensure_superuser_platform_role(user=result.user)
        return success_response(
            {
                "access": result.tokens.access,
                "refresh": result.tokens.refresh,
                "token_type": result.tokens.token_type,
                "expires_in": result.tokens.expires_in,
                "user": UserProfileSerializer(user).data,
            },
            request_id=getattr(request, "request_id", None),
        )
