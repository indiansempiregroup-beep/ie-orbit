from __future__ import annotations

import hashlib
import hmac
import json
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
    OrderStatus,
    ShopBusinessSettings,
    ShopDeliveryAttempt,
    ShopDeliveryWebhookEvent,
    ShopOrder,
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
        settings.delivery_integration = merged
        settings.save(
            update_fields=[
                "instant_delivery_enabled",
                "delivery_integration",
                "updated_at",
                "version",
            ]
        )
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
        city: str = "",
        state: str = "",
        postal_code: str = "",
        contact_name: str = "",
        contact_phone: str = "",
    ) -> dict[str, Any]:
        if latitude in (None, "") or longitude in (None, ""):
            raise ValidationError({"delivery_address": "A mapped address is required."})
        return {
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
        delivery.update(
            {
                "booking_id": booking_id,
                "tracking_url": str(booked.get("tracking_url") or ""),
                "partner_status": status,
                "rider": booked.get("rider") or {},
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

    def live_payload(self, *, order: ShopOrder, refresh: bool = False) -> dict[str, Any]:
        if refresh:
            order = self.refresh_tracking(order=order)
        from apps.shopie.services.delivery_promise import promise_from_shipment
        from apps.shopie.services.shipment import ShipmentService

        delivery_method = str((order.metadata or {}).get("delivery_method") or "standard")
        shipment = ShipmentService().get_shipment(order=order)
        shipment_data = ShipmentService().serialize(shipment)
        delivery = dict((order.metadata or {}).get("delivery") or {})
        if shipment is not None and delivery_method == "standard":
            status = str(shipment.status or "shipped")
            carrier = shipment.carrier_label or "Courier"
            promise = promise_from_shipment(
                estimated_delivery_at=shipment.estimated_delivery_at,
                status=status,
            )
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
        history = TrackingHistoryService().payload(order=order)
        events = history["events"] or delivery.get("events") or []
        last_updated = delivery.get("last_updated")
        if shipment is not None and shipment.shipped_at:
            last_updated = shipment.shipped_at.isoformat()
        parsed_last_updated = parse_datetime(str(last_updated or ""))
        terminal = order.status in {OrderStatus.COMPLETED, OrderStatus.CANCELLED}
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
            "available": order.fulfillment_mode == "delivery",
            "order_id": str(order.id),
            "order_status": order.status,
            "delivery_method": delivery_method,
            "provider": delivery.get("provider"),
            "dispatched": bool(delivery.get("booking_id")) or shipment is not None,
            "partner_status": status,
            "headline": headline,
            "subtitle": delivery.get("reason") or "",
            "eta_minutes": eta,
            "rider": rider,
            "pickup": delivery.get("pickup") or {},
            "drop": delivery.get("drop") or {},
            "rider_location": {
                "latitude": delivery.get("rider_lat"),
                "longitude": delivery.get("rider_lng"),
            },
            "events": events,
            "attempts": history["attempts"],
            "active_attempt_number": history["active_attempt_number"],
            "location_trail": history["location_trail"],
            "tracking_url": tracking_url,
            "shipment": shipment_data,
            "delivery_promise": promise if shipment is not None else (order.metadata or {}).get("delivery_promise") or {},
            "can_call_rider": bool(rider.get("phone")),
            "last_updated": last_updated or (events[-1].get("occurred_at") if events else None),
            "terminal": terminal,
            "stale": stale,
            "show_map": delivery_method == "instant" and bool(delivery.get("booking_id")),
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
        if order is None:
            event.status = DeliveryWebhookStatus.IGNORED
            event.error_message = "No matching order."
        else:
            try:
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
        if order is None:
            event.status = DeliveryWebhookStatus.IGNORED
            event.error_message = "No matching order."
            event.next_retry_at = None
            event.save()
            return {"processed": False, "status": event.status}
        try:
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
