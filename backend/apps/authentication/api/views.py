from __future__ import annotations

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from apps.authentication.api.serializers import (
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    RegisterBusinessSerializer,
    RegisterSerializer,
    RefreshSerializer,
    ResendVerificationSerializer,
    ResetPasswordSerializer,
    UserProfileSerializer,
    VerifyEmailSerializer,
)
from apps.authentication.api.utils import client_ip, user_agent
from apps.authentication.services.authentication import AuthenticationService
from apps.authentication.services.passwords import PasswordService
from apps.authentication.services.verification import EmailVerificationService
from apps.authentication.services.workspace_provisioning import WorkspaceProvisioningService
from apps.audit.services.audit import record_audit
from apps.audit.services.events import publish_domain_event
from apps.common.api.responses import success_response
from apps.tenancy.models import Tenant


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "auth_login"
    serializer_class = LoginSerializer

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = AuthenticationService().login(
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
            remember_me=serializer.validated_data["remember_me"],
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(
            {
                "access": result.tokens.access,
                "refresh": result.tokens.refresh,
                "token_type": result.tokens.token_type,
                "expires_in": result.tokens.expires_in,
                "user": UserProfileSerializer(result.user).data,
            },
            status_code=status.HTTP_200_OK,
            request_id=getattr(request, "request_id", None),
        )


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = RegisterSerializer

    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = AuthenticationService().register(
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
            first_name=serializer.validated_data.get("first_name", ""),
            last_name=serializer.validated_data.get("last_name", ""),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        return success_response(
            UserProfileSerializer(user).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class RegisterBusinessView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = RegisterBusinessSerializer

    def post(self, request: Request) -> Response:
        serializer = RegisterBusinessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = WorkspaceProvisioningService()
        result = service.provision(
            data=dict(serializer.validated_data),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        record_audit(
            tenant=result.tenant,
            action="onboarding.workspace.provisioned",
            resource_type="tenant",
            resource_id=str(result.tenant.id),
            actor_id=str(result.user.id),
            ip_address=client_ip(request),
            user_agent=user_agent(request),
            metadata={"business_id": str(result.business.id)},
        )
        publish_domain_event(
            event_type="onboarding.workspace.provisioned",
            tenant_id=str(result.tenant.id),
            aggregate_type="tenant",
            aggregate_id=str(result.tenant.id),
            payload={
                "business_id": str(result.business.id),
                "user_id": str(result.user.id),
            },
        )
        return success_response(
            service.as_response_payload(result),
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class TenantSlugCheckView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request: Request) -> Response:
        slug = str(request.query_params.get("slug", "")).strip().lower()
        available = bool(slug) and not Tenant.objects.filter(slug=slug).exists()
        return success_response(
            {"slug": slug, "available": available},
            request_id=getattr(request, "request_id", None),
        )


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = RefreshSerializer

    def post(self, request: Request) -> Response:
        serializer = TokenRefreshSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return success_response(
            serializer.validated_data,
            request_id=getattr(request, "request_id", None),
        )


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = LogoutSerializer

    def post(self, request: Request) -> Response:
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = AuthenticationService()
        if serializer.validated_data["all_sessions"]:
            service.logout_all(
                user=request.user,
                ip_address=client_ip(request),
                user_agent=user_agent(request),
            )
        else:
            service.logout(
                refresh_token=serializer.validated_data["refresh"],
                user=request.user,
                ip_address=client_ip(request),
                user_agent=user_agent(request),
            )
        return success_response(
            {"logged_out": True}, request_id=getattr(request, "request_id", None)
        )


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_scope = "password_reset"
    serializer_class = ForgotPasswordSerializer

    def post(self, request: Request) -> Response:
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reset = PasswordService().request_reset(
            email=serializer.validated_data["email"],
            ip_address=client_ip(request),
            user_agent=user_agent(request),
        )
        data: dict[str, str | bool] = {"accepted": True}
        if settings.DEBUG and reset:
            data["debug_token"] = reset.token
        return success_response(data, request_id=getattr(request, "request_id", None))


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = ResetPasswordSerializer

    def post(self, request: Request) -> Response:
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PasswordService().reset_password(
            token=serializer.validated_data["token"],
            new_password=serializer.validated_data["new_password"],
        )
        return success_response({"reset": True}, request_id=getattr(request, "request_id", None))


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChangePasswordSerializer

    def post(self, request: Request) -> Response:
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        PasswordService().change_password(
            user=request.user,
            current_password=serializer.validated_data["current_password"],
            new_password=serializer.validated_data["new_password"],
        )
        return success_response({"changed": True}, request_id=getattr(request, "request_id", None))


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = VerifyEmailSerializer

    def post(self, request: Request) -> Response:
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = EmailVerificationService().verify(token=serializer.validated_data["token"])
        return success_response(
            {"verified": True, "email": user.email},
            request_id=getattr(request, "request_id", None),
        )


class ResendVerificationView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ResendVerificationSerializer

    def post(self, request: Request) -> Response:
        serializer = ResendVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        verification = EmailVerificationService().send_verification(user=request.user)
        data: dict[str, str | bool] = {"sent": True}
        if settings.DEBUG:
            data["debug_token"] = verification.token
        return success_response(data, request_id=getattr(request, "request_id", None))


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserProfileSerializer

    def get(self, request: Request) -> Response:
        return success_response(
            UserProfileSerializer(request.user).data,
            request_id=getattr(request, "request_id", None),
        )

    def patch(self, request: Request) -> Response:
        serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_at=timezone.now())
        return success_response(serializer.data, request_id=getattr(request, "request_id", None))
