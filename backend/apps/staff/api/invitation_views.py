from __future__ import annotations

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.permissions import HasPlatformPermission
from apps.businesses.api.permissions import BusinessAccessPermission
from apps.businesses.models import Business
from apps.common.api.responses import success_response
from apps.staff.api.invitation_serializers import (
    AcceptInvitationSerializer,
    StaffInvitationCreateSerializer,
    StaffInvitationSerializer,
)
from apps.staff.services.invitations import StaffInvitationService


class BusinessInvitationListCreateView(APIView):
    permission_classes = [IsAuthenticated, BusinessAccessPermission, HasPlatformPermission]
    required_permission = "staff:manage"

    @extend_schema(tags=["Staff Invitations"], responses={200: StaffInvitationSerializer(many=True)})
    def get(self, request: Request, pk: str) -> Response:
        business = get_object_or_404(Business, id=pk, tenant=request.current_tenant)
        invitations = StaffInvitationService().list_invitations(
            tenant=request.current_tenant,
            business=business,
        )
        return success_response(
            StaffInvitationSerializer(invitations, many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Staff Invitations"],
        request=StaffInvitationCreateSerializer,
        responses={201: StaffInvitationSerializer},
    )
    def post(self, request: Request, pk: str) -> Response:
        business = get_object_or_404(Business, id=pk, tenant=request.current_tenant)
        serializer = StaffInvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = StaffInvitationService().create_invitation(
            tenant=request.current_tenant,
            business=business,
            email=serializer.validated_data["email"],
            platform_role_code=serializer.validated_data["platform_role_code"],
            invited_by=request.user,
        )
        return success_response(
            StaffInvitationSerializer(invitation).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class BusinessInvitationRevokeView(APIView):
    permission_classes = [IsAuthenticated, BusinessAccessPermission, HasPlatformPermission]
    required_permission = "staff:manage"

    @extend_schema(tags=["Staff Invitations"], responses={200: StaffInvitationSerializer})
    def delete(self, request: Request, pk: str, invitation_id: str) -> Response:
        business = get_object_or_404(Business, id=pk, tenant=request.current_tenant)
        invitation = StaffInvitationService().revoke_invitation(
            tenant=request.current_tenant,
            business=business,
            invitation_id=invitation_id,
            actor=request.user,
        )
        return success_response(
            StaffInvitationSerializer(invitation).data,
            request_id=getattr(request, "request_id", None),
        )


class AcceptInvitationView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Staff Invitations"],
        request=AcceptInvitationSerializer,
        description="Accept a staff invitation using the invitation token.",
    )
    def post(self, request: Request) -> Response:
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = StaffInvitationService().accept_invitation(
            token=str(serializer.validated_data["token"]),
            password=serializer.validated_data.get("password") or None,
            first_name=serializer.validated_data.get("first_name", ""),
            last_name=serializer.validated_data.get("last_name", ""),
        )
        return success_response(result, request_id=getattr(request, "request_id", None))
