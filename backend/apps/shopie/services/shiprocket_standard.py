from __future__ import annotations

import json
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.businesses.models import Branch, BranchStatus, Business
from apps.customers.services.contact import resolve_customer_phone
from apps.shopie.models import OrderStatus, ShipmentStatus, ShopBusinessSettings, ShopOrder, ShopShipment
from apps.shopie.services.delivery.providers import ShiprocketQuickProvider, _value
from apps.shopie.services.delivery_secrets import decrypt_secret
from apps.shopie.services.shipment import ShipmentService

SHIPROCKET_STATUS_MAP = {
    "pickup scheduled": ShipmentStatus.SHIPPED,
    "picked up": ShipmentStatus.IN_TRANSIT,
    "in transit": ShipmentStatus.IN_TRANSIT,
    "out for delivery": ShipmentStatus.OUT_FOR_DELIVERY,
    "out for pickup": ShipmentStatus.OUT_FOR_DELIVERY,
    "delivered": ShipmentStatus.DELIVERED,
    "rto delivered": ShipmentStatus.FAILED,
    "rto in transit": ShipmentStatus.IN_TRANSIT,
    "cancelled": ShipmentStatus.FAILED,
}


class ShiprocketStandardProvider(ShiprocketQuickProvider):
    """Shiprocket standard (non-hyperlocal) courier booking."""

    code = "shiprocket_standard"

    @staticmethod
    def _pick_courier(companies: list[Any]) -> dict[str, Any]:
        parsed: list[dict[str, Any]] = [item for item in companies if isinstance(item, dict)]
        if not parsed:
            raise ValidationError(
                {"delivery_provider": "Shiprocket did not return a usable courier."}
            )

        def is_quick(item: dict[str, Any]) -> bool:
            name = str(item.get("courier_name") or item.get("name") or "").lower()
            return any(token in name for token in ("quick", "hyperlocal", "srquick"))

        preferred = [item for item in parsed if not is_quick(item)] or parsed

        def rate_key(item: dict[str, Any]) -> Decimal:
            fee = _value(item, "rate", "freight_charge", "rate_after_discount", default="999999")
            try:
                return Decimal(str(fee))
            except Exception:
                return Decimal("999999")

        return min(preferred, key=rate_key)

    def assign_awb(self, *, shipment_id: int | str, courier_company_id: int | str | None = None) -> dict[str, Any]:
        self._ensure_token()
        payload: dict[str, Any] = {"shipment_id": [int(shipment_id)]}
        if courier_company_id not in (None, ""):
            payload["courier_id"] = int(courier_company_id)
        return self._request("POST", "/courier/assign/awb", payload=payload)

    def book_standard(self, payload: dict[str, Any]) -> dict[str, Any]:
        pickup = payload.get("pickup") or {}
        drop = payload.get("drop") or {}
        pickup_pin = str(pickup.get("postal_code") or "").strip()
        drop_pin = str(drop.get("postal_code") or "").strip()
        if not pickup_pin or not drop_pin:
            raise ValidationError(
                {
                    "delivery_provider": (
                        "Shiprocket needs pickup and delivery PIN codes. "
                        "Set the office PIN under Settings → Offices."
                    )
                }
            )

        quote = self.quote(payload)
        created = super().book(payload)
        shipment_id = _value(created, "shipment_id", "payload.shipment_id", "booking_id")
        if not shipment_id:
            raise ValidationError(
                {"delivery_provider": "Shiprocket did not return a shipment id after booking."}
            )

        courier_id = quote.quote_id
        assigned = self.assign_awb(shipment_id=shipment_id, courier_company_id=courier_id)
        awb = str(
            _value(
                assigned,
                "response.data.awb_code",
                "awb_code",
                "data.awb_code",
                "awb",
                default="",
            )
        )
        if not awb:
            tracked = self.track(str(awb or shipment_id))
            awb = str(_value(tracked, "tracking_data.awb_code", "awb_code", default=awb))

        courier_name = str(
            _value(assigned, "response.data.courier_name", "courier_name", default="Shiprocket")
        )
        tracking_url = str(
            _value(assigned, "tracking_url", "response.data.tracking_url", default="")
        ) or (f"https://shiprocket.co/tracking/{awb}" if awb else "")

        eta_days = max(1, int((quote.eta_minutes or 2880) / (24 * 60)))
        estimated_delivery = timezone.localdate() + timedelta(days=eta_days)

        return {
            "provider": self.code,
            "shipment_id": str(shipment_id),
            "courier_company_id": str(courier_id),
            "courier_label": courier_name,
            "tracking_number": awb or str(shipment_id),
            "tracking_url": tracking_url,
            "estimated_delivery_at": estimated_delivery.isoformat(),
            "fee": str(quote.fee),
        }

    def normalized_status(self, raw: dict[str, Any]) -> str:
        current = str(
            _value(
                raw,
                "tracking_data.shipment_status",
                "shipment_status",
                "current_status",
                "status",
                default="",
            )
        ).strip().lower()
        for key, mapped in SHIPROCKET_STATUS_MAP.items():
            if key in current:
                return mapped
        return ShipmentStatus.IN_TRANSIT


class ShiprocketStandardService:
    def _settings(self, *, business: Business) -> ShopBusinessSettings:
        return ShopBusinessSettings.objects.get_or_create(
            tenant=business.tenant,
            business=business,
        )[0]

    def config_for(self, *, business: Business) -> dict[str, Any]:
        settings = self._settings(business=business)
        metadata = dict(settings.metadata or {})
        courier = dict(metadata.get("courier_integration") or {})
        delivery = dict(settings.delivery_integration or {})
        credentials = dict(delivery.get("credentials") or {})
        merged = {
            **courier,
            "provider": courier.get("provider") or "shiprocket_standard",
            "base_url": courier.get("base_url") or delivery.get("base_url") or ShiprocketQuickProvider.DEFAULT_BASE_URL,
            "pickup_location": courier.get("pickup_location") or delivery.get("pickup_location") or "Primary",
            "default_parcel_weight_kg": courier.get("default_parcel_weight_kg")
            or delivery.get("default_parcel_weight_kg")
            or "1",
            "email": credentials.get("email") or courier.get("email") or "",
            "password": decrypt_secret(str(credentials.get("password") or courier.get("password") or "")),
            "api_key": decrypt_secret(str(credentials.get("api_key") or courier.get("api_key") or "")),
        }
        if not merged.get("email") and not merged.get("api_key"):
            raise ValidationError(
                {
                    "courier_integration": (
                        "Connect Shiprocket under Shop → Instant delivery settings "
                        "(API user email and password), then enable standard courier booking."
                    )
                }
            )
        return merged

    def is_enabled(self, *, business: Business) -> bool:
        settings = self._settings(business=business)
        metadata = dict(settings.metadata or {})
        courier = dict(metadata.get("courier_integration") or {})
        return bool(courier.get("enabled", True)) and bool(
            (settings.delivery_integration or {}).get("credentials")
            or courier.get("email")
            or courier.get("api_key")
        )

    def pickup_branch(self, *, business: Business) -> Branch | None:
        return (
            Branch.objects.filter(
                business=business,
                status=BranchStatus.ACTIVE,
                is_primary=True,
            )
            .exclude(latitude__isnull=True)
            .exclude(longitude__isnull=True)
            .first()
            or Branch.objects.filter(
                business=business,
                status=BranchStatus.ACTIVE,
            )
            .exclude(latitude__isnull=True)
            .exclude(longitude__isnull=True)
            .first()
        )

    def build_payload(self, *, order: ShopOrder, branch: Branch | None = None) -> dict[str, Any]:
        branch = branch or self.pickup_branch(business=order.business)
        customer = order.customer
        payment_meta = dict((order.metadata or {}).get("pos") or {})
        payment_method = str(payment_meta.get("payment_method") or order.payment_method or "prepaid")
        drop_parts = [order.delivery_address]
        metadata = dict(order.metadata or {})
        return {
            "pickup": {
                "address": branch.address_line1 if branch else order.business.address_line1,
                "city": branch.city if branch else order.business.city,
                "state": branch.state if branch else order.business.state,
                "postal_code": branch.postal_code if branch else order.business.postal_code,
                "latitude": branch.latitude if branch else order.business.latitude,
                "longitude": branch.longitude if branch else order.business.longitude,
                "contact": {
                    "name": order.business.display_name,
                    "phone": order.business.phone_number or "",
                },
            },
            "drop": {
                "address": order.delivery_address,
                "city": str(metadata.get("delivery_city") or ""),
                "state": str(metadata.get("delivery_state") or ""),
                "postal_code": str(metadata.get("delivery_postal_code") or ""),
                "contact": {
                    "name": getattr(customer, "display_name", "") if customer else "",
                    "phone": resolve_customer_phone(customer) if customer else "",
                },
            },
            "customer": {
                "name": getattr(customer, "display_name", "") if customer else "",
                "phone": resolve_customer_phone(customer) if customer else "",
                "email": getattr(customer, "email", "") if customer else "",
            },
            "order": {
                "id": str(order.id),
                "number": order.order_number,
                "amount": str(order.total),
                "payment_method": payment_method,
            },
            "weight": self.config_for(business=order.business).get("default_parcel_weight_kg") or "1",
        }

    def book_order(self, *, order: ShopOrder, notify_customer: bool = True) -> ShopShipment:
        if str(order.fulfillment_mode).lower() != "delivery":
            raise ValidationError({"fulfillment_mode": "Only delivery orders can be booked with Shiprocket."})
        provider = ShiprocketStandardProvider(self.config_for(business=order.business))
        booked = provider.book_standard(self.build_payload(order=order))
        estimated = date.fromisoformat(str(booked.get("estimated_delivery_at")))
        shipment_service = ShipmentService()
        shipment = shipment_service.ship_order(
            tenant=order.tenant,
            business=order.business,
            order=order,
            carrier="shiprocket",
            tracking_number=str(booked.get("tracking_number") or ""),
            carrier_label_override=str(booked.get("courier_label") or "Shiprocket"),
            tracking_url_override=str(booked.get("tracking_url") or ""),
            estimated_delivery_at=estimated,
            notify_customer=False,
        )
        shipment.metadata = {
            **dict(shipment.metadata or {}),
            "provider": "shiprocket_standard",
            "shiprocket_shipment_id": booked.get("shipment_id"),
            "courier_company_id": booked.get("courier_company_id"),
            "booking_fee": booked.get("fee"),
        }
        shipment.save(update_fields=["metadata", "updated_at"])
        if notify_customer:
            from apps.shopie.services.order_notify import notify_shipment_milestone

            notify_shipment_milestone(order=order, shipment=shipment, status=ShipmentStatus.SHIPPED)
        return shipment

    def refresh_shipment(self, *, shipment: ShopShipment) -> ShopShipment:
        metadata = dict(shipment.metadata or {})
        if metadata.get("provider") != "shiprocket_standard":
            return shipment
        provider = ShiprocketStandardProvider(self.config_for(business=shipment.business))
        tracking_key = shipment.tracking_number or metadata.get("shiprocket_shipment_id")
        if not tracking_key:
            return shipment
        raw = provider.track(str(tracking_key))
        status = provider.normalized_status(raw)
        if status == shipment.status:
            return shipment
        shipment_service = ShipmentService()
        shipment = shipment_service.update_milestone(
            order=shipment.order,
            status=status,
            notify_customer=True,
        )
        if status == ShipmentStatus.DELIVERED:
            from apps.shopie.services.orders import OrderService

            OrderService().transition(
                tenant=shipment.tenant,
                business=shipment.business,
                order=shipment.order,
                status=OrderStatus.COMPLETED,
                notify=False,
            )
        return shipment

    def process_webhook(self, *, business: Business, body: bytes) -> dict[str, Any]:
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            return {"accepted": False, "reason": "invalid_payload"}
        awb = str(
            _value(payload, "awb", "awb_code", "tracking_number", "data.awb", default="")
        ).strip()
        shipment_id = str(
            _value(payload, "shipment_id", "data.shipment_id", "order_id", default="")
        ).strip()
        shipment = None
        if awb:
            shipment = ShopShipment.objects.filter(
                business=business,
                tracking_number=awb,
            ).first()
        if shipment is None and shipment_id:
            shipment = ShopShipment.objects.filter(
                business=business,
                metadata__shiprocket_shipment_id=shipment_id,
            ).first()
        if shipment is None:
            return {"accepted": True, "ignored": True, "reason": "no_matching_shipment"}
        provider = ShiprocketStandardProvider(self.config_for(business=business))
        status = provider.normalized_status(payload)
        if status != shipment.status:
            shipment_service = ShipmentService()
            shipment_service.update_milestone(
                order=shipment.order,
                status=status,
                notify_customer=True,
            )
            if status == ShipmentStatus.DELIVERED:
                from apps.shopie.services.orders import OrderService

                OrderService().transition(
                    tenant=shipment.tenant,
                    business=shipment.business,
                    order=shipment.order,
                    status=OrderStatus.COMPLETED,
                    notify=False,
                )
        return {"accepted": True, "shipment_id": str(shipment.id), "status": status}

    def public_settings(self, *, business: Business) -> dict[str, Any]:
        settings = self._settings(business=business)
        metadata = dict(settings.metadata or {})
        courier = dict(metadata.get("courier_integration") or {})
        return {
            "enabled": bool(courier.get("enabled", False)),
            "provider": "shiprocket_standard",
            "pickup_location": courier.get("pickup_location") or "Primary",
            "default_parcel_weight_kg": courier.get("default_parcel_weight_kg") or "1",
            "configured": self.is_enabled(business=business),
        }
