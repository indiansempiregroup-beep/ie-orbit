from __future__ import annotations

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.permissions import IsPlatformAdmin
from apps.businesses.api.white_label_serializers import (
    WhiteLabelProfileSerializer,
    WhiteLabelProfileUpsertSerializer,
)
from apps.businesses.models import Business, WhiteLabelProfile
from apps.businesses.services.entitlements import EntitlementService
from apps.businesses.services.white_label import ensure_white_label_profile, serialize_white_label_profile
from apps.common.api.responses import success_response
from apps.tenancy.models import Tenant


class PlatformWhiteLabelListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"], responses={200: WhiteLabelProfileSerializer(many=True)})
    def get(self, request: Request) -> Response:
        for business in Business.active_objects.select_related("tenant"):
            ensure_white_label_profile(business=business)
        profiles = (
            WhiteLabelProfile.active_objects.select_related("business", "tenant").order_by("app_name")
        )
        return success_response(
            WhiteLabelProfileSerializer(profiles, many=True).data,
            request_id=getattr(request, "request_id", None),
        )


class PlatformWhiteLabelDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def _get_business(self, business_id: str) -> Business:
        return get_object_or_404(Business.active_objects.select_related("tenant"), id=business_id)

    @extend_schema(tags=["Platform Admin"], responses={200: dict})
    def get(self, request: Request, business_id: str) -> Response:
        business = self._get_business(business_id)
        profile = ensure_white_label_profile(business=business)
        return success_response(
            serialize_white_label_profile(profile),
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Platform Admin"], request=WhiteLabelProfileUpsertSerializer, responses={200: dict})
    def patch(self, request: Request, business_id: str) -> Response:
        business = self._get_business(business_id)
        profile = ensure_white_label_profile(business=business)
        serializer = WhiteLabelProfileUpsertSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            serialize_white_label_profile(profile),
            request_id=getattr(request, "request_id", None),
        )


class PlatformTenantAdminListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request) -> Response:
        tenants = Tenant.objects.order_by("display_name")
        rows = []
        for tenant in tenants:
            business_count = Business.active_objects.filter(tenant=tenant).count()
            rows.append(
                {
                    "id": str(tenant.id),
                    "slug": tenant.slug,
                    "display_name": tenant.display_name,
                    "status": tenant.status,
                    "business_count": business_count,
                    "primary_color": tenant.primary_color,
                    "created_at": tenant.created_at.isoformat(),
                }
            )
        return success_response({"tenants": rows}, request_id=getattr(request, "request_id", None))


class PlatformTenantAdminDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    @extend_schema(tags=["Platform Admin"])
    def get(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        businesses = (
            Business.objects.filter(tenant=tenant)
            .select_related("white_label_profile")
            .prefetch_related("product_subscriptions__plan")
            .order_by("display_name")
        )
        entitlements = EntitlementService()
        business_rows = []
        for business in businesses:
            profile = getattr(business, "white_label_profile", None)
            billing = entitlements.billing_snapshot(
                business=business,
                product_code=business.selected_product or "appointie",
            )
            business_rows.append(
                {
                    "id": str(business.id),
                    "business_code": business.business_code,
                    "display_name": business.display_name,
                    "status": business.status,
                    "selected_product": business.selected_product,
                    "has_white_label_profile": profile is not None,
                    "flavor_key": profile.flavor_key if profile else None,
                    "billing": billing,
                }
            )
        return success_response(
            {
                "id": str(tenant.id),
                "slug": tenant.slug,
                "display_name": tenant.display_name,
                "status": tenant.status,
                "businesses": business_rows,
            },
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Platform Admin"])
    def patch(self, request: Request, tenant_id: str) -> Response:
        tenant = get_object_or_404(Tenant.objects.all(), id=tenant_id)
        status_value = request.data.get("status")
        if status_value:
            from apps.platform_admin.services import PlatformAdminService

            PlatformAdminService().set_tenant_status(
                tenant=tenant,
                status=status_value,
                actor=request.user,
                reason=request.data.get("reason") or f"status set to {status_value}",
            )
            tenant.refresh_from_db()
        return success_response(
            {
                "id": str(tenant.id),
                "slug": tenant.slug,
                "display_name": tenant.display_name,
                "status": tenant.status,
            },
            request_id=getattr(request, "request_id", None),
        )
