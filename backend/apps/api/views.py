from __future__ import annotations

from django.conf import settings
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.api.responses import success_response
from apps.common.constants import API_VERSION, SERVICE_NAME
from apps.common.health.checks import platform_health
from apps.customers.api.serializers import CustomerSerializer
from apps.customers.services import CustomerSearchService
from apps.services.api.serializers import ServiceSerializer
from apps.services.services import ServiceSearchService
from apps.staff.api.serializers import StaffSerializer
from apps.staff.services import StaffSearchService


class HealthSerializer(serializers.Serializer):
    pass


class HealthView(APIView):
    authentication_classes = []
    permission_classes = []
    serializer_class = HealthSerializer

    def get(self, request: Request) -> Response:
        components = platform_health()
        is_liveness = request.path.rstrip("/").endswith("liveness")
        is_readiness = request.path.rstrip("/").endswith("readiness")

        if is_liveness:
            overall_status = "ok"
            payload = {
                "status": overall_status,
                "service": SERVICE_NAME,
                "version": API_VERSION,
                "environment": settings.ENV.name,
                "checks": ["application"],
                "components": {
                    "application": components["application"],
                },
            }
        else:
            overall_status = "ok"
            if any(component["status"] == "error" for component in components.values()):
                overall_status = "degraded"
            elif any(component["status"] == "degraded" for component in components.values()):
                overall_status = "degraded"

            payload = {
                "status": overall_status,
                "service": SERVICE_NAME,
                "version": API_VERSION,
                "environment": settings.ENV.name,
                "components": components,
            }
            if is_readiness:
                payload["checks"] = ["database", "redis", "celery"]

        return success_response(
            payload,
            request_id=getattr(request, "request_id", request.headers.get("X-Request-ID")),
        )


class OperationsSearchSerializer(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=True)
    business = serializers.UUIDField(required=False)
    status = serializers.CharField(required=False, allow_blank=True)
    tags = serializers.CharField(required=False, allow_blank=True)


class OperationsSearchView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OperationsSearchSerializer
    customer_search = CustomerSearchService()
    service_search = ServiceSearchService()
    staff_search = StaffSearchService()

    @extend_schema(
        tags=["Business Operations Search"],
        parameters=[
            OpenApiParameter(
                "q", str, description="Search by name, email, phone, category, or code."
            ),
            OpenApiParameter("business", str, description="Business UUID."),
            OpenApiParameter("status", str, description="Domain status filter."),
            OpenApiParameter("tags", str, description="Comma-separated tags."),
        ],
        responses={200: OperationsSearchSerializer},
        description="Search customers, services, and staff within the current tenant.",
    )
    def get(self, request: Request) -> Response:
        serializer = OperationsSearchSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        customers = self.customer_search.search(
            tenant=request.current_tenant,
            user=request.user,
            params=request.query_params,
            request=request,
        )[:20]
        services = self.service_search.search(
            tenant=request.current_tenant,
            user=request.user,
            params=request.query_params,
            request=request,
        )[:20]
        staff = self.staff_search.search(
            tenant=request.current_tenant,
            user=request.user,
            params=request.query_params,
            request=request,
        )[:20]
        return success_response(
            {
                "customers": CustomerSerializer(customers, many=True).data,
                "services": ServiceSerializer(services, many=True).data,
                "staff": StaffSerializer(staff, many=True).data,
            },
            request_id=getattr(request, "request_id", None),
        )
