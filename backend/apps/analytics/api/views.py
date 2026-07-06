from __future__ import annotations

from datetime import date

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from apps.analytics.services.analytics import AnalyticsService
from apps.bookings.models import Booking
from apps.businesses.models import Business
from apps.common.api.responses import success_response


class AnalyticsViewSet(viewsets.ViewSet):
    service = AnalyticsService()

    @extend_schema(tags=["Analytics"], responses={200: dict})
    def list(self, request: Request) -> Response:
        return self.summary(request)

    @extend_schema(tags=["Analytics"], responses={200: dict})
    def summary(self, request: Request) -> Response:
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        parsed_start = date.fromisoformat(start_date) if start_date else None
        parsed_end = date.fromisoformat(end_date) if end_date else None
        business = getattr(request, "current_business", None)
        if business is None and getattr(request, "current_tenant", None) is not None:
            business = Business.objects.require_tenant(request.current_tenant).order_by("created_at").first()
        result = self.service.summary(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))


class DashboardViewSet(viewsets.ViewSet):
    @extend_schema(tags=["Dashboard"], responses={200: dict})
    def summary(self, request: Request) -> Response:
        business = getattr(request, "current_business", None)
        if business is None and getattr(request, "current_tenant", None) is not None:
            business = Business.objects.require_tenant(request.current_tenant).order_by("created_at").first()
        today = timezone.now().date()
        queryset = Booking.objects.require_tenant(request.current_tenant).filter(
            business=business,
            appointment_date=today,
        )
        result = {"today_count": queryset.count()}
        return success_response(result, request_id=getattr(request, "request_id", None))
