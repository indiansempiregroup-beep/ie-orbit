from __future__ import annotations

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status, viewsets
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from apps.businesses.api.permissions import BusinessAccessPermission
from apps.businesses.api.serializers import BusinessSerializer
from apps.businesses.models import Business
from apps.businesses.repositories import BusinessRepository
from apps.businesses.services import BusinessSearchService, BusinessService
from apps.common.api.responses import success_response


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
        return success_response(
            BusinessSerializer(queryset, many=True).data,
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
            raise NotFound("No business exists for the current tenant.")
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
            raise NotFound("No business exists for the current tenant.")
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

    def get_object(self, *, request: Request, business_id: str | None) -> Business:
        queryset = self.repository.list_for_request(
            tenant=request.current_tenant, user=request.user
        )
        business = get_object_or_404(queryset, id=business_id)
        self.check_object_permissions(request, business)
        self.service.ensure_foundation_records(business)
        return business
