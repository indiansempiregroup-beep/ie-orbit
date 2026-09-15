from __future__ import annotations

from datetime import date

from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics.services.platform_analytics import GRAINS, PlatformAnalyticsService
from apps.authentication.permissions import IsPlatformAdmin
from apps.common.api.responses import success_response


def _parse_date(value: str | None, field: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError({field: "Use YYYY-MM-DD."}) from exc


class PlatformAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]
    service = PlatformAnalyticsService()

    @extend_schema(
        tags=["Platform Admin"],
        description=(
            "Cross-tenant usage analytics: Orbit Appoint and Orbit Mart, "
            "day/week/month series, tenant and business rollups, and SKU/service catalog ranks."
        ),
        responses={200: dict},
    )
    def get(self, request: Request) -> Response:
        grain = (request.query_params.get("grain") or "day").strip().lower()
        if grain not in GRAINS:
            raise ValidationError({"grain": "Must be day, week, or month."})
        try:
            catalog_limit = int(request.query_params.get("catalog_limit") or 12)
        except (TypeError, ValueError) as exc:
            raise ValidationError({"catalog_limit": "Must be an integer."}) from exc
        result = self.service.overview(
            start_date=_parse_date(request.query_params.get("start_date"), "start_date"),
            end_date=_parse_date(request.query_params.get("end_date"), "end_date"),
            grain=grain,
            product_code=request.query_params.get("product_code"),
            tenant_id=request.query_params.get("tenant_id"),
            business_id=request.query_params.get("business_id"),
            catalog_limit=catalog_limit,
        )
        return success_response(result, request_id=getattr(request, "request_id", None))
