from __future__ import annotations

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.request import Request
from rest_framework.response import Response

from apps.common.api.responses import success_response
from apps.notifications.api.serializers import NotificationSerializer
from apps.notifications.models import Notification
from apps.notifications.repositories.notifications import NotificationRepository
from apps.notifications.services.notifications import NotificationService


class NotificationViewSet(viewsets.ViewSet):
    repository = NotificationRepository()
    service = NotificationService(repository=repository)

    @extend_schema(tags=["Notifications"], responses={200: NotificationSerializer(many=True)})
    def list(self, request: Request) -> Response:
        queryset = self.repository.list_for_request(tenant=request.current_tenant, user=request.user)
        return success_response(
            NotificationSerializer(queryset, many=True).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Notifications"], responses={200: NotificationSerializer})
    def mark_read(self, request: Request, pk: str | None = None) -> Response:
        notification = get_object_or_404(
            self.repository.list_for_request(tenant=request.current_tenant, user=request.user),
            id=pk,
        )
        notification = self.service.mark_read(notification=notification)
        return success_response(
            NotificationSerializer(notification).data,
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Notifications"], responses={200: NotificationSerializer(many=True)})
    def read_all(self, request: Request) -> Response:
        count = self.service.mark_all_read(tenant=request.current_tenant, user=request.user)
        return success_response(
            {"updated": count},
            request_id=getattr(request, "request_id", None),
        )

    @extend_schema(tags=["Notifications"], responses={204: None})
    def destroy(self, request: Request, pk: str | None = None) -> Response:
        notification = get_object_or_404(
            self.repository.list_for_request(tenant=request.current_tenant, user=request.user),
            id=pk,
        )
        notification.delete(deleted_by=getattr(request.user, "id", None))
        return Response(status=status.HTTP_204_NO_CONTENT)
