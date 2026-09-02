from __future__ import annotations

import math
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db.models import Max
from django.utils import timezone

from apps.shopie.models import (
    DeliveryAttemptStatus,
    FulfillmentMode,
    OrderStatus,
    ShopDeliveryAttempt,
    ShopOrder,
    ShopOrderTrackingEvent,
    TrackingEventKind,
    TrackingEventSource,
)

LOCATION_HISTORY_LIMIT = 200
LOCATION_MIN_SECONDS = 20
LOCATION_MIN_METERS = 20

CANONICAL_LABELS = {
    "order_placed": "Order placed",
    "confirmed": "Order confirmed",
    "packing": "Packing your order",
    "packed": "Packed and ready",
    "shipped": "Shipped",
    "in_transit": "In transit",
    "finding_rider": "Finding a rider",
    "rider_assigned": "Rider assigned",
    "at_pickup": "Rider at the shop",
    "out_for_delivery": "Out for delivery",
    "nearby": "Delivery is nearby",
    "delivered": "Delivered",
    "delivery_failed": "Delivery failed",
    "delivery_cancelled": "Delivery cancelled",
    "retrying": "Requesting another rider",
}

PARTNER_TO_CANONICAL = {
    "packing": "packing",
    "finding_rider": "finding_rider",
    "rider_assigned": "rider_assigned",
    "at_pickup": "at_pickup",
    "picked_up": "out_for_delivery",
    "nearby": "nearby",
    "delivered": "delivered",
    "failed": "delivery_failed",
    "cancelled": "delivery_cancelled",
}


def canonical_order_status(order: ShopOrder, status: str) -> str:
    value = str(status or "").lower()
    if value == OrderStatus.PENDING:
        return "order_placed"
    if value == OrderStatus.CONFIRMED:
        return "confirmed"
    if value == OrderStatus.READY:
        return "packed"
    if value == OrderStatus.OUT_FOR_DELIVERY:
        return "out_for_delivery"
    if value == OrderStatus.COMPLETED:
        return "delivered" if order.fulfillment_mode == FulfillmentMode.DELIVERY else "completed"
    if value == OrderStatus.DELIVERY_FAILED:
        return "delivery_failed"
    if value == OrderStatus.CANCELLED:
        return (
            "delivery_cancelled"
            if order.fulfillment_mode == FulfillmentMode.DELIVERY
            else "cancelled"
        )
    return value


def _decimal(value: object) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _distance_meters(
    lat1: Decimal,
    lng1: Decimal,
    lat2: Decimal,
    lng2: Decimal,
) -> float:
    first_lat, second_lat = math.radians(float(lat1)), math.radians(float(lat2))
    dlat = second_lat - first_lat
    dlng = math.radians(float(lng2) - float(lng1))
    value = (
        math.sin(dlat / 2) ** 2
        + math.cos(first_lat) * math.cos(second_lat) * math.sin(dlng / 2) ** 2
    )
    return 6371000 * 2 * math.asin(math.sqrt(value))


