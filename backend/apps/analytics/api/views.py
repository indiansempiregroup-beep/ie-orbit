from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

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
    BI_FEATURE_PROFIT,
    BI_FEATURE_REPORTS,
    BI_FEATURE_REVENUE,
    PRODUCT_APPOINTIE,
    PRODUCT_SHOPIE,
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


def _default_period(business: Business | None, start_date: date | None, end_date: date | None) -> tuple[date, date]:
    if start_date is not None and end_date is not None:
        return start_date, end_date
    today = AnalyticsService().business_local_date(business)
    resolved_end = end_date or today
    resolved_start = start_date or (resolved_end - timedelta(days=29))
    return resolved_start, resolved_end


def _parse_staff_id(request: Request) -> UUID | None:
    raw = request.query_params.get("staff_id") or request.query_params.get("staff")
    if not raw:
        return None
    try:
        value = UUID(str(raw))
    except (TypeError, ValueError):
        return None
    tenant = getattr(request, "current_tenant", None)
    if not is_workspace_manager_or_above(user=request.user, tenant=tenant):
        return None
    return value


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
            staff_id=_parse_staff_id(request),
        )
        return success_response(result, request_id=getattr(request, "request_id", None))


class BIViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]
    service = AnalyticsService()
    entitlements = EntitlementService()

    def initial(self, request: Request, *args, **kwargs) -> None:
        super().initial(request, *args, **kwargs)
        _require_manager_reports_access(request)

    def _require_bi_feature(
        self,
        request: Request,
        feature: str,
        *,
        product_code: str | None = None,
    ) -> tuple[Business | None, list[str]]:
        business = _resolve_business(request)
        products: list[str] = []
        if business is not None:
            products = self.entitlements.ensure_bi_feature(
                business=business,
                feature=feature,
                product_code=product_code,
            )
        return business, products

    @extend_schema(tags=["BI"], responses={200: dict})
    def overview(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business, products = self._require_bi_feature(request, BI_FEATURE_OVERVIEW)
        parsed_start, parsed_end = _default_period(business, parsed_start, parsed_end)
        result = self.service.product_aware_overview(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
            staff_id=_parse_staff_id(request),
            product_codes=products,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def profit(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business, products = self._require_bi_feature(request, BI_FEATURE_PROFIT)
        parsed_start, parsed_end = _default_period(business, parsed_start, parsed_end)
        result: dict = {"products": products, "appointie": None}
        if business is not None and PRODUCT_APPOINTIE in products:
            result["appointie"] = self.service.appointie_profit(
                tenant=request.current_tenant,
                business=business,
                start_date=parsed_start,
                end_date=parsed_end,
                staff_id=_parse_staff_id(request),
            )
        return success_response(result, request_id=getattr(request, "request_id", None))

    def _product_sections(
        self,
        request: Request,
        feature: str,
        *,
        appointie_fn,
        shopie_fn,
        extra: dict | None = None,
    ) -> tuple[Business | None, dict]:
        parsed_start, parsed_end = _parse_dates(request)
        business, products = self._require_bi_feature(request, feature)
        parsed_start, parsed_end = _default_period(business, parsed_start, parsed_end)
        staff_id = _parse_staff_id(request)
        result: dict = {"products": products, "appointie": None, "shopie": None}
        if extra:
            result.update(extra)
        kwargs = {
            "tenant": request.current_tenant,
            "business": business,
            "staff_id": staff_id,
        }
        if business is not None and PRODUCT_APPOINTIE in products:
            appointie = appointie_fn(start_date=parsed_start, end_date=parsed_end, **kwargs)
            result["appointie"] = appointie
            if isinstance(appointie, dict):
                result.update(appointie)
        if business is not None and PRODUCT_SHOPIE in products:
            result["shopie"] = shopie_fn(start_date=parsed_start, end_date=parsed_end, **kwargs)
        return business, result

    @extend_schema(tags=["BI"], responses={200: dict})
    def revenue(self, request: Request) -> Response:
        _business, result = self._product_sections(
            request,
            BI_FEATURE_REVENUE,
            appointie_fn=self.service.revenue,
            shopie_fn=self.service.shopie_revenue,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def trends(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business, products = self._require_bi_feature(request, BI_FEATURE_REVENUE)
        parsed_start, parsed_end = _default_period(business, parsed_start, parsed_end)
        result: dict = {"products": products, "appointie": None, "shopie": None}
        if business is not None and PRODUCT_APPOINTIE in products:
            appointie = self.service.trends(
                tenant=request.current_tenant,
                business=business,
                start_date=parsed_start,
                end_date=parsed_end,
                staff_id=_parse_staff_id(request),
            )
            result["appointie"] = appointie
            result.update(appointie)
        if business is not None and PRODUCT_SHOPIE in products:
            overview = self.service._shopie_overview(
                tenant=request.current_tenant,
                business=business,
                start_date=parsed_start,
                end_date=parsed_end,
                staff_id=_parse_staff_id(request),
            )
            result["shopie"] = {
                "rows": overview.get("trend") or [],
                "period": overview.get("period"),
            }
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def forecast(self, request: Request) -> Response:
        horizon_days = int(request.query_params.get("horizon_days", "30"))
        business, products = self._require_bi_feature(request, BI_FEATURE_FORECAST)
        result: dict = {"products": products, "appointie": None, "shopie": None}
        if business is not None and PRODUCT_APPOINTIE in products:
            appointie = self.service.forecast(
                tenant=request.current_tenant,
                business=business,
                horizon_days=horizon_days,
                staff_id=_parse_staff_id(request),
            )
            result["appointie"] = appointie
            result.update(appointie)
        if business is not None and PRODUCT_SHOPIE in products:
            result["shopie"] = self.service.shopie_forecast(
                tenant=request.current_tenant,
                business=business,
                horizon_days=horizon_days,
                staff_id=_parse_staff_id(request),
            )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def growth(self, request: Request) -> Response:
        _business, result = self._product_sections(
            request,
            BI_FEATURE_GROWTH,
            appointie_fn=self.service.growth,
            shopie_fn=self.service.shopie_growth,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def operations(self, request: Request) -> Response:
        parsed_start, parsed_end = _parse_dates(request)
        business, _products = self._require_bi_feature(
            request, BI_FEATURE_REPORTS, product_code=PRODUCT_APPOINTIE
        )
        parsed_start, parsed_end = _default_period(business, parsed_start, parsed_end)
        result = self.service.operations(
            tenant=request.current_tenant,
            business=business,
            start_date=parsed_start,
            end_date=parsed_end,
            staff_id=_parse_staff_id(request),
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["BI"], responses={200: dict})
    def reports(self, request: Request) -> Response:
        _business, result = self._product_sections(
            request,
            BI_FEATURE_REPORTS,
            appointie_fn=self.service.reports,
            shopie_fn=self.service.shopie_reports,
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
        today = self.service.business_local_date(business)
        staff_id = _parse_staff_id(request)
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
            queryset = self.service._apply_staff_filter(queryset, staff_id)
            today_count = queryset.count()
        result = self.service.dashboard_summary(
            tenant=request.current_tenant,
            business=business,
            today_count=today_count,
            user=request.user,
            staff_id=staff_id,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))
