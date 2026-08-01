from __future__ import annotations

from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status, viewsets
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from apps.businesses.api.permissions import BusinessAccessPermission
from apps.businesses.api.serializers import (
    BusinessAddonUpdateSerializer,
    BusinessProductPlanChangeSerializer,
    BusinessProductSubscribeSerializer,
    BusinessSerializer,
)
from apps.businesses.models import Business
from apps.businesses.repositories import BusinessRepository
from apps.businesses.services import BusinessSearchService, BusinessService
from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response


class BusinessViewSet(viewsets.ViewSet):
    permission_classes = [BusinessAccessPermission]
    serializer_class = BusinessSerializer
    repository = BusinessRepository()
    service = BusinessService(repository=repository)
    search_service = BusinessSearchService(repository=repository)

    @extend_schema(
        tags=["Businesses"],
        parameters=[
            OpenApiParameter("q", str, description="Search by business name or description."),
            OpenApiParameter("category", str, description="Filter by industry category."),
            OpenApiParameter("city", str, description="Filter by city."),
            OpenApiParameter("country", str, description="Filter by country."),
            OpenApiParameter("status", str, description="Filter by business status."),
            OpenApiParameter("tags", str, description="Comma-separated tag filter."),
        ],
        responses={200: BusinessSerializer(many=True)},
        description="List businesses for the current tenant.",
    )
    def list(self, request: Request) -> Response:
        queryset = self.search_service.search(
            tenant=request.current_tenant,
            user=request.user,
            params=request.query_params,
        )
        return paginated_list_response(
            request,
            queryset,
            BusinessSerializer,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Businesses"],
        request=BusinessSerializer,
        responses={201: BusinessSerializer},
        description="Create a business under the current tenant and organization.",
    )
    def create(self, request: Request) -> Response:
        organization = getattr(request, "current_organization", None)
        if not organization:
            raise NotFound("Current organization was not found for this tenant.")
        serializer = BusinessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = self.service.create_business(
            data=dict(serializer.validated_data),
            tenant=request.current_tenant,
            organization=organization,
            actor=request.user,
        )
        return success_response(
            BusinessSerializer(business).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Businesses"],
        responses={200: BusinessSerializer},
        description="Retrieve a business by UUID within the current tenant.",
    )
    def retrieve(self, request: Request, pk: str | None = None) -> Response:
        business = self.get_object(request=request, business_id=pk)
        return success_response(
            BusinessSerializer(business).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Businesses"],
        request=BusinessSerializer,
        responses={200: BusinessSerializer},
        description="Partially update a business by UUID within the current tenant.",
    )
    def partial_update(self, request: Request, pk: str | None = None) -> Response:
        business = self.get_object(request=request, business_id=pk)
        serializer = BusinessSerializer(business, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        business = self.service.update_business(
            business=business,
            data=dict(serializer.validated_data),
            actor=request.user,
        )
        return success_response(
            BusinessSerializer(business).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Businesses"],
        request=BusinessProductSubscribeSerializer,
        responses={200: BusinessSerializer},
        description="Subscribe the business to a product. Optionally set it as the active product.",
    )
    def subscribe_product(self, request: Request, pk: str | None = None) -> Response:
        business = self.get_object(request=request, business_id=pk)
        serializer = BusinessProductSubscribeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.service.subscribe_to_product(
            business=business,
            product_code=serializer.validated_data["product_code"],
            actor=request.user,
            set_active=serializer.validated_data.get("set_active", True),
            plan_code=serializer.validated_data.get("plan_code") or None,
        )
        business.refresh_from_db()
        business = self.repository.get_for_request(
            business_id=str(business.id),
            tenant=request.current_tenant,
            user=request.user,
        )
        return success_response(
            BusinessSerializer(business).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Businesses"],
        responses={200: BusinessSerializer},
        description="Cancel a business product subscription.",
    )
    def unsubscribe_product(
        self,
        request: Request,
        pk: str | None = None,
        product_code: str | None = None,
    ) -> Response:
        business = self.get_object(request=request, business_id=pk)
        business = self.service.unsubscribe_from_product(
            business=business,
            product_code=product_code or "",
            actor=request.user,
        )
        business = self.repository.get_for_request(
            business_id=str(business.id),
            tenant=request.current_tenant,
            user=request.user,
        )
        return success_response(
            BusinessSerializer(business).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Businesses"],
        request=BusinessProductPlanChangeSerializer,
        responses={200: BusinessSerializer},
        description="Change the billing plan for an active business product subscription.",
    )
    def change_product_plan(
        self,
        request: Request,
        pk: str | None = None,
        product_code: str | None = None,
    ) -> Response:
        business = self.get_object(request=request, business_id=pk)
        serializer = BusinessProductPlanChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.service.change_product_plan(
            business=business,
            product_code=product_code or "",
            plan_code=serializer.validated_data["plan_code"],
            actor=request.user,
            billing_interval=serializer.validated_data.get("billing_interval"),
            force_immediate=bool(serializer.validated_data.get("force_immediate")),
        )
        business = self.repository.get_for_request(
            business_id=str(business.id),
            tenant=request.current_tenant,
            user=request.user,
        )
        return success_response(
            {
                **BusinessSerializer(business).data,
                "billing": self.service.billing_snapshot(
                    business=business,
                    product_code=product_code,
                ),
            },
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Businesses"],
        responses={200: BusinessSerializer},
        description="Cancel a pending period-end plan change.",
    )
    def cancel_pending_plan_change(
        self,
        request: Request,
        pk: str | None = None,
        product_code: str | None = None,
    ) -> Response:
        business = self.get_object(request=request, business_id=pk)
        self.service.cancel_pending_plan_change(
            business=business,
            product_code=product_code or "",
            actor=request.user,
        )
        business = self.repository.get_for_request(
            business_id=str(business.id),
            tenant=request.current_tenant,
            user=request.user,
        )
        return success_response(
            {
                **BusinessSerializer(business).data,
                "billing": self.service.billing_snapshot(
                    business=business,
                    product_code=product_code,
                ),
            },
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Businesses"],
        request=BusinessAddonUpdateSerializer,
        responses={200: BusinessSerializer},
        description="Update self-serve staff/office add-ons for a product subscription.",
    )
    def update_product_addons(
        self,
        request: Request,
        pk: str | None = None,
        product_code: str | None = None,
    ) -> Response:
        business = self.get_object(request=request, business_id=pk)
        serializer = BusinessAddonUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.service.update_product_addons(
            business=business,
            product_code=product_code or "",
            extra_staff=serializer.validated_data["extra_staff"],
            extra_offices=serializer.validated_data["extra_offices"],
            pets_pack_enabled=serializer.validated_data.get("pets_pack_enabled"),
            actor=request.user,
        )
        business = self.repository.get_for_request(
            business_id=str(business.id),
            tenant=request.current_tenant,
            user=request.user,
        )
        return success_response(
            {
                **BusinessSerializer(business).data,
                "billing": self.service.billing_snapshot(
                    business=business,
                    product_code=product_code,
                ),
            },
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Businesses"],
        responses={200: dict},
        description="Billing entitlement snapshot for the business (limits, add-ons, pricing).",
    )
    def billing_snapshot(
        self,
        request: Request,
        pk: str | None = None,
    ) -> Response:
        business = self.get_object(request=request, business_id=pk)
        product_code = request.query_params.get("product_code")
        return success_response(
            self.service.billing_snapshot(business=business, product_code=product_code),
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Businesses"],
        responses={204: OpenApiResponse(description="Business soft deleted.")},
        description="Soft delete a business by UUID within the current tenant.",
    )
    def destroy(self, request: Request, pk: str | None = None) -> Response:
        business = self.get_object(request=request, business_id=pk)
        self.service.delete_business(business=business, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        tags=["Businesses"],
        responses={200: BusinessSerializer},
        description="Retrieve the current tenant default business.",
    )
    def me(self, request: Request) -> Response:
        business = self.repository.default_for_request(
            tenant=request.current_tenant,
            user=request.user,
        )
        if not business:
            business = self._create_default_business(request=request)
        self.check_object_permissions(request, business)
        self.service.ensure_foundation_records(business)
        return success_response(
            BusinessSerializer(business).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Businesses"],
        request=BusinessSerializer,
        responses={200: BusinessSerializer},
        description="Partially update the current tenant default business.",
    )
    def partial_update_me(self, request: Request) -> Response:
        business = self.repository.default_for_request(
            tenant=request.current_tenant,
            user=request.user,
        )
        if not business:
            business = self._create_default_business(request=request)
        self.check_object_permissions(request, business)
        serializer = BusinessSerializer(business, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        business = self.service.update_business(
            business=business,
            data=dict(serializer.validated_data),
            actor=request.user,
        )
        return success_response(
            BusinessSerializer(business).data,
            request_id=getattr(request, "request_id", None),
        )

    def _create_default_business(self, *, request: Request) -> Business:
        organization = getattr(request, "current_organization", None)
        if not organization:
            raise NotFound("Current organization was not found for this tenant.")

        payload = dict(request.data.items()) if hasattr(request.data, "items") else {}
        business_name = payload.get("business_name") or payload.get("display_name") or request.current_tenant.display_name
        display_name = payload.get("display_name") or business_name
        business_code = payload.get("business_code") or self._build_business_code(
            tenant=request.current_tenant,
            business_name=business_name,
        )

        created = self.service.create_business(
            data={
                "business_code": business_code,
                "business_name": business_name,
                "display_name": display_name,
                "business_type": payload.get("business_type", "service-business"),
                "organization": organization,
            },
            tenant=request.current_tenant,
            organization=organization,
            actor=request.user,
        )
        return created

    def _build_business_code(self, *, tenant: object, business_name: object) -> str:
        base = slugify(str(business_name or tenant.display_name or "business")) or "business"
        code = base[:60]
        suffix = 1
        while Business.objects.require_tenant(tenant).filter(business_code=code).exists():
            candidate = f"{base[:56]}-{suffix}"
            code = candidate[:60]
            suffix += 1
        return code

    def get_object(self, *, request: Request, business_id: str | None) -> Business:
        queryset = self.repository.list_for_request(
            tenant=request.current_tenant, user=request.user
        )
        business = get_object_or_404(queryset, id=business_id)
        self.check_object_permissions(request, business)
        self.service.ensure_foundation_records(business)
        return business