class TrackingHistoryService:
    def active_attempt(self, *, order: ShopOrder) -> ShopDeliveryAttempt | None:
        return (
            ShopDeliveryAttempt.objects.filter(
                order=order,
                status=DeliveryAttemptStatus.ACTIVE,
            )
            .order_by("-attempt_number")
            .first()
        )

    def attempt_for_booking(self, *, booking_id: str) -> ShopDeliveryAttempt | None:
        if not booking_id:
            return None
        return (
            ShopDeliveryAttempt.objects.select_related("order", "business", "tenant")
            .filter(booking_id=booking_id)
            .order_by("-created_at")
            .first()
        )

    def open_attempt(
        self,
        *,
        order: ShopOrder,
        provider: str,
        booking_id: str,
        tracking_url: str = "",
        rider: dict[str, Any] | None = None,
        occurred_at: datetime | None = None,
    ) -> ShopDeliveryAttempt:
        current = self.active_attempt(order=order)
        if current and current.booking_id == booking_id:
            return current
        number = (
            ShopDeliveryAttempt.objects.filter(order=order).aggregate(value=Max("attempt_number"))[
                "value"
            ]
            or 0
        ) + 1
        return ShopDeliveryAttempt.objects.create(
            tenant=order.tenant,
            business=order.business,
            order=order,
            attempt_number=number,
            provider=provider,
            booking_id=booking_id,
            tracking_url=tracking_url,
            rider=rider or {},
            started_at=occurred_at or timezone.now(),
        )

    def update_attempt(
        self,
        *,
        attempt: ShopDeliveryAttempt,
        rider: dict[str, Any] | None = None,
        tracking_url: str | None = None,
        status: str | None = None,
        reason: str | None = None,
        ended_at: datetime | None = None,
    ) -> ShopDeliveryAttempt:
        fields: list[str] = []
        if rider is not None:
            attempt.rider = rider
            fields.append("rider")
        if tracking_url is not None:
            attempt.tracking_url = tracking_url
            fields.append("tracking_url")
        if status is not None:
            attempt.status = status
            fields.append("status")
        if reason is not None:
            attempt.reason = reason
            fields.append("reason")
        if ended_at is not None:
            attempt.ended_at = ended_at
            fields.append("ended_at")
        if fields:
            attempt.save(update_fields=[*fields, "updated_at", "version"])
        return attempt

    def record_status(
        self,
        *,
        order: ShopOrder,
        status: str,
        source: str = TrackingEventSource.ORDER,
        attempt: ShopDeliveryAttempt | None = None,
        occurred_at: datetime | None = None,
        reason: str = "",
        eta_minutes: object = None,
        source_key: str = "",
        webhook_event=None,
        metadata: dict[str, Any] | None = None,
        label: str = "",
    ) -> ShopOrderTrackingEvent:
        canonical = PARTNER_TO_CANONICAL.get(status, status)
        defaults = {
            "tenant": order.tenant,
            "business": order.business,
            "attempt": attempt,
            "webhook_event": webhook_event,
            "kind": TrackingEventKind.STATUS,
            "status": canonical,
            "label": label or CANONICAL_LABELS.get(canonical, canonical.replace("_", " ").title()),
            "source": source,
            "occurred_at": occurred_at or timezone.now(),
            "eta_minutes": int(eta_minutes) if eta_minutes not in (None, "") else None,
            "reason": reason,
            "metadata": metadata or {},
        }
        if source_key:
            event, _ = ShopOrderTrackingEvent.objects.get_or_create(
                order=order,
                source_key=source_key[:220],
                defaults=defaults,
            )
            return event
        latest = (
            ShopOrderTrackingEvent.objects.filter(
                order=order,
                attempt=attempt,
                kind=TrackingEventKind.STATUS,
            )
            .order_by("-occurred_at", "-created_at")
            .first()
        )
        if latest and latest.status == canonical:
            return latest
        return ShopOrderTrackingEvent.objects.create(order=order, source_key="", **defaults)

    def record_order_status(
        self,
        *,
        order: ShopOrder,
        status: str,
        occurred_at: datetime | None = None,
    ) -> ShopOrderTrackingEvent | None:
        if order.fulfillment_mode != FulfillmentMode.DELIVERY:
            return None
        canonical = canonical_order_status(order, status)
        return self.record_status(
            order=order,
            status=canonical,
            source=TrackingEventSource.ORDER,
            occurred_at=occurred_at,
            source_key=f"order-status:{canonical}:{(occurred_at or timezone.now()).isoformat()}",
        )

    def record_location(
        self,
        *,
        order: ShopOrder,
        attempt: ShopDeliveryAttempt | None,
        latitude: object,
        longitude: object,
        source: str,
        status: str = "",
        eta_minutes: object = None,
        occurred_at: datetime | None = None,
        source_key: str = "",
        webhook_event=None,
    ) -> ShopOrderTrackingEvent | None:
        lat, lng = _decimal(latitude), _decimal(longitude)
        if lat is None or lng is None:
            return None
        if source_key:
            existing = ShopOrderTrackingEvent.objects.filter(
                order=order,
                source_key=source_key[:220],
            ).first()
            if existing is not None:
                return existing
        when = occurred_at or timezone.now()
        latest = (
            ShopOrderTrackingEvent.objects.filter(
                order=order,
                attempt=attempt,
                kind=TrackingEventKind.LOCATION,
            )
            .order_by("-occurred_at")
            .first()
        )
        if latest and latest.latitude is not None and latest.longitude is not None:
            seconds = (when - latest.occurred_at).total_seconds()
            distance = _distance_meters(latest.latitude, latest.longitude, lat, lng)
            if seconds < LOCATION_MIN_SECONDS and distance < LOCATION_MIN_METERS:
                return latest
        event = ShopOrderTrackingEvent.objects.create(
            tenant=order.tenant,
            business=order.business,
            order=order,
            attempt=attempt,
            webhook_event=webhook_event,
            kind=TrackingEventKind.LOCATION,
            status=PARTNER_TO_CANONICAL.get(status, status),
            label="Rider location",
            source=source,
            source_key=source_key[:220],
            occurred_at=when,
            latitude=lat,
            longitude=lng,
            eta_minutes=int(eta_minutes) if eta_minutes not in (None, "") else None,
        )
        ids_to_remove = list(
            ShopOrderTrackingEvent.objects.filter(
                order=order,
                attempt=attempt,
                kind=TrackingEventKind.LOCATION,
            )
            .order_by("-occurred_at")
            .values_list("id", flat=True)[LOCATION_HISTORY_LIMIT:]
        )
        if ids_to_remove:
            ShopOrderTrackingEvent.all_objects.filter(id__in=ids_to_remove).delete()
        return event

    def payload(self, *, order: ShopOrder) -> dict[str, Any]:
        attempts = list(
            ShopDeliveryAttempt.objects.filter(order=order)
            .prefetch_related("events")
            .order_by("attempt_number")
        )
        events = list(
            ShopOrderTrackingEvent.objects.filter(
                order=order,
                kind=TrackingEventKind.STATUS,
            )
            .select_related("attempt")
            .order_by("occurred_at", "created_at")
        )
        latest_attempt = attempts[-1] if attempts else None
        trail_events = (
            ShopOrderTrackingEvent.objects.filter(
                order=order,
                attempt=latest_attempt,
                kind=TrackingEventKind.LOCATION,
            ).order_by("occurred_at")
            if latest_attempt
            else ShopOrderTrackingEvent.objects.none()
        )
        return {
            "active_attempt_number": (
                latest_attempt.attempt_number
                if latest_attempt and latest_attempt.status == DeliveryAttemptStatus.ACTIVE
                else None
            ),
            "attempts": [
                {
                    "id": str(attempt.id),
                    "attempt_number": attempt.attempt_number,
                    "provider": attempt.provider,
                    "booking_id": attempt.booking_id,
                    "status": attempt.status,
                    "tracking_url": attempt.tracking_url,
                    "rider": attempt.rider or {},
                    "reason": attempt.reason,
                    "started_at": attempt.started_at.isoformat(),
                    "ended_at": attempt.ended_at.isoformat() if attempt.ended_at else None,
                }
                for attempt in attempts
            ],
            "events": [
                {
                    "id": str(event.id),
                    "kind": event.kind,
                    "status": event.status,
                    "label": event.label,
                    "occurred_at": event.occurred_at.isoformat(),
                    "reason": event.reason,
                    "eta_minutes": event.eta_minutes,
                    "attempt_number": (
                        event.attempt.attempt_number if event.attempt_id else None
                    ),
                    "source": event.source,
                }
                for event in events
            ],
            "location_trail": [
                {
                    "latitude": float(event.latitude),
                    "longitude": float(event.longitude),
                    "occurred_at": event.occurred_at.isoformat(),
                    "status": event.status,
                }
                for event in trail_events
                if event.latitude is not None and event.longitude is not None
            ],
        }
