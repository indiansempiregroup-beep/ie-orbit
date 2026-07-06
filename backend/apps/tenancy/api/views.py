from __future__ import annotations

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

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
