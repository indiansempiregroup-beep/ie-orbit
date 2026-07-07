from __future__ import annotations

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status, viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response
from apps.services.api.permissions import ServiceCatalogPermission
from apps.services.api.serializers import (
    ServiceCategorySerializer,
    ServiceSerializer,
    ServiceTagSerializer,
)
from apps.services.models import Service, ServiceTag
from apps.services.repositories import ServiceRepository
from apps.services.services import ServiceCatalogService, ServiceSearchService


class ServiceCategoryViewSet(viewsets.ViewSet):
    permission_classes = [ServiceCatalogPermission]
    repository = ServiceRepository()
    catalog_service = ServiceCatalogService(repository=repository)

    @extend_schema(
        tags=["Service Categories"], responses={200: ServiceCategorySerializer(many=True)}
    )
    def list(self, request: Request) -> Response:
        queryset = self.repository.list_categories(tenant=request.current_tenant, user=request.user)
        business_id = request.query_params.get("business")
        if business_id:
            queryset = queryset.filter(business_id=business_id)
        return success_response(
            ServiceCategorySerializer(queryset, many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Service Categories"],
        request=ServiceCategorySerializer,
        responses={201: ServiceCategorySerializer},
    )
    def create(self, request: Request) -> Response:
        serializer = ServiceCategorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = self.catalog_service.create_category(
            data=dict(serializer.validated_data),
            tenant=request.current_tenant,
            actor=request.user,
        )
        return success_response(
            ServiceCategorySerializer(category).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Service Categories"],
        request=ServiceCategorySerializer,
        responses={200: ServiceCategorySerializer},
    )
    def partial_update(self, request: Request, pk: str | None = None) -> Response:
        category = get_object_or_404(
            self.repository.list_categories(tenant=request.current_tenant, user=request.user),
            id=pk,
        )
        self.check_object_permissions(request, category)
        serializer = ServiceCategorySerializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        category = self.catalog_service.update_category(
            category=category,
            data=dict(serializer.validated_data),
            actor=request.user,
        )
        return success_response(
            ServiceCategorySerializer(category).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Service Categories"],
        responses={204: OpenApiResponse(description="Category archived.")},
    )
    def destroy(self, request: Request, pk: str | None = None) -> Response:
        category = get_object_or_404(
            self.repository.list_categories(tenant=request.current_tenant, user=request.user),
            id=pk,
        )
        self.check_object_permissions(request, category)
        category.soft_delete(deleted_by=request.user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ServiceViewSet(viewsets.ViewSet):
    permission_classes = [ServiceCatalogPermission]
    serializer_class = ServiceSerializer
    repository = ServiceRepository()
    catalog_service = ServiceCatalogService(repository=repository)
    search_service = ServiceSearchService(repository=repository)

    @extend_schema(
        tags=["Services"],
        parameters=[
            OpenApiParameter(
                "q", str, description="Search service name, code, category, or description."
            ),
            OpenApiParameter("business", str, description="Business UUID."),
            OpenApiParameter("category", str, description="Category UUID."),
            OpenApiParameter("status", str, description="Service status."),
            OpenApiParameter("visibility", str, description="Service visibility."),
            OpenApiParameter("tags", str, description="Comma-separated tags."),
        ],
        responses={200: ServiceSerializer(many=True)},
    )
    def list(self, request: Request) -> Response:
        queryset = self.search_service.search(
            tenant=request.current_tenant,
            user=request.user,
            params=request.query_params,
            request=request,
        )
        return paginated_list_response(
            request,
            queryset,
            ServiceSerializer,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Services"], request=ServiceSerializer, responses={201: ServiceSerializer})
    def create(self, request: Request) -> Response:
        serializer = ServiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = self.catalog_service.create_service(
            data=dict(serializer.validated_data),
            tenant=request.current_tenant,
            actor=request.user,
        )
        return success_response(
            ServiceSerializer(service).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Services"], responses={200: ServiceSerializer})
    def retrieve(self, request: Request, pk: str | None = None) -> Response:
        service = self.get_object(request=request, service_id=pk)
        self.catalog_service.ensure_foundation_records(service)
        return success_response(
            ServiceSerializer(service).data, request_id=getattr(request, "request_id", None)
        )

    @extend_schema(tags=["Services"], request=ServiceSerializer, responses={200: ServiceSerializer})
    def partial_update(self, request: Request, pk: str | None = None) -> Response:
        service = self.get_object(request=request, service_id=pk)
        serializer = ServiceSerializer(service, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        service = self.catalog_service.update_service(
            service=service,
            data=dict(serializer.validated_data),
            actor=request.user,
        )
        return success_response(
            ServiceSerializer(service).data, request_id=getattr(request, "request_id", None)
        )

    @extend_schema(
        tags=["Services"], responses={204: OpenApiResponse(description="Service archived.")}
    )
    def destroy(self, request: Request, pk: str | None = None) -> Response:
        service = self.get_object(request=request, service_id=pk)
        service.soft_delete(deleted_by=request.user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_object(self, *, request: Request, service_id: str | None) -> Service:
        service = get_object_or_404(
            self.repository.list_for_request(tenant=request.current_tenant, user=request.user),
            id=service_id,
        )
        self.check_object_permissions(request, service)
        return service


class ServiceTagViewSet(viewsets.ViewSet):
    permission_classes = [ServiceCatalogPermission]
    repository = ServiceRepository()

    @extend_schema(tags=["Service Tags"], responses={200: ServiceTagSerializer(many=True)})
    def list(self, request: Request) -> Response:
        queryset = self.repository.list_tags(
            tenant=request.current_tenant,
            user=request.user,
            business_id=request.query_params.get("business", ""),
        )
        return success_response(
            ServiceTagSerializer(queryset, many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Service Tags"], request=ServiceTagSerializer, responses={201: ServiceTagSerializer}
    )
    def create(self, request: Request) -> Response:
        serializer = ServiceTagSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tag = ServiceTag(tenant=request.current_tenant, **serializer.validated_data)
        tag.full_clean()
        tag.save()
        return success_response(
            ServiceTagSerializer(tag).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )
