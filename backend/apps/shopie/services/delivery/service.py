from __future__ import annotations

import hashlib
import hmac
import json
import math
import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.businesses.models import Branch, BranchStatus, Business
from apps.shopie.models import (
    DeliveryAttemptStatus,
    DeliveryWebhookStatus,
    FulfillmentMode,
    OrderStatus,
    ReturnMethod,
    ShopBusinessSettings,
    ShopDeliveryAttempt,
    ShopDeliveryWebhookEvent,
    ShopOrder,
    ShopReturn,
    TrackingEventSource,
)
from apps.shopie.services.delivery.providers import DeliveryQuote, get_delivery_provider
from apps.shopie.services.delivery_secrets import decrypt_secret, encrypt_secret, mask_secret
from apps.shopie.services.order_notify import notify_online_order
from apps.shopie.services.tracking import TrackingHistoryService, canonical_order_status
from apps.shopie.services.zones import DeliveryZoneService
from apps.tenancy.models import Tenant
from apps.customers.services.contact import format_contact_phone, resolve_customer_phone
from apps.shopie.services.delivery.contact import (
    merge_location_contact,
    resolve_order_delivery_contact,
)

SECRET_KEYS = frozenset(
    {
        "api_key",
        "api_secret",
        "password",
        "token",
        "client_secret",
        "webhook_secret",
    }
)

STATUS_ALIASES = {
    "new": "finding_rider",
    "created": "finding_rider",
    "searching": "finding_rider",
    "finding_driver": "finding_rider",
    "driver_assigned": "rider_assigned",
    "assigned": "rider_assigned",
    "accepted": "rider_assigned",
    "reached_pickup": "at_pickup",
    "arrived": "at_pickup",
    "pickup": "at_pickup",
    "in_transit": "picked_up",
    "started": "picked_up",
    "out_for_delivery": "picked_up",
    "near_destination": "nearby",
    "completed": "delivered",
    "success": "delivered",
    "canceled": "cancelled",
    "rejected": "failed",
    "undeliverable": "failed",
}

TERMINAL_PARTNER_STATUSES = {"delivered", "failed", "cancelled"}
# Forward-only lifecycle: partners retry webhooks and polling races them, so a
# late ping for an earlier stage must not walk a delivery backwards.
PARTNER_STATUS_SEQUENCE = (
    "packing",
    "finding_rider",
    "rider_assigned",
    "at_pickup",
    "picked_up",
    "nearby",
    "delivered",
)
WEBHOOK_RETRY_DELAYS = (60, 300, 1800, 7200, 21600)


def normalize_partner_status(value: object) -> str:
    raw = str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
    if raw in {
        "packing",
        "finding_rider",
        "rider_assigned",
        "at_pickup",
        "picked_up",
        "nearby",
        "delivered",
        "failed",
        "cancelled",
    }:
        return raw
    return STATUS_ALIASES.get(raw, "finding_rider")


