from __future__ import annotations

from datetime import date
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.businesses.models import Business
from apps.shopie.models import (
    FulfillmentMode,
    OrderStatus,
    ShipmentStatus,
    ShopOrder,
    ShopShipment,
    TrackingEventSource,
)
from apps.shopie.services.carriers import carrier_label, tracking_url_for
from apps.shopie.services.orders import OrderService
from apps.shopie.services.tracking import TrackingHistoryService
from apps.tenancy.models import Tenant

SHIPMENT_MILESTONES = {
    ShipmentStatus.SHIPPED,
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
}


class ShipmentService:
    def get_shipment(self, *, order: ShopOrder) -> ShopShipment | None:
        return getattr(order, "shipment", None)

    def serialize(self, shipment: ShopShipment | None) -> dict[str, Any] | None:
        if shipment is None:
            return None
        return {
            "id": str(shipment.id),
            "carrier": shipment.carrier,
            "carrier_label": shipment.carrier_label,
            "tracking_number": shipment.tracking_number,
            "tracking_url": shipment.tracking_url,
            "status": shipment.status,
            "shipped_at": shipment.shipped_at.isoformat() if shipment.shipped_at else None,
            "estimated_delivery_at": (
                shipment.estimated_delivery_at.isoformat()
                if shipment.estimated_delivery_at
                else None
            ),
        }

    @transaction.atomic
    def ship_order(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
        carrier: str,
        tracking_number: str,
        carrier_label_override: str = "",
        tracking_url_override: str = "",
        estimated_delivery_at: date | None = None,
        notify_customer: bool = True,
    ) -> ShopShipment:
        if str(order.fulfillment_mode).lower() != FulfillmentMode.DELIVERY:
            raise ValidationError({"fulfillment_mode": "Only delivery orders can be shipped."})
        metadata = dict(order.metadata or {})
        if metadata.get("delivery_method") == "instant":
            raise ValidationError({"delivery": "Instant delivery orders use rider dispatch, not courier shipment."})
        if order.status not in {OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERY_FAILED}:
            raise ValidationError(
                {"status": "Pack the order before shipping (status must be ready)."}
            )
        awb = str(tracking_number or "").strip()
        if not awb:
            raise ValidationError({"tracking_number": "AWB or tracking number is required."})
        carrier_id = str(carrier or "other").strip().lower() or "other"
        label = carrier_label(carrier_id, carrier_label_override)
        url = tracking_url_for(
            carrier=carrier_id,
            tracking_number=awb,
            override=tracking_url_override,
        )
        now = timezone.now()
        shipment, _created = ShopShipment.objects.update_or_create(
            tenant=tenant,
            order=order,
            defaults={
                "business": business,
                "carrier": carrier_id,
                "carrier_label": label,
                "tracking_number": awb,
                "tracking_url": url,
                "status": ShipmentStatus.SHIPPED,
                "shipped_at": now,
                "estimated_delivery_at": estimated_delivery_at,
            },
        )
        metadata["shipment"] = self.serialize(shipment)
        order.metadata = metadata
        order.save(update_fields=["metadata", "updated_at"])

        TrackingHistoryService().record_status(
            order=order,
            status="shipped",
            label=f"Shipped with {label}",
            source=TrackingEventSource.SHIPMENT,
            source_key=f"shipment:{shipment.id}:shipped",
            occurred_at=now,
            metadata={"tracking_number": awb, "carrier": carrier_id},
        )

        if order.status != OrderStatus.OUT_FOR_DELIVERY:
            order = OrderService().transition(
                tenant=tenant,
                business=business,
                order=order,
                status=OrderStatus.OUT_FOR_DELIVERY,
                notify=False,
            )

        if notify_customer:
            from apps.shopie.services.order_notify import notify_shipment_milestone

            notify_shipment_milestone(order=order, shipment=shipment, status=ShipmentStatus.SHIPPED)

        return shipment

    @transaction.atomic
    def update_milestone(
        self,
        *,
        order: ShopOrder,
        status: str,
        notify_customer: bool = True,
    ) -> ShopShipment:
        shipment = self.get_shipment(order=order)
        if shipment is None:
            raise ValidationError({"shipment": "No shipment found for this order."})
        normalized = str(status or "").strip().lower()
        if normalized not in SHIPMENT_MILESTONES:
            raise ValidationError({"status": "Invalid shipment status."})
        shipment.status = normalized
        shipment.save(update_fields=["status", "updated_at"])
        metadata = dict(order.metadata or {})
        metadata["shipment"] = self.serialize(shipment)
        order.metadata = metadata
        order.save(update_fields=["metadata", "updated_at"])

        labels = {
            ShipmentStatus.IN_TRANSIT: "In transit",
            ShipmentStatus.OUT_FOR_DELIVERY: "Out for delivery",
            ShipmentStatus.DELIVERED: "Delivered",
        }
        TrackingHistoryService().record_status(
            order=order,
            status=normalized,
            label=labels.get(normalized, normalized.replace("_", " ").title()),
            source=TrackingEventSource.SHIPMENT,
            source_key=f"shipment:{shipment.id}:{normalized}",
            occurred_at=timezone.now(),
            metadata={"tracking_number": shipment.tracking_number},
        )

        if notify_customer:
            from apps.shopie.services.order_notify import notify_shipment_milestone

            notify_shipment_milestone(order=order, shipment=shipment, status=normalized)

        return shipment

    def parse_estimated_delivery(self, value: object) -> date | None:
        if value in (None, ""):
            return None
        if isinstance(value, date):
            return value
        parsed = parse_date(str(value))
        return parsed
