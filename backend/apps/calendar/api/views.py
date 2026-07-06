from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from apps.calendar.api.serializers import CalendarConnectSerializer, CalendarStatusSerializer
from apps.calendar.services.google_calendar import GoogleCalendarService
from apps.common.api.responses import success_response


class CalendarViewSet(viewsets.ViewSet):
    service = GoogleCalendarService()

    @extend_schema(tags=["Calendar"], request=CalendarConnectSerializer, responses={200: CalendarStatusSerializer})
    def connect(self, request: Request) -> Response:
        serializer = CalendarConnectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = self.service.connect(
            tenant=request.current_tenant,
            business=request.current_business,
            data=dict(serializer.validated_data),
        )
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["Calendar"], responses={200: CalendarStatusSerializer})
    def disconnect(self, request: Request) -> Response:
        result = self.service.disconnect(tenant=request.current_tenant, business=request.current_business)
        return success_response(result, request_id=getattr(request, "request_id", None))

    @extend_schema(tags=["Calendar"], responses={200: CalendarStatusSerializer})
    def status(self, request: Request) -> Response:
        result = self.service.status(tenant=request.current_tenant, business=request.current_business)
        return success_response(result, request_id=getattr(request, "request_id", None))
