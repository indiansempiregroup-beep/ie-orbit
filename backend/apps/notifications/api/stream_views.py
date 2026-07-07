from __future__ import annotations

import json
import time
from collections.abc import Iterator
from typing import Any

from django.http import StreamingHttpResponse
from django_redis import get_redis_connection
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BaseRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.api.mobile_permissions import IsEmailVerified
from apps.api.mobile_serializers import MobileScopedQuerySerializer
from apps.api.mobile_views import _resolve_tenant_business
from apps.notifications.services.realtime import user_notification_channel


KEEPALIVE_SECONDS = 25
POLL_TIMEOUT_SECONDS = 1.0


class EventStreamRenderer(BaseRenderer):
    media_type = "text/event-stream"
    format = "event-stream"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class EventStreamAPIView(APIView):
    renderer_classes = [EventStreamRenderer]


def _matches_business_filter(payload: dict[str, Any], business_id: str | None) -> bool:
    if not business_id:
        return True
    data = payload.get("data")
    if not isinstance(data, dict):
        return True
    event_business_id = data.get("business_id")
    if not event_business_id:
        return True
    return str(event_business_id) == str(business_id)


def _notification_event_stream(*, user_id: str, business_id: str | None = None) -> Iterator[str]:
    redis_client = get_redis_connection("default")
    pubsub = redis_client.pubsub(ignore_subscribe_messages=True)
    pubsub.subscribe(user_notification_channel(str(user_id)))
    last_ping = time.monotonic()

    try:
        yield "event: connected\ndata: {}\n\n"
        while True:
            message = pubsub.get_message(timeout=POLL_TIMEOUT_SECONDS)
            if message and message.get("type") == "message":
                raw = message.get("data")
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8")
                if isinstance(raw, str) and raw.strip():
                    try:
                        payload = json.loads(raw)
                    except json.JSONDecodeError:
                        payload = None
                    if payload and _matches_business_filter(payload, business_id):
                        event_type = str(payload.get("type") or "notification")
                        yield f"event: {event_type}\ndata: {raw}\n\n"
            now = time.monotonic()
            if now - last_ping >= KEEPALIVE_SECONDS:
                yield ": keepalive\n\n"
                last_ping = now
    finally:
        pubsub.unsubscribe(user_notification_channel(str(user_id)))
        pubsub.close()


def _stream_response(*, user_id: str, business_id: str | None = None) -> StreamingHttpResponse:
    response = StreamingHttpResponse(
        _notification_event_stream(user_id=user_id, business_id=business_id),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


class NotificationStreamView(EventStreamAPIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Notifications"], responses={200: None})
    def get(self, request: Request) -> StreamingHttpResponse:
        business = getattr(request, "current_business", None)
        business_id = str(business.id) if business is not None else None
        return _stream_response(user_id=str(request.user.id), business_id=business_id)


class MobileNotificationStreamView(EventStreamAPIView):
    permission_classes = [IsAuthenticated, IsEmailVerified]

    @extend_schema(tags=["Mobile"], request=MobileScopedQuerySerializer)
    def get(self, request: Request) -> Response | StreamingHttpResponse:
        serializer = MobileScopedQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        try:
            _tenant, business = _resolve_tenant_business(
                tenant_slug=serializer.validated_data["tenant_slug"],
                business_code=serializer.validated_data["business_code"],
            )
        except ValueError as exc:
            return Response({"error": {"message": str(exc)}}, status=status.HTTP_404_NOT_FOUND)
        return _stream_response(user_id=str(request.user.id), business_id=str(business.id))
