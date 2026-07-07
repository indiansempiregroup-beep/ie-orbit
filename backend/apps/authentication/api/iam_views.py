from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services.audit import record_audit
from apps.authentication.api.iam_serializers import (
    AssignRoleSerializer,
    PermissionSerializer,
    RoleSerializer,
    TenantMemberSerializer,
)
from apps.authentication.models import Permission, Role, User, UserRole
from apps.authentication.permissions import HasPlatformPermission
from apps.authentication.services.roles import RoleService
from apps.common.api.responses import success_response
from apps.staff.models import Staff


def _tenant_member_user_ids(request: Request) -> set[str]:
    tenant = request.current_tenant
    user_ids: set[str] = {str(tenant.owner_id)}
    user_ids.update(
        str(user_id)
        for user_id in Staff.objects.filter(tenant=tenant, user__isnull=False).values_list(
            "user_id", flat=True
        )
    )
    return user_ids


class RoleListView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "iam:user:read"

    @extend_schema(tags=["IAM"], responses={200: RoleSerializer(many=True)})
    def get(self, request: Request) -> Response:
        roles = Role.objects.filter(is_active=True).order_by("name")
        return success_response(
            RoleSerializer(roles, many=True).data,
            request_id=getattr(request, "request_id", None),
        )


class PermissionListView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "iam:user:read"

    @extend_schema(tags=["IAM"], responses={200: PermissionSerializer(many=True)})
    def get(self, request: Request) -> Response:
        permissions = Permission.objects.filter(is_active=True).order_by("resource", "action")
        return success_response(
            PermissionSerializer(permissions, many=True).data,
            request_id=getattr(request, "request_id", None),
        )


class TenantMemberListView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "iam:user:read"

    @extend_schema(tags=["IAM"], responses={200: TenantMemberSerializer(many=True)})
    def get(self, request: Request) -> Response:
        tenant = request.current_tenant
        user_ids = _tenant_member_user_ids(request)

        members = []
        for user in User.objects.filter(id__in=user_ids).order_by("email"):
            roles = [
                {"code": user_role.role.code, "name": user_role.role.name}
                for user_role in user.user_roles.select_related("role").filter(role__is_active=True)
            ]
            members.append(
                {
                    "id": user.id,
                    "email": user.email,
                    "full_name": user.full_name,
                    "roles": roles,
                }
            )

        return success_response(
            TenantMemberSerializer(members, many=True).data,
            request_id=getattr(request, "request_id", None),
        )


class MemberRoleAssignView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "iam:role:assign"

    @extend_schema(tags=["IAM"], request=AssignRoleSerializer)
    def post(self, request: Request, user_id: str) -> Response:
        serializer = AssignRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role_code = serializer.validated_data["role_code"]

        if role_code in {"super_admin", "platform_admin"}:
            raise ValidationError({"role_code": "This role cannot be assigned from the workspace."})

        if str(user_id) not in _tenant_member_user_ids(request):
            raise NotFound("User is not part of the current tenant.")

        user = User.objects.filter(id=user_id).first()
        if not user:
            raise NotFound("User was not found.")
        user_role = RoleService().assign_role(
            user=user,
            role_code=role_code,
            assigned_by=str(request.user.id),
        )
        record_audit(
            tenant=request.current_tenant,
            action="iam.role.assigned",
            resource_type="user",
            resource_id=str(user.id),
            actor_id=str(request.user.id),
            metadata={"role_code": role_code},
        )
        return success_response(
            {"user_id": str(user.id), "role_code": user_role.role.code},
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class MemberRoleRemoveView(APIView):
    permission_classes = [IsAuthenticated, HasPlatformPermission]
    required_permission = "iam:role:assign"

    @extend_schema(tags=["IAM"])
    def delete(self, request: Request, user_id: str, role_code: str) -> Response:
        if role_code in {"super_admin", "platform_admin", "business_owner"}:
            raise ValidationError({"role_code": "This role cannot be removed from the workspace."})
        if str(user_id) not in _tenant_member_user_ids(request):
            raise NotFound("User is not part of the current tenant.")

        deleted, _ = UserRole.objects.filter(
            user_id=user_id,
            role__code=role_code,
        ).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)

        record_audit(
            tenant=request.current_tenant,
            action="iam.role.removed",
            resource_type="user",
            resource_id=str(user_id),
            actor_id=str(request.user.id),
            metadata={"role_code": role_code},
        )
        return success_response(
            {"user_id": user_id, "role_code": role_code, "removed": True},
            request_id=getattr(request, "request_id", None),
        )
