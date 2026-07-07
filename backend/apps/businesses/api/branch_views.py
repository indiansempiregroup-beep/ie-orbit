from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from apps.businesses.api.branch_serializers import BranchSerializer
from apps.businesses.api.permissions import BusinessAccessPermission
from apps.businesses.api.views import BusinessViewSet
from apps.businesses.services.branches import BranchService
from apps.common.api.responses import success_response


class BranchViewSet(viewsets.ViewSet):
    permission_classes = [BusinessAccessPermission]
    serializer_class = BranchSerializer
    business_viewset = BusinessViewSet()
    service = BranchService()

    def _business(self, request: Request, business_id: str):
        return self.business_viewset.get_object(request=request, business_id=business_id)

    @extend_schema(tags=["Branches"], responses={200: BranchSerializer(many=True)})
    def list(self, request: Request, business_pk: str | None = None) -> Response:
        business = self._business(request, business_pk or "")
        branches = self.service.list_branches(tenant=request.current_tenant, business=business)
        return success_response(
            BranchSerializer(branches, many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Branches"], request=BranchSerializer, responses={201: BranchSerializer})
    def create(self, request: Request, business_pk: str | None = None) -> Response:
        business = self._business(request, business_pk or "")
        serializer = BranchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        branch = self.service.create_branch(
            business=business,
            data=dict(serializer.validated_data),
            actor=request.user,
        )
        return success_response(
            BranchSerializer(branch).data,
            status_code=status.HTTP_201_CREATED,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Branches"], responses={200: BranchSerializer})
    def retrieve(self, request: Request, business_pk: str | None = None, pk: str | None = None) -> Response:
        business = self._business(request, business_pk or "")
        branch = self.service.repository.get_for_business(
            tenant=request.current_tenant,
            business_id=str(business.id),
            branch_id=pk or "",
        )
        return success_response(
            BranchSerializer(branch).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Branches"], request=BranchSerializer, responses={200: BranchSerializer})
    def partial_update(self, request: Request, business_pk: str | None = None, pk: str | None = None) -> Response:
        business = self._business(request, business_pk or "")
        branch = self.service.repository.get_for_business(
            tenant=request.current_tenant,
            business_id=str(business.id),
            branch_id=pk or "",
        )
        serializer = BranchSerializer(branch, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        branch = self.service.update_branch(
            branch=branch,
            data=dict(serializer.validated_data),
            actor=request.user,
        )
        return success_response(
            BranchSerializer(branch).data,
            request_id=getattr(request, "request_id", None),
        )
