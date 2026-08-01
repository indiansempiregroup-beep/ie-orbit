from __future__ import annotations

from datetime import date, timedelta

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.analytics.services.analytics import AnalyticsService
from apps.bookings.models import Booking
from apps.businesses.constants import (
    BI_FEATURE_FORECAST,
    BI_FEATURE_GROWTH,
    BI_FEATURE_OVERVIEW,
    BI_FEATURE_REPORTS,
    BI_FEATURE_REVENUE,
)
from apps.businesses.models import Business
from apps.businesses.services.entitlements import EntitlementService
from apps.common.api.responses import success_response
from apps.common.utils.workspace_access import (
    is_workspace_manager_or_above,
    scope_bookings_queryset_for_user,
)


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


def _require_manager_reports_access(request: Request) -> None:
    if not request.user or not request.user.is_authenticated:
        raise PermissionDenied("Authentication is required.")
    if not getattr(request, "current_tenant", None):
        raise PermissionDenied("A tenant context is required.")
    if not is_workspace_manager_or_above(user=request.user, tenant=request.current_tenant):
        raise PermissionDenied("Reports are available to managers and owners only.")


class AnalyticsViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]
    service = AnalyticsService()

    @extend_schema(tags=["Analytics"], responses={200: dict})
    def list(self, request: Request) -> Response:
        return self.summary(request)

    @extend_schema(tags=["Analytics"], responses={200: dict})
    def summary(self, request: Request) -> Response:
        _require_manager_reports_access(request)
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
    permission_classes = [IsAuthenticated]
    service = AnalyticsService()
    entitlements = EntitlementService()

    def initial(self, request: Request, *args, **kwargs) -> None:
        super().initial(request, *args, **kwargs)
        _require_manager_reports_access(request)

    def _require_bi_feature(self, request: Request, feature: str) -> Business | None:
        business = _resolve_business(request)
        if business is not None:
            self.entitlements.ensure_bi_feature(business=business, feature=feature)
        return business

    @extend_schema(tags=["BI"], responses={200: dict})
    def overview(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business = self._require_bi_feature(request, BI_FEATURE_OVERVIEW)
        if parsed_start is None or parsed_end is None:
            parsed_end = timezone.now().date()
            parsed_start = parsed_end - timedelta(days=29)
        result = self.service.product_aware_overview(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def revenue(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business = self._require_bi_feature(request, BI_FEATURE_REVENUE)
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
        business = self._require_bi_feature(request, BI_FEATURE_REVENUE)
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
        business = self._require_bi_feature(request, BI_FEATURE_FORECAST)
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
        business = self._require_bi_feature(request, BI_FEATURE_GROWTH)
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
        business = self._require_bi_feature(request, BI_FEATURE_REPORTS)
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
        business = self._require_bi_feature(request, BI_FEATURE_REPORTS)
        result = self.service.reports(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))


class DashboardViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]
    service = AnalyticsService()

    @extend_schema(tags=["Dashboard"], responses={200: dict})
    def summary(self, request: Request) -> Response:
        if not getattr(request, "current_tenant", None):
            raise PermissionDenied("A tenant context is required.")
        business = _resolve_business(request)
        today = timezone.now().date()
        today_count = 0
        if business is not None:
            queryset = Booking.objects.require_tenant(request.current_tenant).filter(
                business=business,
                appointment_date=today,
            )
            queryset = scope_bookings_queryset_for_user(
                queryset,
                tenant=request.current_tenant,
                user=request.user,
            )
            today_count = queryset.count()
        result = self.service.dashboard_summary(
            tenant=request.current_tenant,
            business=business,
            today_count=today_count,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))
