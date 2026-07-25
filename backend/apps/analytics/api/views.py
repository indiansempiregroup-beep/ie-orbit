from __future__ import annotations

from datetime import date, timedelta

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from apps.analytics.services.analytics import AnalyticsService
from apps.bookings.models import Booking
from apps.businesses.models import Business
from apps.common.api.responses import success_response


def _resolve_business(request: Request) -> Business | None:
    business = getattr(request, "current_business", None)
    if business is None and getattr(request, "current_tenant", None) is not None:
        business = Business.objects.require_tenant(request.current_tenant).order_by("created_at").first()
    return business


def _parse_dates(request: Request) -> tuple[date | None, date | None]:
    start_date = request.query_params.get("start_date")
    end_date = request.query_params.get("end_date")
    parsed_start = date.fromisoformat(start_date) if start_date else None
    parsed_end = date.fromisoformat(end_date) if end_date else None
    return parsed_start, parsed_end


class AnalyticsViewSet(viewsets.ViewSet):
    service = AnalyticsService()

    @extend_schema(tags=["Analytics"], responses={200: dict})
    def list(self, request: Request) -> Response:
        return self.summary(request)

    @extend_schema(tags=["Analytics"], responses={200: dict})
    def summary(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business = _resolve_business(request)
        result = self.service.summary(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))


class BIViewSet(viewsets.ViewSet):
    service = AnalyticsService()

    @extend_schema(tags=["BI"], responses={200: dict})
    def overview(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business = _resolve_business(request)
        if parsed_start is None or parsed_end is None:
            parsed_end = timezone.now().date()
            parsed_start = parsed_end.replace(day=1)
        result = self.service.reports(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def revenue(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business = _resolve_business(request)
        result = self.service.revenue(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def trends(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business = _resolve_business(request)
        if parsed_start is None or parsed_end is None:
            parsed_end = timezone.now().date()
            parsed_start = parsed_end - timedelta(days=29)
        result = self.service.trends(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def forecast(self, request: Request) -> Response:
        business = _resolve_business(request)
        horizon_days = int(request.query_params.get("horizon_days", "30"))
        result = self.service.forecast(
            tenant=request.current_tenant,
            business=business,
            horizon_days=horizon_days,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def growth(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business = _resolve_business(request)
        if parsed_start is None or parsed_end is None:
            parsed_end = timezone.now().date()
            parsed_start = parsed_end - timedelta(days=29)
        result = self.service.growth(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def operations(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business = _resolve_business(request)
        if parsed_start is None or parsed_end is None:
            parsed_end = timezone.now().date()
            parsed_start = parsed_end - timedelta(days=29)
        result = self.service.operations(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def reports(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business = _resolve_business(request)
        result = self.service.reports(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))


class DashboardViewSet(viewsets.ViewSet):
    @extend_schema(tags=["Dashboard"], responses={200: dict})
    def summary(self, request: Request) -> Response:
        business = _resolve_business(request)
        today = timezone.now().date()
        queryset = Booking.objects.require_tenant(request.current_tenant).filter(
            business=business,
            appointment_date=today,
        )
        result = {"today_count": queryset.count()}
        return success_response(result, request_id=getattr(request, "request_id", None))