class DeliveryService:
    def ensure_settings(self, *, tenant: Tenant, business: Business) -> ShopBusinessSettings:
        settings, _ = ShopBusinessSettings.objects.get_or_create(
            tenant=tenant,
            business=business,
        )
        return settings

    def _decrypted_config(self, settings: ShopBusinessSettings) -> dict[str, Any]:
        config = dict(settings.delivery_integration or {})
        credentials = dict(config.get("credentials") or {})
        for key in SECRET_KEYS:
            if key in credentials:
                credentials[key] = decrypt_secret(str(credentials[key] or ""))
        if "webhook_secret" in config:
            config["webhook_secret"] = decrypt_secret(str(config.get("webhook_secret") or ""))
        return {**config, **credentials, "credentials": credentials}

    def public_settings(self, settings: ShopBusinessSettings) -> dict[str, Any]:
        config = dict(settings.delivery_integration or {})
        credentials = dict(config.get("credentials") or {})
        masked = {
            key: mask_secret(str(value or "")) if key in SECRET_KEYS else value
            for key, value in credentials.items()
        }
        if config.get("webhook_secret"):
            config["webhook_secret"] = mask_secret(str(config["webhook_secret"]))
        from apps.shopie.services.shiprocket_standard import ShiprocketStandardService

        return {
            "instant_delivery_enabled": settings.instant_delivery_enabled,
            "cod_allowed_for_instant_delivery": bool(
                getattr(settings, "cod_allowed_for_instant_delivery", True)
            ),
            "delivery_integration": {**config, "credentials": masked},
            "delivery_sla": dict((settings.metadata or {}).get("delivery_sla") or {}),
            "courier_integration": ShiprocketStandardService().public_settings(
                business=settings.business
            ),
        }

    def update_settings(
        self,
        *,
        tenant: Tenant,
        business: Business,
        enabled: bool | None,
        incoming: dict[str, Any],
        cod_allowed_for_instant_delivery: bool | None = None,
    ) -> ShopBusinessSettings:
        settings = self.ensure_settings(tenant=tenant, business=business)
        current = dict(settings.delivery_integration or {})
        provider = str(incoming.get("provider", current.get("provider", "mock"))).strip().lower()
        if provider not in {"mock", "porter", "shiprocket_quick"}:
            raise ValidationError({"provider": "Choose mock, porter, or shiprocket_quick."})
        if provider == "shiprocket_quick" and not str(
            incoming.get("base_url", current.get("base_url") or "")
        ).strip():
            incoming = {**incoming, "base_url": "https://apiv2.shiprocket.in/v1/external"}
        bearer = str(
            incoming.get("charge_bearer", current.get("charge_bearer", "customer"))
        ).strip().lower()
        if bearer not in {"customer", "merchant", "split"}:
            raise ValidationError({"charge_bearer": "Choose customer, merchant, or split."})

        credentials = dict(current.get("credentials") or {})
        for key, value in dict(incoming.get("credentials") or {}).items():
            if str(value or "").startswith("•"):
                continue
            credentials[key] = encrypt_secret(str(value or "")) if key in SECRET_KEYS else value

        merged = {**current, **incoming, "provider": provider, "charge_bearer": bearer}
        merged["credentials"] = credentials
        if "webhook_secret" in incoming and not str(
            incoming["webhook_secret"] or ""
        ).startswith("•"):
            merged["webhook_secret"] = encrypt_secret(str(incoming["webhook_secret"] or ""))
        if enabled is not None:
            if enabled and self.pickup_source(business=business) is None:
                raise ValidationError(
                    {
                        "instant_delivery_enabled": (
                            "Add an office with a map pin under Settings → Offices, "
                            "then enable delivery. Riders are sent to that address."
                        )
                    }
                )
            settings.instant_delivery_enabled = enabled
        if cod_allowed_for_instant_delivery is not None:
            settings.cod_allowed_for_instant_delivery = bool(
                cod_allowed_for_instant_delivery
            )
        settings.delivery_integration = merged
        update_fields = [
            "instant_delivery_enabled",
            "delivery_integration",
            "updated_at",
            "version",
        ]
        if cod_allowed_for_instant_delivery is not None:
            update_fields.append("cod_allowed_for_instant_delivery")
        settings.save(update_fields=update_fields)
        return settings

    def update_courier_settings(
        self,
        *,
        tenant: Tenant,
        business: Business,
        incoming: dict[str, Any],
    ) -> ShopBusinessSettings:
        settings = self.ensure_settings(tenant=tenant, business=business)
        metadata = dict(settings.metadata or {})
        current = dict(metadata.get("courier_integration") or {})
        merged = {**current, **incoming}
        metadata["courier_integration"] = merged
        settings.metadata = metadata
        settings.save(update_fields=["metadata", "updated_at", "version"])
        return settings

    @staticmethod
    def _location(
        *,
        latitude: object,
        longitude: object,
        address: str = "",
        address_2: str = "",
        city: str = "",
        state: str = "",
        postal_code: str = "",
        contact_name: str = "",
        contact_phone: str = "",
    ) -> dict[str, Any]:
        if latitude in (None, "") or longitude in (None, ""):
            raise ValidationError({"delivery_address": "A mapped address is required."})
        payload = {
            "latitude": float(latitude),
            "longitude": float(longitude),
            "address": address,
            "city": city,
            "state": state,
            "postal_code": postal_code,
            "contact": {
                "name": contact_name,
                "phone": format_contact_phone(contact_phone),
            },
        }
        door = str(address_2 or "").strip()
        if door:
            payload["address_2"] = door
        return payload

    @staticmethod
    def _branch_source(branch: Branch, business: Business) -> dict[str, Any]:
        return {
            "latitude": branch.latitude,
            "longitude": branch.longitude,
            "address_parts": (
                branch.address_line1,
                branch.address_line2,
                branch.city,
                branch.state,
                branch.postal_code,
            ),
            "city": branch.city,
            "state": branch.state,
            "postal_code": branch.postal_code,
            "contact_name": branch.display_name or business.display_name,
            "contact_phone": branch.phone_number or business.primary_contact,
            "branch_id": str(branch.id),
        }

    def pickup_source(
        self,
        *,
        business: Business,
        branch: Branch | None = None,
    ) -> dict[str, Any] | None:
        """Where a rider collects the parcel.

        Offices carry the map pin merchants actually maintain (Settings → Offices),
        so prefer the office fulfilling the order, then the primary one, and only
        fall back to the business record.
        """
        if branch is not None and branch.latitude is not None and branch.longitude is not None:
            return self._branch_source(branch, business)
        branches = sorted(
            (
                branch
                for branch in Branch.objects.filter(
                    business=business,
                    status=BranchStatus.ACTIVE,
                )
                if branch.latitude is not None and branch.longitude is not None
            ),
            key=lambda branch: (not branch.is_primary, branch.created_at),
        )
        for candidate in branches:
            return self._branch_source(candidate, business)
        if business.latitude is None or business.longitude is None:
            return None
        return {
            "latitude": business.latitude,
            "longitude": business.longitude,
            "address_parts": (
                business.address_line1,
                business.address_line2,
                business.city,
                business.state,
                business.postal_code,
            ),
            "city": business.city,
            "state": business.state,
            "postal_code": business.postal_code,
            "contact_name": business.display_name,
            "contact_phone": business.primary_contact,
            "branch_id": "",
        }

    def _provider_payload(
        self,
        *,
        business: Business,
        drop: dict[str, Any],
        customer_name: str = "",
        customer_phone: str = "",
        branch: Branch | None = None,
        pickup_source: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        source = pickup_source or self.pickup_source(business=business, branch=branch)
        if source is None:
            raise ValidationError(
                {
                    "pickup": (
                        "Add an office with a map pin under Settings → Offices "
                        "so riders know where to collect the order."
                    )
                }
            )
        pickup = self._location(
            latitude=source["latitude"],
            longitude=source["longitude"],
            address=", ".join(
                part
                for part in (
                    source.get("address_parts")
                    or [
                        source.get("address_line1"),
                        source.get("address_line2"),
                        source.get("city"),
                        source.get("state"),
                        source.get("postal_code"),
                        source.get("country"),
                    ]
                )
                if part
            ),
            city=source["city"],
            state=source["state"],
            postal_code=source["postal_code"],
            contact_name=source["contact_name"],
            contact_phone=source["contact_phone"],
        )
        pickup["branch_id"] = source["branch_id"]
        drop_contact = drop.get("contact") if isinstance(drop.get("contact"), dict) else {}
        normalized_phone = format_contact_phone(
            drop_contact.get("phone") or customer_phone
        )
        # Coordinates arrive as Decimal from the API layer; _location casts them to
        # float so the quote can be stored on the order's JSON metadata.
        normalized_drop = self._location(
            latitude=drop.get("latitude"),
            longitude=drop.get("longitude"),
            address=str(drop.get("address") or ""),
            address_2=str(drop.get("address_2") or drop.get("address_line2") or ""),
            city=str(drop.get("city") or ""),
            state=str(drop.get("state") or ""),
            postal_code=str(drop.get("postal_code") or ""),
            contact_name=str(drop_contact.get("name") or customer_name),
            contact_phone=normalized_phone,
        )
        return {
            "pickup": pickup,
            "drop": normalized_drop,
            "customer": {"name": customer_name, "phone": normalized_phone},
        }

    @staticmethod
    def _allocate_fee(
        *,
        fee: Decimal,
        subtotal: Decimal,
        config: dict[str, Any],
    ) -> tuple[Decimal, Decimal]:
        bearer = str(config.get("charge_bearer") or "customer")
        free_min = Decimal(str(config.get("free_delivery_min_order") or "0"))
        cap = Decimal(str(config.get("merchant_absorb_cap") or "0"))
        if bearer == "merchant" or (free_min > 0 and subtotal >= free_min):
            return Decimal("0.00"), fee
        if bearer == "split":
            merchant = min(fee, max(Decimal("0.00"), cap))
            return (fee - merchant).quantize(Decimal("0.01")), merchant.quantize(
                Decimal("0.01")
            )
        return fee.quantize(Decimal("0.01")), Decimal("0.00")

    def quote(
        self,
        *,
        tenant: Tenant,
        business: Business,
        drop: dict[str, Any],
        subtotal: Decimal,
        customer_name: str = "",
        customer_phone: str = "",
        branch: Branch | None = None,
        pickup_source: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        settings = self.ensure_settings(tenant=tenant, business=business)
        if not settings.instant_delivery_enabled:
            return {"available": False, "reason": "instant_delivery_disabled"}
        zone = DeliveryZoneService().match_zone(
            tenant=tenant,
            business=business,
            city=str(drop.get("city") or ""),
            postal_code=str(drop.get("postal_code") or ""),
        )
        if zone is None:
            return {"available": False, "reason": "outside_delivery_zone"}
        if not zone.instant_delivery_enabled:
            return {"available": False, "reason": "instant_delivery_disabled_for_zone"}
        config = self._decrypted_config(settings)
        provider = get_delivery_provider(config)
        payload = self._provider_payload(
            business=business,
            drop=drop,
            customer_name=customer_name,
            customer_phone=customer_phone,
            branch=branch,
            pickup_source=pickup_source,
        )
        result: DeliveryQuote = provider.quote(payload)
        customer_fee, merchant_fee = self._allocate_fee(
            fee=result.fee,
            subtotal=subtotal,
            config=config,
        )
        return {
            "available": True,
            "provider": result.provider,
            "provider_label": (
                "Shiprocket Quick"
                if result.provider == "shiprocket_quick"
                else result.provider.title()
            ),
            "quote_id": result.quote_id,
            "quoted_fee": str(result.fee.quantize(Decimal("0.01"))),
            "customer_fee": str(customer_fee),
            "merchant_fee": str(merchant_fee),
            "eta_minutes": result.eta_minutes,
            "expires_in_seconds": result.expires_in_seconds,
            "delivery_zone_id": str(zone.id),
            "delivery_zone_name": zone.name,
            "pickup": payload["pickup"],
            "drop": payload["drop"],
        }

    @transaction.atomic
    def dispatch(self, *, order: ShopOrder) -> ShopOrder:
        # Lock only the order row: customer is nullable, and Postgres refuses
        # FOR UPDATE against the nullable side of the resulting outer join.
        order = (
            ShopOrder.objects.select_for_update(of=("self",))
            .select_related("business", "customer", "tenant")
            .get(id=order.id)
        )
        if order.fulfillment_mode != "delivery":
            raise ValidationError({"order": "Only delivery orders can be dispatched."})
        if order.status not in {OrderStatus.READY, OrderStatus.DELIVERY_FAILED}:
            raise ValidationError({"order": "Mark the order ready before dispatching."})
        metadata = dict(order.metadata or {})
        if metadata.get("delivery_method") == "standard":
            raise ValidationError(
                {"delivery": "Standard delivery orders do not use an instant-delivery rider."}
            )
        delivery = dict(metadata.get("delivery") or {})
        if not delivery:
            raise ValidationError({"delivery": "This order has no instant-delivery quote."})
        if delivery.get("booking_id"):
            return order
        retrying = order.status == OrderStatus.DELIVERY_FAILED
        settings = self.ensure_settings(tenant=order.tenant, business=order.business)
        if not settings.instant_delivery_enabled:
            raise ValidationError({"delivery": "Instant delivery is not enabled for this shop."})
        config = self._decrypted_config(settings)
        provider = get_delivery_provider(config)
        customer_name, customer_phone = resolve_order_delivery_contact(
            order=order,
            delivery=delivery,
        )
        pickup = merge_location_contact(delivery.get("pickup") or {})
        drop = merge_location_contact(
            delivery.get("drop") or {},
            name=customer_name,
            phone=customer_phone,
        )
        if not customer_phone:
            raise ValidationError(
                {"delivery": "Customer mobile number is required before dispatching a rider."}
            )
        payload = {
            "request_id": str(order.id),
            "quote_id": delivery.get("quote_id"),
            "pickup": pickup,
            "drop": drop,
            "customer": {
                "name": customer_name,
                "phone": customer_phone,
            },
            "order": {
                "id": str(order.id),
                "number": order.order_number,
                "amount": str(order.total),
                "payment_method": (metadata.get("pos") or {}).get("payment_method"),
            },
            "eta_minutes": delivery.get("eta_minutes"),
        }
        booked = provider.book(payload)
        booking_id = str(booked.get("booking_id") or "")
        if not booking_id:
            raise ValidationError({"delivery_provider": "Provider did not return a booking ID."})
        status = normalize_partner_status(booked.get("partner_status"))
        now = timezone.now().isoformat()
        rider = dict(booked.get("rider") or {})
        rider_loc = rider.get("location") if isinstance(rider.get("location"), dict) else {}
        delivery.update(
            {
                "booking_id": booking_id,
                "tracking_url": str(booked.get("tracking_url") or ""),
                "partner_status": status,
                "rider": {key: value for key, value in rider.items() if key != "location"},
                "eta_minutes": booked.get("eta_minutes") or delivery.get("eta_minutes"),
                "events": [
                    *(delivery.get("events") or []),
                    {"status": status, "occurred_at": now, "label": "Delivery requested"},
                ],
                "last_updated": now,
                # A retry after a failed trip must not keep showing the old reason.
                "reason": "",
            }
        )
        rider_lat = self._coord(rider_loc.get("latitude") or rider_loc.get("lat"))
        rider_lng = self._coord(rider_loc.get("longitude") or rider_loc.get("lng"))
        if rider_lat is not None and rider_lng is not None:
            delivery["rider_lat"] = rider_lat
            delivery["rider_lng"] = rider_lng
        metadata["delivery"] = delivery
        order.metadata = metadata
        if retrying:
            order.status = OrderStatus.READY
        order.save(update_fields=["metadata", "status", "updated_at", "version"])
        history = TrackingHistoryService()
        if retrying:
            history.record_status(
                order=order,
                status="retrying",
                source=TrackingEventSource.DISPATCH,
                source_key=f"retrying:{booking_id}",
            )
        attempt = history.open_attempt(
            order=order,
            provider=str(delivery.get("provider") or ""),
            booking_id=booking_id,
            tracking_url=str(delivery.get("tracking_url") or ""),
            rider=dict(delivery.get("rider") or {}),
        )
        history.record_status(
            order=order,
            attempt=attempt,
            status=status,
            source=TrackingEventSource.DISPATCH,
            eta_minutes=delivery.get("eta_minutes"),
            source_key=f"dispatch:{booking_id}:{status}",
        )
        notify_online_order(order=order, status=status)
        return order

    def _customer_location_from_order(self, *, order: ShopOrder) -> dict[str, Any]:
        """Customer address pin used as reverse-pickup collection point.

        Prefers the order delivery pin; falls back to the customer's default
        mapped address so pickup/instant-return still works when the original
        order lacked coordinates.
        """
        metadata = order.metadata if isinstance(order.metadata, dict) else {}
        delivery = metadata.get("delivery") if isinstance(metadata.get("delivery"), dict) else {}
        drop = dict(delivery.get("drop") or {})
        lat = self._coord(drop.get("latitude")) or self._coord(metadata.get("delivery_latitude"))
        lng = self._coord(drop.get("longitude")) or self._coord(metadata.get("delivery_longitude"))
        address = str(drop.get("address") or order.delivery_address or "")
        address_2 = str(
            drop.get("address_2")
            or drop.get("address_line2")
            or metadata.get("delivery_address_line2")
            or ""
        )
        city = str(drop.get("city") or metadata.get("delivery_city") or "")
        state = str(drop.get("state") or metadata.get("delivery_state") or "")
        postal_code = str(
            drop.get("postal_code") or metadata.get("delivery_postal_code") or ""
        )
        if lat is None or lng is None:
            customer = getattr(order, "customer", None)
            if customer is not None:
                from apps.customers.models import CustomerAddress

                addr = (
                    CustomerAddress.objects.filter(customer=customer)
                    .exclude(latitude__isnull=True)
                    .exclude(longitude__isnull=True)
                    .order_by("-is_default", "-created_at")
                    .first()
                )
                if addr is not None:
                    lat = self._coord(addr.latitude)
                    lng = self._coord(addr.longitude)
                    if not address:
                        address = ", ".join(
                            part
                            for part in [
                                str(addr.line1 or "").strip(),
                                str(addr.line2 or "").strip(),
                                str(addr.city or "").strip(),
                            ]
                            if part
                        )
                    if not address_2:
                        address_2 = str(addr.line2 or "").strip()
                    if not city:
                        city = str(addr.city or "").strip()
                    if not state:
                        state = str(addr.state or "").strip()
                    if not postal_code:
                        postal_code = str(addr.postal_code or "").strip()
        if lat is None or lng is None:
            raise ValidationError(
                {
                    "delivery_address": (
                        "Instant return pickup needs a mapped address. "
                        "Add a delivery pin on your address book and try again."
                    )
                }
            )
        customer_name, customer_phone = resolve_order_delivery_contact(
            order=order,
            delivery=delivery,
        )
        drop_contact = drop.get("contact") if isinstance(drop.get("contact"), dict) else {}
        return self._location(
            latitude=lat,
            longitude=lng,
            address=address,
            address_2=address_2,
            city=city,
            state=state,
            postal_code=postal_code,
            contact_name=str(drop_contact.get("name") or customer_name),
            contact_phone=str(drop_contact.get("phone") or customer_phone),
        )

    def quote_return_pickup(
        self,
        *,
        tenant: Tenant,
        business: Business,
        order: ShopOrder,
    ) -> dict[str, Any]:
        """Quote a rider to collect from the customer and drop at the shop."""
        settings = self.ensure_settings(tenant=tenant, business=business)
        if not settings.instant_delivery_enabled:
            return {"available": False, "reason": "instant_delivery_disabled"}
        customer_pickup = self._customer_location_from_order(order=order)
        shop_source = self.pickup_source(business=business)
        if shop_source is None:
            return {"available": False, "reason": "shop_pickup_unavailable"}
        zone = DeliveryZoneService().match_zone(
            tenant=tenant,
            business=business,
            city=str(customer_pickup.get("city") or ""),
            postal_code=str(customer_pickup.get("postal_code") or ""),
        )
        if zone is None:
            return {"available": False, "reason": "outside_delivery_zone"}
        if not zone.instant_delivery_enabled:
            return {"available": False, "reason": "instant_delivery_disabled_for_zone"}
        # Swap vs outbound: pickup = customer, drop = shop.
        shop_drop = self._location(
            latitude=shop_source["latitude"],
            longitude=shop_source["longitude"],
            address=", ".join(
                part
                for part in (
                    shop_source.get("address_parts")
                    or [
                        shop_source.get("address_line1"),
                        shop_source.get("address_line2"),
                        shop_source.get("city"),
                        shop_source.get("state"),
                        shop_source.get("postal_code"),
                    ]
                )
                if part
            ),
            city=str(shop_source.get("city") or ""),
            state=str(shop_source.get("state") or ""),
            postal_code=str(shop_source.get("postal_code") or ""),
            contact_name=str(shop_source.get("contact_name") or business.display_name),
            contact_phone=str(shop_source.get("contact_phone") or business.primary_contact or ""),
        )
        shop_drop["branch_id"] = shop_source.get("branch_id") or ""
        customer_name = str((customer_pickup.get("contact") or {}).get("name") or "")
        customer_phone = str((customer_pickup.get("contact") or {}).get("phone") or "")
        config = self._decrypted_config(settings)
        provider = get_delivery_provider(config)
        payload = {
            "pickup": customer_pickup,
            "drop": shop_drop,
            "customer": {"name": customer_name, "phone": customer_phone},
        }
        result: DeliveryQuote = provider.quote(payload)
        # Merchant bears reverse-pickup fee in v1 (not charged to customer).
        return {
            "available": True,
            "provider": result.provider,
            "provider_label": (
                "Shiprocket Quick"
                if result.provider == "shiprocket_quick"
                else result.provider.title()
            ),
            "quote_id": result.quote_id,
            "quoted_fee": str(result.fee.quantize(Decimal("0.01"))),
            "customer_fee": "0.00",
            "merchant_fee": str(result.fee.quantize(Decimal("0.01"))),
            "eta_minutes": result.eta_minutes,
            "expires_in_seconds": result.expires_in_seconds,
            "delivery_zone_id": str(zone.id),
            "delivery_zone_name": zone.name,
            "pickup": customer_pickup,
            "drop": shop_drop,
            "direction": "return_pickup",
            "partner_status": "packing",
        }

    @transaction.atomic
    def dispatch_return_pickup(self, *, shop_return: ShopReturn) -> ShopReturn:
        shop_return = (
            ShopReturn.objects.select_for_update(of=("self",))
            .select_related("business", "customer", "tenant", "order", "order__customer")
            .get(id=shop_return.id)
        )
        if shop_return.return_method != ReturnMethod.INSTANT_PICKUP:
            raise ValidationError(
                {"return_method": "Instant rider dispatch is only for instant pickup returns."}
            )
        if shop_return.status in {"completed", "rejected"}:
            raise ValidationError({"status": "This return can no longer be updated."})
        metadata = dict(shop_return.metadata or {})
        delivery = dict(metadata.get("delivery") or {})
        if not delivery:
            raise ValidationError({"delivery": "This return has no instant-pickup quote."})
        if delivery.get("booking_id"):
            return shop_return
        settings = self.ensure_settings(
            tenant=shop_return.tenant, business=shop_return.business
        )
        if not settings.instant_delivery_enabled:
            raise ValidationError({"delivery": "Instant delivery is not enabled for this shop."})
        config = self._decrypted_config(settings)
        provider = get_delivery_provider(config)
        order = shop_return.order
        customer_name, customer_phone = resolve_order_delivery_contact(
            order=order,
            delivery=dict((order.metadata or {}).get("delivery") or {}),
        )
        pickup = merge_location_contact(
            delivery.get("pickup") or {},
            name=customer_name,
            phone=customer_phone,
        )
        drop = merge_location_contact(delivery.get("drop") or {})
        if not customer_phone:
            raise ValidationError(
                {"delivery": "Customer mobile number is required before dispatching a rider."}
            )
        payload = {
            "request_id": str(shop_return.id),
            "quote_id": delivery.get("quote_id"),
            "pickup": pickup,
            "drop": drop,
            "customer": {
                "name": customer_name,
                "phone": customer_phone,
            },
            "order": {
                "id": str(order.id),
                "number": order.order_number,
                "amount": str(shop_return.refund_total),
                "payment_method": "",
            },
            "eta_minutes": delivery.get("eta_minutes"),
        }
        booked = provider.book(payload)
        booking_id = str(booked.get("booking_id") or "")
        if not booking_id:
            raise ValidationError({"delivery_provider": "Provider did not return a booking ID."})
        status = normalize_partner_status(booked.get("partner_status"))
        now = timezone.now().isoformat()
        rider = dict(booked.get("rider") or {})
        rider_loc = rider.get("location") if isinstance(rider.get("location"), dict) else {}
        delivery.update(
            {
                "booking_id": booking_id,
                "tracking_url": str(booked.get("tracking_url") or ""),
                "partner_status": status,
                "rider": {key: value for key, value in rider.items() if key != "location"},
                "eta_minutes": booked.get("eta_minutes") or delivery.get("eta_minutes"),
                "events": [
                    *(delivery.get("events") or []),
                    {"status": status, "occurred_at": now, "label": "Pickup requested"},
                ],
                "last_updated": now,
                "reason": "",
                "direction": "return_pickup",
            }
        )
        rider_lat = self._coord(rider_loc.get("latitude") or rider_loc.get("lat"))
        rider_lng = self._coord(rider_loc.get("longitude") or rider_loc.get("lng"))
        if rider_lat is not None and rider_lng is not None:
            delivery["rider_lat"] = rider_lat
            delivery["rider_lng"] = rider_lng
        metadata["delivery"] = delivery
        shop_return.metadata = metadata
        shop_return.pickup_arranged_at = timezone.now()
        if booked.get("tracking_url"):
            shop_return.pickup_tracking_number = str(booking_id)[:128]
        shop_return.status = "approved"
        shop_return.save(
            update_fields=[
                "metadata",
                "pickup_arranged_at",
                "pickup_tracking_number",
                "status",
                "updated_at",
                "version",
            ]
        )
        history = TrackingHistoryService()
        history.open_attempt(
            shop_return=shop_return,
            provider=str(delivery.get("provider") or ""),
            booking_id=booking_id,
            tracking_url=str(delivery.get("tracking_url") or ""),
            rider=dict(delivery.get("rider") or {}),
        )
        return shop_return

    @transaction.atomic
    def apply_return_tracking(
        self,
        *,
        shop_return: ShopReturn,
        payload: dict[str, Any],
        source: str = TrackingEventSource.POLL,
        source_key: str = "",
        attempt: ShopDeliveryAttempt | None = None,
    ) -> ShopReturn:
        shop_return = ShopReturn.objects.select_for_update().get(id=shop_return.id)
        metadata = dict(shop_return.metadata or {})
        delivery = dict(metadata.get("delivery") or {})
        tracking = self._extract_tracking(payload)
        history = TrackingHistoryService()
        attempt = attempt or history.active_attempt_for_return(shop_return=shop_return)
        if attempt is not None and attempt.status != DeliveryAttemptStatus.ACTIVE:
            return shop_return
        previous = str(delivery.get("partner_status") or "")
        current = self._resolve_partner_status(
            previous=previous,
            incoming=tracking["partner_status"],
        )
        tracking["partner_status"] = current
        delivery["rider"] = self._merge_rider(
            existing=dict(delivery.get("rider") or {}),
            incoming=dict(tracking.pop("rider") or {}),
        )
        for key, value in tracking.items():
            if value not in (None, "", {}):
                delivery[key] = value
        if current != previous:
            delivery["events"] = [
                *(delivery.get("events") or []),
                {
                    "status": current,
                    "occurred_at": timezone.now().isoformat(),
                    "label": current.replace("_", " ").title(),
                    **({"reason": tracking["reason"]} if tracking.get("reason") else {}),
                },
            ]
        delivery["last_updated"] = timezone.now().isoformat()
        if current in {"failed", "cancelled"}:
            delivery = self._archive_failed_booking(delivery)
        metadata["delivery"] = delivery
        shop_return.metadata = metadata
        shop_return.save(update_fields=["metadata", "updated_at", "version"])
        if attempt is not None:
            history.update_attempt(
                attempt=attempt,
                rider=dict(delivery.get("rider") or {}),
                tracking_url=str(delivery.get("tracking_url") or ""),
            )
        if attempt is not None and current in TERMINAL_PARTNER_STATUSES:
            attempt_status = {
                "delivered": DeliveryAttemptStatus.DELIVERED,
                "failed": DeliveryAttemptStatus.FAILED,
                "cancelled": DeliveryAttemptStatus.CANCELLED,
            }[current]
            history.update_attempt(
                attempt=attempt,
                status=attempt_status,
                reason=str(tracking.get("reason") or ""),
                ended_at=timezone.now(),
            )
        return shop_return

    def refresh_return_tracking(self, *, shop_return: ShopReturn) -> ShopReturn:
        delivery = (shop_return.metadata or {}).get("delivery") or {}
        booking_id = str(delivery.get("booking_id") or "")
        if not booking_id or delivery.get("partner_status") in TERMINAL_PARTNER_STATUSES:
            return shop_return
        settings = self.ensure_settings(
            tenant=shop_return.tenant, business=shop_return.business
        )
        provider = get_delivery_provider(self._decrypted_config(settings))
        return self.apply_return_tracking(
            shop_return=shop_return,
            payload=provider.track(booking_id),
            source=TrackingEventSource.POLL,
        )

    def live_return_payload(
        self, *, shop_return: ShopReturn, refresh: bool = False
    ) -> dict[str, Any]:
        if refresh:
            shop_return = self.refresh_return_tracking(shop_return=shop_return)
        delivery = dict((shop_return.metadata or {}).get("delivery") or {})
        rider = dict(delivery.get("rider") or {})
        status = str(delivery.get("partner_status") or "packing")
        rider_name = str(rider.get("name") or "").strip()
        headlines = {
            "packing": "Waiting for the shop to dispatch a pickup rider",
            "finding_rider": "Finding a pickup rider",
            "rider_assigned": f"{rider_name or 'Your rider'} is heading to you",
            "at_pickup": f"{rider_name or 'Your rider'} has arrived for pickup",
            "picked_up": f"{rider_name or 'Your rider'} is returning items to the shop",
            "nearby": "Almost at the shop",
            "delivered": "Items delivered to the shop — awaiting confirmation",
            "failed": "Pickup needs attention",
            "cancelled": "Pickup was cancelled",
        }
        eta = delivery.get("eta_minutes")
        headline = headlines.get(status, "Pickup update")
        if eta and status not in TERMINAL_PARTNER_STATUSES:
            headline = f"{headline} · {eta} min"
        events = list(delivery.get("events") or [])
        last_updated = delivery.get("last_updated")
        parsed_last_updated = parse_datetime(str(last_updated or ""))
        terminal = status in TERMINAL_PARTNER_STATUSES or shop_return.status in {
            "completed",
            "rejected",
        }
        stale = bool(
            not terminal
            and parsed_last_updated
            and (timezone.now() - parsed_last_updated).total_seconds() > 45
        )
        pickup = dict(delivery.get("pickup") or {})
        drop = dict(delivery.get("drop") or {})
        for place in (pickup, drop):
            place["latitude"] = self._coord(place.get("latitude"))
            place["longitude"] = self._coord(place.get("longitude"))
        rider_lat = self._coord(delivery.get("rider_lat"))
        rider_lng = self._coord(delivery.get("rider_lng"))
        dispatched = bool(delivery.get("booking_id"))
        # If partner GPS is missing (or still on the pickup pin), nudge toward the
        # shop so the rider marker is visible and not buried under the customer pin.
        pickup_lat = pickup.get("latitude")
        pickup_lng = pickup.get("longitude")
        drop_lat = drop.get("latitude")
        drop_lng = drop.get("longitude")
        if dispatched and pickup_lat is not None and drop_lat is not None:
            try:
                nudged_lat = float(pickup_lat) + (float(drop_lat) - float(pickup_lat)) * 0.08
                nudged_lng = float(pickup_lng) + (float(drop_lng) - float(pickup_lng)) * 0.08
            except (TypeError, ValueError):
                nudged_lat = nudged_lng = None
            else:
                coincident = (
                    rider_lat is not None
                    and rider_lng is not None
                    and abs(rider_lat - float(pickup_lat)) < 1e-5
                    and abs(rider_lng - float(pickup_lng)) < 1e-5
                )
                if rider_lat is None or rider_lng is None or coincident:
                    rider_lat, rider_lng = nudged_lat, nudged_lng
        has_map_pins = (
            pickup_lat is not None and pickup_lng is not None
        ) or (drop_lat is not None and drop_lng is not None)
        return {
            "available": shop_return.return_method == ReturnMethod.INSTANT_PICKUP,
            "return_id": str(shop_return.id),
            "return_status": shop_return.status,
            "delivery_method": "instant_pickup",
            "provider": delivery.get("provider"),
            "dispatched": dispatched,
            "partner_status": status,
            "headline": headline,
            "subtitle": str(delivery.get("reason") or ""),
            "eta_minutes": eta,
            "rider": rider,
            "pickup": pickup,
            "drop": drop,
            "rider_location": {
                "latitude": rider_lat,
                "longitude": rider_lng,
            },
            "location_trail": [],
            "events": events,
            "tracking_url": str(delivery.get("tracking_url") or ""),
            "can_call_rider": bool(rider.get("phone")),
            "last_updated": last_updated or (events[-1].get("occurred_at") if events else None),
            "terminal": terminal,
            "stale": stale,
            "show_map": dispatched and has_map_pins,
        }

    def _extract_tracking(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
        rider = data.get("rider") or data.get("driver") or {}
        location = rider.get("location") or data.get("location") or {}
        return {
            "partner_status": normalize_partner_status(
                data.get("partner_status") or data.get("status") or data.get("event")
            ),
            "eta_minutes": data.get("eta_minutes") or data.get("eta"),
            "rider": {
                "name": rider.get("name") or "",
                "phone": rider.get("phone") or rider.get("phone_number") or "",
                "vehicle": rider.get("vehicle") or rider.get("vehicle_number") or "",
                "photo_url": rider.get("photo_url") or "",
            },
            "rider_lat": location.get("latitude") or location.get("lat"),
            "rider_lng": location.get("longitude") or location.get("lng"),
            "reason": data.get("reason") or data.get("message") or "",
        }

    def _merge_rider(
        self,
        *,
        existing: dict[str, Any],
        incoming: dict[str, Any],
    ) -> dict[str, Any]:
        # Providers routinely omit the rider block on later status pings, so a
        # partial payload must never blank out details captured at booking.
        merged = dict(existing)
        for key, value in incoming.items():
            if value not in (None, "", {}):
                merged[key] = value
        return merged

    def _resolve_partner_status(self, *, previous: str, incoming: str) -> str:
        if previous == incoming:
            return incoming
        if previous in TERMINAL_PARTNER_STATUSES:
            return previous
        if incoming in TERMINAL_PARTNER_STATUSES:
            return incoming
        try:
            forward = PARTNER_STATUS_SEQUENCE.index(incoming) > PARTNER_STATUS_SEQUENCE.index(
                previous
            )
        except ValueError:
            return incoming
        return incoming if forward else previous

    def _order_status_for_partner_status(self, *, order: ShopOrder, status: str) -> str:
        if status == "delivered":
            return OrderStatus.COMPLETED
        if status in {"picked_up", "nearby"}:
            return OrderStatus.OUT_FOR_DELIVERY
        if status in {"failed", "cancelled"}:
            # Cancelling the order itself stays a merchant decision because it
            # has to release stock and coupons.
            if order.status in {OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY}:
                return OrderStatus.DELIVERY_FAILED
            return order.status
        return order.status

    def _archive_failed_booking(self, delivery: dict[str, Any]) -> dict[str, Any]:
        """Retire a dead booking so the shop can request a fresh rider.

        The quote is kept for the retry, and the attempt is filed under
        `attempts` so the failed rider's details are not lost.
        """
        if not delivery.get("booking_id"):
            return delivery
        delivery["attempts"] = [
            *(delivery.get("attempts") or []),
            {
                "booking_id": delivery.get("booking_id"),
                "partner_status": delivery.get("partner_status"),
                "rider": delivery.get("rider") or {},
                "reason": delivery.get("reason") or "",
                "ended_at": timezone.now().isoformat(),
            },
        ]
        for key in ("booking_id", "tracking_url", "rider", "rider_lat", "rider_lng"):
            delivery.pop(key, None)
        return delivery

    @transaction.atomic
    def apply_tracking(
        self,
        *,
        order: ShopOrder,
        payload: dict[str, Any],
        source: str = TrackingEventSource.POLL,
        source_key: str = "",
        webhook_event: ShopDeliveryWebhookEvent | None = None,
        attempt: ShopDeliveryAttempt | None = None,
    ) -> ShopOrder:
        order = ShopOrder.objects.select_for_update().get(id=order.id)
        metadata = dict(order.metadata or {})
        delivery = dict(metadata.get("delivery") or {})
        tracking = self._extract_tracking(payload)
        history = TrackingHistoryService()
        attempt = attempt or history.active_attempt(order=order)
        if attempt is not None and attempt.status != DeliveryAttemptStatus.ACTIVE:
            # A delayed webhook for an archived attempt is acknowledged and
            # retained in ShopDeliveryWebhookEvent, but it must not rewrite or
            # extend the customer-visible history after that attempt closed.
            return order
        previous = str(delivery.get("partner_status") or "")
        current = self._resolve_partner_status(
            previous=previous,
            incoming=tracking["partner_status"],
        )
        tracking["partner_status"] = current
        delivery["rider"] = self._merge_rider(
            existing=dict(delivery.get("rider") or {}),
            incoming=dict(tracking.pop("rider") or {}),
        )
        for key, value in tracking.items():
            if value not in (None, "", {}):
                delivery[key] = value
        if current != previous:
            delivery["events"] = [
                *(delivery.get("events") or []),
                {
                    "status": current,
                    "occurred_at": timezone.now().isoformat(),
                    "label": current.replace("_", " ").title(),
                    **({"reason": tracking["reason"]} if tracking.get("reason") else {}),
                },
            ]
        delivery["last_updated"] = timezone.now().isoformat()
        order.status = self._order_status_for_partner_status(order=order, status=current)
        if current in {"failed", "cancelled"}:
            delivery = self._archive_failed_booking(delivery)
        metadata["delivery"] = delivery
        order.metadata = metadata
        order.save(update_fields=["metadata", "status", "updated_at", "version"])
        if attempt is not None:
            history.update_attempt(
                attempt=attempt,
                rider=dict(delivery.get("rider") or {}),
                tracking_url=str(delivery.get("tracking_url") or ""),
            )
        if current != previous:
            history.record_status(
                order=order,
                attempt=attempt,
                status=current,
                source=source,
                source_key=f"{source_key}:status" if source_key else "",
                webhook_event=webhook_event,
                reason=str(tracking.get("reason") or ""),
                eta_minutes=tracking.get("eta_minutes"),
            )
        history.record_location(
            order=order,
            attempt=attempt,
            latitude=tracking.get("rider_lat"),
            longitude=tracking.get("rider_lng"),
            source=source,
            status=current,
            eta_minutes=tracking.get("eta_minutes"),
            source_key=f"{source_key}:location" if source_key else "",
            webhook_event=webhook_event,
        )
        if attempt is not None and current in TERMINAL_PARTNER_STATUSES:
            attempt_status = {
                "delivered": DeliveryAttemptStatus.DELIVERED,
                "failed": DeliveryAttemptStatus.FAILED,
                "cancelled": DeliveryAttemptStatus.CANCELLED,
            }[current]
            history.update_attempt(
                attempt=attempt,
                status=attempt_status,
                reason=str(tracking.get("reason") or ""),
                ended_at=timezone.now(),
            )
        if current != previous:
            notify_online_order(order=order, status=current)
        return order

    def simulate_tracking(self, *, order: ShopOrder, status: str = "") -> ShopOrder:
        """Advance a mock booking by hand so testers can step the lifecycle.

        Restricted to the mock provider: a shop wired to a real partner must
        only ever move on partner-reported events.
        """
        delivery = dict((order.metadata or {}).get("delivery") or {})
        if not delivery.get("booking_id"):
            raise ValidationError({"delivery": "Dispatch the order before simulating tracking."})
        settings = self.ensure_settings(tenant=order.tenant, business=order.business)
        config = self._decrypted_config(settings)
        if str(config.get("provider") or "") != "mock":
            raise ValidationError(
                {"delivery": "Tracking can only be simulated on the mock provider."}
            )
        current = normalize_partner_status(delivery.get("partner_status"))
        if status:
            target = normalize_partner_status(status)
        elif current in TERMINAL_PARTNER_STATUSES:
            target = current
        else:
            index = PARTNER_STATUS_SEQUENCE.index(current)
            target = PARTNER_STATUS_SEQUENCE[min(index + 1, len(PARTNER_STATUS_SEQUENCE) - 1)]
        return self.apply_tracking(
            order=order,
            payload={
                "booking_id": delivery["booking_id"],
                "partner_status": target,
                "rider": delivery.get("rider") or {},
            },
            source=TrackingEventSource.SIMULATION,
            source_key=f"simulation:{delivery['booking_id']}:{target}",
        )

    def refresh_tracking(self, *, order: ShopOrder) -> ShopOrder:
        from apps.shopie.services.shipment import ShipmentService

        shipment = ShipmentService().get_shipment(order=order)
        if shipment is not None and (shipment.metadata or {}).get("provider") == "shiprocket_standard":
            from apps.shopie.services.shiprocket_standard import ShiprocketStandardService

            try:
                ShiprocketStandardService().refresh_shipment(shipment=shipment)
            except Exception:
                pass
            order.refresh_from_db()
            return order

        delivery = (order.metadata or {}).get("delivery") or {}
        booking_id = str(delivery.get("booking_id") or "")
        if not booking_id or delivery.get("partner_status") in TERMINAL_PARTNER_STATUSES:
            return order
        settings = self.ensure_settings(tenant=order.tenant, business=order.business)
        provider = get_delivery_provider(self._decrypted_config(settings))
        return self.apply_tracking(
            order=order,
            payload=provider.track(booking_id),
            source=TrackingEventSource.POLL,
        )

    def _coord(self, value: object) -> float | None:
        if value in (None, ""):
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return number if math.isfinite(number) else None

    def _map_places_for_order(
        self,
        *,
        order: ShopOrder,
        delivery: dict[str, Any],
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Shop pickup + customer drop pins for the live map (instant or standard)."""
        metadata = order.metadata if isinstance(order.metadata, dict) else {}
        fulfillment = metadata.get("fulfillment") if isinstance(metadata.get("fulfillment"), dict) else {}
        fulfillment_pickup = (
            fulfillment.get("pickup") if isinstance(fulfillment.get("pickup"), dict) else {}
        )

        pickup = dict(delivery.get("pickup") or {})
        if self._coord(pickup.get("latitude")) is None or self._coord(pickup.get("longitude")) is None:
            pickup = {
                **pickup,
                "latitude": self._coord(fulfillment_pickup.get("latitude")),
                "longitude": self._coord(fulfillment_pickup.get("longitude")),
                "address": pickup.get("address")
                or ", ".join(
                    part
                    for part in [
                        str(fulfillment_pickup.get("address_line1") or "").strip(),
                        str(fulfillment_pickup.get("address_line2") or "").strip(),
                        str(fulfillment_pickup.get("city") or "").strip(),
                    ]
                    if part
                ),
                "contact": pickup.get("contact")
                or {
                    "name": str(fulfillment_pickup.get("contact_name") or "").strip(),
                    "phone": str(fulfillment_pickup.get("contact_phone") or "").strip(),
                },
            }

        drop = dict(delivery.get("drop") or {})
        if self._coord(drop.get("latitude")) is None or self._coord(drop.get("longitude")) is None:
            drop = {
                **drop,
                "latitude": self._coord(metadata.get("delivery_latitude")),
                "longitude": self._coord(metadata.get("delivery_longitude")),
                "address": drop.get("address") or str(order.delivery_address or "").strip(),
                "contact": drop.get("contact")
                or {
                    "name": str(getattr(getattr(order, "customer", None), "display_name", "") or "").strip(),
                    "phone": str(getattr(getattr(order, "customer", None), "phone_number", "") or "").strip(),
                },
            }
        elif not drop.get("address"):
            drop["address"] = str(order.delivery_address or "").strip()

        # Normalize numeric coords for map clients.
        for place in (pickup, drop):
            lat = self._coord(place.get("latitude"))
            lng = self._coord(place.get("longitude"))
            place["latitude"] = lat
            place["longitude"] = lng
        return pickup, drop

    def live_payload(self, *, order: ShopOrder, refresh: bool = False) -> dict[str, Any]:
        if refresh:
            order = self.refresh_tracking(order=order)
        from apps.shopie.services.delivery_promise import promise_from_shipment
        from apps.shopie.services.shipment import ShipmentService

        is_pickup = order.fulfillment_mode == FulfillmentMode.PICKUP
        delivery_method = (
            "pickup"
            if is_pickup
            else str((order.metadata or {}).get("delivery_method") or "standard")
        )
        shipment = ShipmentService().get_shipment(order=order)
        shipment_data = ShipmentService().serialize(shipment)
        delivery = dict((order.metadata or {}).get("delivery") or {})
        map_pickup, map_drop = (
            ({}, {})
            if is_pickup
            else self._map_places_for_order(order=order, delivery=delivery)
        )
        has_drop_pin = map_drop.get("latitude") is not None and map_drop.get("longitude") is not None
        order_completed = order.status == OrderStatus.COMPLETED
        if is_pickup:
            status = canonical_order_status(order, order.status) or "order_placed"
            headlines = {
                "order_placed": "Order placed",
                "confirmed": "Order confirmed",
                "ready": "Ready for pickup",
                "completed": "Picked up",
                "cancelled": "Cancelled",
            }
            headline = headlines.get(status, "Order update")
            if order_completed:
                promise = {
                    "label": "Picked up",
                    "detail": "Your order has been picked up.",
                    "arrives_by": None,
                }
            else:
                promise = {}
        elif order_completed:
            status = "delivered"
            headline = "Delivered"
            promise = {"label": "Delivered", "detail": "Your order has been delivered.", "arrives_by": None}
        elif shipment is not None and delivery_method == "standard":
            from apps.shopie.services.carriers import is_self_delivery_carrier

            status = str(shipment.status or "shipped")
            carrier = shipment.carrier_label or "Courier"
            self_delivery = is_self_delivery_carrier(shipment.carrier)
            promise = promise_from_shipment(
                estimated_delivery_at=shipment.estimated_delivery_at,
                status=status,
            )
            if self_delivery:
                headlines = {
                    "shipped": "Shop is delivering your order",
                    "in_transit": "Shop is on the way",
                    "out_for_delivery": "Shop is on the way",
                    "delivered": "Delivered",
                    "failed": "Delivery needs attention",
                }
            else:
                headlines = {
                    "shipped": f"Shipped with {carrier}",
                    "in_transit": "Your package is on the way",
                    "out_for_delivery": promise.get("label") or "Arriving today",
                    "delivered": "Delivered",
                    "failed": "Delivery needs attention",
                }
            headline = headlines.get(status, "Shipment update")
        else:
            status = str(
                delivery.get("partner_status")
                or canonical_order_status(order, order.status)
                or "order_placed"
            )
            rider = dict(delivery.get("rider") or {})
            eta = delivery.get("eta_minutes")
            rider_name = str(rider.get("name") or "").strip()
            headlines = {
                "order_placed": "Order placed",
                "confirmed": "Order confirmed",
                "packing": "The shop is packing your order",
                "packed": "Packed and ready",
                "finding_rider": "Finding a delivery rider",
                "rider_assigned": f"{rider_name or 'Your rider'} is heading to the shop",
                "at_pickup": "Your rider is at the shop",
                "picked_up": f"{rider_name or 'Your rider'} is on the way",
                "out_for_delivery": "Your order is out for delivery",
                "nearby": "Your delivery is nearby",
                "delivered": "Delivered",
                "delivery_failed": "Delivery needs attention",
                "delivery_cancelled": "Delivery was cancelled",
                "retrying": "The shop is requesting another rider",
                "failed": "Delivery needs attention",
                "cancelled": "Delivery was cancelled",
            }
            headline = headlines.get(status, "Delivery update")
            if eta and status not in TERMINAL_PARTNER_STATUSES:
                headline = f"{headline} · {eta} min"
            promise = {}
        TrackingHistoryService().ensure_baseline_history(order=order)
        history = TrackingHistoryService().payload(order=order)
        events = history["events"] or delivery.get("events") or []
        last_updated = delivery.get("last_updated")
        if shipment is not None and shipment.shipped_at:
            last_updated = shipment.shipped_at.isoformat()
        parsed_last_updated = parse_datetime(str(last_updated or ""))
        terminal = order.status in {
            OrderStatus.COMPLETED,
            OrderStatus.RETURNED,
            OrderStatus.CANCELLED,
        }
        stale = bool(
            not terminal
            and parsed_last_updated
            and (timezone.now() - parsed_last_updated).total_seconds() > 45
        )
        rider = dict(delivery.get("rider") or {})
        eta = delivery.get("eta_minutes")
        tracking_url = delivery.get("tracking_url") or ""
        if shipment is not None:
            tracking_url = shipment.tracking_url or tracking_url
        return {
            "available": order.fulfillment_mode
            in {FulfillmentMode.DELIVERY, FulfillmentMode.PICKUP},
            "order_id": str(order.id),
            "order_status": order.status,
            "delivery_method": delivery_method,
            "provider": None if is_pickup else delivery.get("provider"),
            "dispatched": False
            if is_pickup
            else bool(delivery.get("booking_id")) or shipment is not None,
            "partner_status": status,
            "headline": headline,
            "subtitle": "" if is_pickup else (delivery.get("reason") or ""),
            "eta_minutes": None if is_pickup else eta,
            "rider": {} if is_pickup else rider,
            "pickup": map_pickup,
            "drop": map_drop,
            "rider_location": {
                "latitude": None if is_pickup else delivery.get("rider_lat"),
                "longitude": None if is_pickup else delivery.get("rider_lng"),
            },
            "events": events,
            "attempts": [] if is_pickup else history["attempts"],
            "active_attempt_number": None if is_pickup else history["active_attempt_number"],
            "location_trail": [] if is_pickup else history["location_trail"],
            "tracking_url": "" if is_pickup else tracking_url,
            "shipment": None if is_pickup else shipment_data,
            "delivery_promise": promise
            if is_pickup or shipment is not None
            else (order.metadata or {}).get("delivery_promise") or {},
            "can_call_rider": False if is_pickup else bool(rider.get("phone")),
            "last_updated": last_updated or (events[-1].get("occurred_at") if events else None),
            "terminal": terminal,
            "stale": False if is_pickup else stale,
            # Instant: live rider map. Standard: static shop → customer pins when we have coords.
            "show_map": False
            if is_pickup
            else (
                (delivery_method == "instant" and bool(delivery.get("booking_id")))
                or has_drop_pin
            ),
        }

    def verify_webhook(
        self,
        *,
        provider: str,
        business: Business,
        body: bytes,
        signature: str,
    ) -> bool:
        settings = self.ensure_settings(tenant=business.tenant, business=business)
        config = self._decrypted_config(settings)
        secret = str(config.get("webhook_secret") or "")
        if not secret:
            return False
        expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, str(signature or "").removeprefix("sha256="))

    def process_webhook(
        self,
        *,
        provider: str,
        business: Business,
        body: bytes,
        signature: str,
        external_event_id: str = "",
    ) -> dict[str, Any]:
        if not self.verify_webhook(
            provider=provider,
            business=business,
            body=body,
            signature=signature,
        ):
            return {"accepted": False, "reason": "invalid_signature"}
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            return {"accepted": False, "reason": "invalid_payload"}
        booking_id = str(
            payload.get("booking_id")
            or payload.get("order_id")
            or (payload.get("data") or {}).get("booking_id")
            or ""
        )
        event_id = str(
            external_event_id
            or payload.get("event_id")
            or payload.get("id")
            or f"{booking_id}:{payload.get('status')}:{uuid.uuid4().hex}"
        )
        event, created = ShopDeliveryWebhookEvent.objects.get_or_create(
            provider=provider,
            external_event_id=event_id[:160],
            defaults={
                "tenant": business.tenant,
                "business": business,
                "event_type": str(payload.get("event") or payload.get("status") or ""),
                "payload": payload,
            },
        )
        if not created:
            return {"accepted": True, "duplicate": True, "event_id": event_id}
        attempt = TrackingHistoryService().attempt_for_booking(booking_id=booking_id)
        order = ShopOrder.objects.filter(
            tenant=business.tenant,
            business=business,
            metadata__delivery__booking_id=booking_id,
        ).first()
        if order is None and attempt is not None and attempt.business_id == business.id:
            order = attempt.order
        shop_return = None
        if order is None:
            shop_return = ShopReturn.objects.filter(
                tenant=business.tenant,
                business=business,
                metadata__delivery__booking_id=booking_id,
            ).first()
            if (
                shop_return is None
                and attempt is not None
                and attempt.business_id == business.id
                and attempt.shop_return_id
            ):
                shop_return = attempt.shop_return
        if order is None and shop_return is None:
            event.status = DeliveryWebhookStatus.IGNORED
            event.error_message = "No matching order or return."
        else:
            try:
                if shop_return is not None:
                    self.apply_return_tracking(
                        shop_return=shop_return,
                        payload=payload,
                        source=TrackingEventSource.WEBHOOK,
                        source_key=f"webhook:{provider}:{event_id}",
                        attempt=attempt,
                    )
                else:
                    order = self.apply_tracking(
                        order=order,
                        payload=payload,
                        source=TrackingEventSource.WEBHOOK,
                        source_key=f"webhook:{provider}:{event_id}",
                        webhook_event=event,
                        attempt=attempt,
                    )
                    event.order = order
                event.status = DeliveryWebhookStatus.PROCESSED
                event.processed_at = timezone.now()
            except Exception as exc:
                event.status = DeliveryWebhookStatus.FAILED
                event.error_message = str(exc)
                event.processed_at = timezone.now()
                event.save()
                self._schedule_webhook_retry(event)
                raise
        event.save()
        return {"accepted": True, "event_id": event_id, "status": event.status}

    def _schedule_webhook_retry(self, event: ShopDeliveryWebhookEvent) -> None:
        if event.retry_count >= len(WEBHOOK_RETRY_DELAYS):
            event.status = DeliveryWebhookStatus.DEAD_LETTER
            event.next_retry_at = None
            event.save(update_fields=["status", "next_retry_at", "updated_at"])
            return
        countdown = WEBHOOK_RETRY_DELAYS[event.retry_count]
        event.retry_count += 1
        event.next_retry_at = timezone.now() + timedelta(seconds=countdown)
        event.save(update_fields=["retry_count", "next_retry_at", "updated_at"])
        from apps.shopie.tasks import reprocess_delivery_webhook_event_task

        reprocess_delivery_webhook_event_task.apply_async(
            args=[str(event.id)],
            countdown=countdown,
        )

    def reprocess_webhook_event(self, *, event: ShopDeliveryWebhookEvent) -> dict[str, Any]:
        if event.business is None:
            event.status = DeliveryWebhookStatus.DEAD_LETTER
            event.error_message = "Business no longer exists."
            event.next_retry_at = None
            event.save()
            return {"processed": False, "status": event.status}
        payload = dict(event.payload or {})
        booking_id = str(
            payload.get("booking_id")
            or payload.get("order_id")
            or (payload.get("data") or {}).get("booking_id")
            or ""
        )
        attempt = TrackingHistoryService().attempt_for_booking(booking_id=booking_id)
        order = ShopOrder.objects.filter(
            tenant=event.tenant,
            business=event.business,
            metadata__delivery__booking_id=booking_id,
        ).first()
        if order is None and attempt is not None and attempt.business_id == event.business_id:
            order = attempt.order
        shop_return = None
        if order is None:
            shop_return = ShopReturn.objects.filter(
                tenant=event.tenant,
                business=event.business,
                metadata__delivery__booking_id=booking_id,
            ).first()
            if (
                shop_return is None
                and attempt is not None
                and attempt.business_id == event.business_id
                and attempt.shop_return_id
            ):
                shop_return = attempt.shop_return
        if order is None and shop_return is None:
            event.status = DeliveryWebhookStatus.IGNORED
            event.error_message = "No matching order or return."
            event.next_retry_at = None
            event.save()
            return {"processed": False, "status": event.status}
        try:
            if shop_return is not None:
                self.apply_return_tracking(
                    shop_return=shop_return,
                    payload=payload,
                    source=TrackingEventSource.WEBHOOK,
                    source_key=f"webhook:{event.provider}:{event.external_event_id}",
                    attempt=attempt,
                )
            else:
                order = self.apply_tracking(
                    order=order,
                    payload=payload,
                    source=TrackingEventSource.WEBHOOK,
                    source_key=f"webhook:{event.provider}:{event.external_event_id}",
                    webhook_event=event,
                    attempt=attempt,
                )
                event.order = order
            event.status = DeliveryWebhookStatus.PROCESSED
            event.processed_at = timezone.now()
            event.next_retry_at = None
            event.error_message = ""
            event.save()
            return {"processed": True, "status": event.status}
        except Exception as exc:
            event.status = DeliveryWebhookStatus.FAILED
            event.error_message = str(exc)
            event.processed_at = timezone.now()
            event.save()
            self._schedule_webhook_retry(event)
            return {"processed": False, "status": event.status, "error": str(exc)}
