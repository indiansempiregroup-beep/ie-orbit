from __future__ import annotations

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status, viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from apps.common.api.responses import success_response
from apps.common.pagination.helpers import paginated_list_response
from apps.staff.api.permissions import StaffAccessPermission
from apps.staff.api.serializers import (
    StaffSerializer,
    StaffServiceAssignmentSerializer,
    StaffSkillSerializer,
)
from apps.staff.models import Staff
from apps.staff.repositories import StaffRepository
from apps.staff.services import StaffManagementService, StaffSearchService


class StaffViewSet(viewsets.ViewSet):
    permission_classes = [StaffAccessPermission]
    serializer_class = StaffSerializer
    repository = StaffRepository()
    management_service = StaffManagementService(repository=repository)
    search_service = StaffSearchService(repository=repository)

    @extend_schema(
        tags=["Staff"],
        parameters=[
            OpenApiParameter(
                "q", str, description="Search name, email, phone, code, or designation."
            ),
            OpenApiParameter("business", str, description="Business UUID."),
            OpenApiParameter("status", str, description="Employment status."),
            OpenApiParameter("department", str, description="Department."),
            OpenApiParameter("tags", str, description="Comma-separated tags."),
        ],
        responses={200: StaffSerializer(many=True)},
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
            StaffSerializer,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Staff"], request=StaffSerializer, responses={201: StaffSerializer})
    def create(self, request: Request) -> Response:
        serializer = StaffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = self.management_service.create_staff(
            data=dict(serializer.validated_data),
            tenant=request.current_tenant,
            actor=request.user,
        )
        return success_response(
            StaffSerializer(staff).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Staff"], responses={200: StaffSerializer})
    def retrieve(self, request: Request, pk: str | None = None) -> Response:
        staff = self.get_object(request=request, staff_id=pk)
        self.management_service.ensure_foundation_records(staff)
        return success_response(
            StaffSerializer(staff).data, request_id=getattr(request, "request_id", None)
        )

    @extend_schema(tags=["Staff"], request=StaffSerializer, responses={200: StaffSerializer})
    def partial_update(self, request: Request, pk: str | None = None) -> Response:
        staff = self.get_object(request=request, staff_id=pk)
        serializer = StaffSerializer(staff, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        staff = self.management_service.update_staff(
            staff=staff,
            data=dict(serializer.validated_data),
            actor=request.user,
        )
        return success_response(
            StaffSerializer(staff).data, request_id=getattr(request, "request_id", None)
        )

    @extend_schema(tags=["Staff"], responses={204: OpenApiResponse(description="Staff archived.")})
    def destroy(self, request: Request, pk: str | None = None) -> Response:
        staff = self.get_object(request=request, staff_id=pk)
        staff.soft_delete(deleted_by=request.user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_object(self, *, request: Request, staff_id: str | None) -> Staff:
        staff = get_object_or_404(
            self.repository.list_for_request(tenant=request.current_tenant, user=request.user),
            id=staff_id,
        )
        self.check_object_permissions(request, staff)
        return staff


class StaffSkillViewSet(viewsets.ViewSet):
    permission_classes = [StaffAccessPermission]
    repository = StaffRepository()
    management_service = StaffManagementService(repository=repository)

    @extend_schema(tags=["Staff Skills"], responses={200: StaffSkillSerializer(many=True)})
    def list(self, request: Request) -> Response:
        queryset = self.repository.list_skills(tenant=request.current_tenant, user=request.user)
        staff_id = request.query_params.get("staff")
        service_id = request.query_params.get("service")
        if staff_id:
            queryset = queryset.filter(staff_id=staff_id)
        if service_id:
            queryset = queryset.filter(service_id=service_id)
        return success_response(
            StaffSkillSerializer(queryset, many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Staff Skills"], request=StaffSkillSerializer, responses={201: StaffSkillSerializer}
    )
    def create(self, request: Request) -> Response:
        serializer = StaffSkillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        skill = self.management_service.assign_skill(
            data=dict(serializer.validated_data),
            tenant=request.current_tenant,
        )
        return success_response(
            StaffSkillSerializer(skill).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )


class StaffServiceAssignmentViewSet(viewsets.ViewSet):
    permission_classes = [StaffAccessPermission]
    repository = StaffRepository()
    management_service = StaffManagementService(repository=repository)

    @extend_schema(
        tags=["Staff Assignments"], responses={200: StaffServiceAssignmentSerializer(many=True)}
    )
    def list(self, request: Request) -> Response:
        queryset = self.repository.list_assignments(
            tenant=request.current_tenant, user=request.user
        )
        staff_id = request.query_params.get("staff")
        service_id = request.query_params.get("service")
        if staff_id:
            queryset = queryset.filter(staff_id=staff_id)
        if service_id:
            queryset = queryset.filter(service_id=service_id)
        return success_response(
            StaffServiceAssignmentSerializer(queryset, many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(
        tags=["Staff Assignments"],
        request=StaffServiceAssignmentSerializer,
        responses={201: StaffServiceAssignmentSerializer},
    )
    def create(self, request: Request) -> Response:
        serializer = StaffServiceAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = self.management_service.assign_service(
            data=dict(serializer.validated_data),
            tenant=request.current_tenant,
        )
        return success_response(
            StaffServiceAssignmentSerializer(assignment).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )
