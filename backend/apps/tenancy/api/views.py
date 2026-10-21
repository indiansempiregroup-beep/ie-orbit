from __future__ import annotations

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api.responses import success_response
from apps.tenancy.api.permissions import HasTenantContext, IsTenantOwnerOrPlatformAdmin
from apps.tenancy.api.serializers import (
    OrganizationSerializer,
    TenantSerializer,
    TenantSettingsSerializer,
)
from apps.tenancy.models import Organization, Tenant, TenantSettings
from apps.tenancy.repositories import TenantRepository
from apps.tenancy.services import TenantService
from apps.tenancy.services.role_menus import (
    save_role_menus,
    serialize_role_menus,
    validate_enabled_payload,
)


@extend_schema_view(
    get=extend_schema(
        tags=["Tenants"],
        responses={200: TenantSerializer(many=True)},
        description="List tenants visible to the authenticated platform user.",
    ),
    post=extend_schema(
        tags=["Tenants"],
        request=TenantSerializer,
        responses={201: TenantSerializer},
        description="Create a tenant and its foundation records.",
    ),
)
class TenantListCreateView(GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TenantSerializer
    repository = TenantRepository()
    service = TenantService(repository=repository)

    def get(self, request: Request) -> Response:
        tenants = self.repository.list_for_user(request.user)
        return success_response(
            TenantSerializer(tenants, many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    def post(self, request: Request) -> Response:
        serializer = TenantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tenant = self.service.create_tenant(
            data=dict(serializer.validated_data),
            actor=request.user,
        )
        return success_response(
            TenantSerializer(tenant).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


@extend_schema_view(
    get=extend_schema(
        tags=["Tenants"],
        responses={200: TenantSerializer},
        description="Retrieve a tenant by UUID.",
    ),
    patch=extend_schema(
        tags=["Tenants"],
        request=TenantSerializer,
        responses={200: TenantSerializer},
        description="Partially update a tenant by UUID.",
    ),
    delete=extend_schema(
        tags=["Tenants"],
        responses={204: OpenApiResponse(description="Tenant soft deleted.")},
        description="Soft delete a tenant by UUID.",
    ),
)
class TenantDetailView(GenericAPIView):
    permission_classes = [IsTenantOwnerOrPlatformAdmin]
    serializer_class = TenantSerializer
    repository = TenantRepository()
    service = TenantService(repository=repository)

    def get_object(self) -> Tenant:
        tenant = get_object_or_404(
            self.repository.list_for_user(self.request.user),
            id=self.kwargs["tenant_id"],
        )
        self.check_object_permissions(self.request, tenant)
        return tenant

    def get(self, request: Request, tenant_id: str) -> Response:
        tenant = self.get_object()
        return success_response(
            TenantSerializer(tenant).data,
            request_id=getattr(request, "request_id", None),
        )

    def patch(self, request: Request, tenant_id: str) -> Response:
        tenant = self.get_object()
        serializer = TenantSerializer(tenant, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        tenant = self.service.update_tenant(
            tenant=tenant,
            data=dict(serializer.validated_data),
            actor=request.user,
        )
        return success_response(
            TenantSerializer(tenant).data,
            request_id=getattr(request, "request_id", None),
        )

    def delete(self, request: Request, tenant_id: str) -> Response:
        tenant = self.get_object()
        self.service.delete_tenant(tenant=tenant, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    get=extend_schema(
        tags=["Organizations"],
        responses={200: OrganizationSerializer},
        description="Retrieve the current tenant organization.",
    ),
    patch=extend_schema(
        tags=["Organizations"],
        request=OrganizationSerializer,
        responses={200: OrganizationSerializer},
        description="Update the current tenant organization.",
    ),
)
class CurrentOrganizationView(GenericAPIView):
    permission_classes = [IsAuthenticated, HasTenantContext]
    serializer_class = OrganizationSerializer
    repository = TenantRepository()

    def get_object(self) -> Organization:
        organization = getattr(self.request, "current_organization", None)
        if organization:
            return organization
        return get_object_or_404(Organization.objects.for_tenant(self.request.current_tenant))

    def get(self, request: Request) -> Response:
        organization = self.get_object()
        self.repository.organization_settings(organization)
        return success_response(
            OrganizationSerializer(organization).data,
            request_id=getattr(request, "request_id", None),
        )

    def patch(self, request: Request) -> Response:
        organization = self.get_object()
        serializer = OrganizationSerializer(organization, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        self.repository.organization_settings(organization)
        return success_response(
            OrganizationSerializer(organization).data,
            request_id=getattr(request, "request_id", None),
        )


@extend_schema_view(
    get=extend_schema(
        tags=["Tenant Settings"],
        responses={200: TenantSettingsSerializer},
        description="Retrieve settings for the current tenant.",
    ),
    patch=extend_schema(
        tags=["Tenant Settings"],
        request=TenantSettingsSerializer,
        responses={200: TenantSettingsSerializer},
        description=(
            "Update settings, branding, and subscription foundation for the current tenant."
        ),
    ),
)
class TenantSettingsView(GenericAPIView):
    permission_classes = [IsAuthenticated, HasTenantContext]
    serializer_class = TenantSettingsSerializer
    repository = TenantRepository()

    def get_object(self) -> TenantSettings:
        return self.repository.tenant_settings(self.request.current_tenant)

    def get(self, request: Request) -> Response:
        settings = self.get_object()
        return success_response(
            TenantSettingsSerializer(settings).data,
            request_id=getattr(request, "request_id", None),
        )

    def patch(self, request: Request) -> Response:
        settings = self.get_object()
        serializer = TenantSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            TenantSettingsSerializer(settings).data,
            request_id=getattr(request, "request_id", None),
        )


def _request_role_codes(request: Request) -> list[str]:
    user = request.user
    if not user or not user.is_authenticated:
        return []
    codes = list(user.user_roles.filter(role__is_active=True).values_list("role__code", flat=True))
    tenant = getattr(request, "current_tenant", None)
    # Global business_owner must not bleed into another tenant's resolved menus.
    if tenant is not None and tenant.owner_id != user.id:
        codes = [code for code in codes if code != "business_owner"]
    return codes


def _can_manage_role_menus(request: Request) -> bool:
    user = request.user
    if not user or not user.is_authenticated:
        return False
    if getattr(user, "is_superuser", False):
        return True
    tenant = getattr(request, "current_tenant", None)
    if tenant and tenant.owner_id == user.id:
        return True
    return user.user_roles.filter(
        role__is_active=True,
        role__code__in={"platform_admin", "super_admin"},
    ).exists()


class RoleMenusView(APIView):
    permission_classes = [IsAuthenticated, HasTenantContext]

    @extend_schema(
        tags=["Tenant Settings"],
        description="Menus enabled for each workspace role, plus the catalog and current user's resolved set.",
    )
    def get(self, request: Request) -> Response:
        settings = TenantRepository().tenant_settings(request.current_tenant)
        payload = serialize_role_menus(settings, role_codes=_request_role_codes(request))
        payload["can_manage"] = _can_manage_role_menus(request)
        return success_response(
            payload,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Tenant Settings"],
        description="Business owners set which menus each role can see. Plan and permission gates still apply.",
    )
    def put(self, request: Request) -> Response:
        if not _can_manage_role_menus(request):
            raise PermissionDenied("Only the business owner can change role menus.")
        payload = request.data.get("enabled", request.data)
        enabled = validate_enabled_payload(payload)
        if not enabled:
            raise ValidationError({"enabled": "Provide at least one role to update."})
        settings = TenantRepository().tenant_settings(request.current_tenant)
        save_role_menus(settings, enabled)
        payload = serialize_role_menus(settings, role_codes=_request_role_codes(request))
        payload["can_manage"] = True
        return success_response(
            payload,
            request_id=getattr(request, "request_id", None),
        )
