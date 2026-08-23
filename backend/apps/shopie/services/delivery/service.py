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

from apps.businesses.models import Branch, BranchStatus, Business
from apps.shopie.models import (
    DeliveryWebhookStatus,
    OrderStatus,
    ShopBusinessSettings,
    ShopDeliveryWebhookEvent,
    ShopOrder,
)
from apps.shopie.services.delivery.providers import DeliveryQuote, get_delivery_provider
from apps.shopie.services.delivery_secrets import decrypt_secret, encrypt_secret, mask_secret
from apps.shopie.services.order_notify import notify_online_order
from apps.tenancy.models import Tenant

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
        return {
            "instant_delivery_enabled": settings.instant_delivery_enabled,
            "delivery_integration": {**config, "credentials": masked},
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
            "contact": {"name": contact_name, "phone": contact_phone},
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
            contact_phone=str(drop_contact.get("phone") or customer_phone),
        )
        return {
            "pickup": pickup,
            "drop": normalized_drop,
            "customer": {"name": customer_name, "phone": customer_phone},
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
        if order.status != OrderStatus.READY:
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
        settings = self.ensure_settings(tenant=order.tenant, business=order.business)
        if not settings.instant_delivery_enabled:
            raise ValidationError({"delivery": "Instant delivery is not enabled for this shop."})
        config = self._decrypted_config(settings)
        provider = get_delivery_provider(config)
        payload = {
            "request_id": str(order.id),
            "quote_id": delivery.get("quote_id"),
            "pickup": delivery.get("pickup") or {},
            "drop": delivery.get("drop") or {},
            "customer": {
                "name": getattr(order.customer, "display_name", "") if order.customer else "",
                "phone": getattr(order.customer, "phone_number", "") if order.customer else "",
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
            }
        )
        metadata["delivery"] = delivery
        order.metadata = metadata
        order.save(update_fields=["metadata", "updated_at", "version"])
        notify_online_order(order=order, status="finding_rider")
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

    @transaction.atomic
    def apply_tracking(self, *, order: ShopOrder, payload: dict[str, Any]) -> ShopOrder:
        order = ShopOrder.objects.select_for_update().get(id=order.id)
        metadata = dict(order.metadata or {})
        delivery = dict(metadata.get("delivery") or {})
        tracking = self._extract_tracking(payload)
        previous = str(delivery.get("partner_status") or "")
        current = tracking["partner_status"]
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
        metadata["delivery"] = delivery
        order.metadata = metadata
        if current in {"picked_up", "nearby"}:
            order.status = OrderStatus.OUT_FOR_DELIVERY
        elif current == "delivered":
            order.status = OrderStatus.COMPLETED
        order.save(update_fields=["metadata", "status", "updated_at", "version"])
        if current != previous:
            notify_online_order(order=order, status=current)
        return order

    def refresh_tracking(self, *, order: ShopOrder) -> ShopOrder:
        delivery = (order.metadata or {}).get("delivery") or {}
        booking_id = str(delivery.get("booking_id") or "")
        if not booking_id or delivery.get("partner_status") in TERMINAL_PARTNER_STATUSES:
            return order
        settings = self.ensure_settings(tenant=order.tenant, business=order.business)
        provider = get_delivery_provider(self._decrypted_config(settings))
        return self.apply_tracking(order=order, payload=provider.track(booking_id))

    def live_payload(self, *, order: ShopOrder, refresh: bool = False) -> dict[str, Any]:
        if refresh:
            order = self.refresh_tracking(order=order)
        delivery = dict((order.metadata or {}).get("delivery") or {})
        status = str(delivery.get("partner_status") or "packing")
        rider = dict(delivery.get("rider") or {})
        eta = delivery.get("eta_minutes")
        rider_name = str(rider.get("name") or "").strip()
        headlines = {
            "packing": "The shop is packing your order",
            "finding_rider": "Finding a delivery rider",
            "rider_assigned": f"{rider_name or 'Your rider'} is heading to the shop",
            "at_pickup": "Your rider is at the shop",
            "picked_up": f"{rider_name or 'Your rider'} is on the way",
            "nearby": "Your delivery is nearby",
            "delivered": "Delivered",
            "failed": "Delivery needs attention",
            "cancelled": "Delivery was cancelled",
        }
        headline = headlines.get(status, "Delivery update")
        if eta and status not in TERMINAL_PARTNER_STATUSES:
            headline = f"{headline} · {eta} min"
        return {
            "available": bool(delivery),
            "order_id": str(order.id),
            "provider": delivery.get("provider"),
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
            "events": delivery.get("events") or [],
            "tracking_url": delivery.get("tracking_url") or "",
            "can_call_rider": bool(rider.get("phone")),
            "last_updated": delivery.get("last_updated"),
            "terminal": status in TERMINAL_PARTNER_STATUSES,
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
        order = ShopOrder.objects.filter(
            tenant=business.tenant,
            business=business,
            metadata__delivery__booking_id=booking_id,
        ).first()
        if order is None:
            event.status = DeliveryWebhookStatus.IGNORED
            event.error_message = "No matching order."
        else:
            try:
                order = self.apply_tracking(order=order, payload=payload)
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
        order = ShopOrder.objects.filter(
            tenant=event.tenant,
            business=event.business,
            metadata__delivery__booking_id=booking_id,
        ).first()
        if order is None:
            event.status = DeliveryWebhookStatus.IGNORED
            event.error_message = "No matching order."
            event.next_retry_at = None
            event.save()
            return {"processed": False, "status": event.status}
        try:
            order = self.apply_tracking(order=order, payload=payload)
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
