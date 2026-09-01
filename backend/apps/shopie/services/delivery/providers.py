from __future__ import annotations

import json
import math
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Protocol

from django.core.exceptions import ValidationError

from apps.shopie.services.delivery.contact import porter_book_payload, porter_quote_payload


@dataclass(frozen=True)
class DeliveryQuote:
    quote_id: str
    fee: Decimal
    eta_minutes: int
    provider: str
    expires_in_seconds: int = 300


class DeliveryProvider(Protocol):
    code: str

    def quote(self, payload: dict[str, Any]) -> DeliveryQuote: ...

    def book(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    def cancel(self, booking_id: str) -> dict[str, Any]: ...

    def track(self, booking_id: str) -> dict[str, Any]: ...


def _distance_km(pickup: dict[str, Any], drop: dict[str, Any]) -> float:
    lat1, lng1 = math.radians(float(pickup["latitude"])), math.radians(float(pickup["longitude"]))
    lat2, lng2 = math.radians(float(drop["latitude"])), math.radians(float(drop["longitude"]))
    dlat, dlng = lat2 - lat1, lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


class MockDeliveryProvider:
    """Test double that walks a booking through the lifecycle on a timer.

    The booking id carries its creation timestamp so progression needs no
    server-side state and survives restarts between test steps.
    """

    code = "mock"
    # Seconds after booking at which each stage begins.
    STAGES = (
        (0, "rider_assigned"),
        (30, "at_pickup"),
        (60, "picked_up"),
        (120, "nearby"),
        (180, "delivered"),
    )
    RIDER = {
        "name": "Demo rider",
        "phone": "+910000000000",
        "vehicle": "Two-wheeler",
        "photo_url": "",
    }

    def _booked_at(self, booking_id: str) -> datetime | None:
        parts = str(booking_id).split("_")
        for part in parts:
            if part.isdigit() and len(part) >= 10:
                return datetime.fromtimestamp(int(part), tz=UTC)
        return None

    def _stage_for(self, booking_id: str) -> str:
        booked_at = self._booked_at(booking_id)
        if booked_at is None:
            return "rider_assigned"
        elapsed = (datetime.now(tz=UTC) - booked_at).total_seconds()
        stage = self.STAGES[0][1]
        for offset, name in self.STAGES:
            if elapsed >= offset:
                stage = name
        return stage

    def _route_for(self, booking_id: str) -> tuple[float, float, float, float] | None:
        parts = str(booking_id).split("_")
        if len(parts) < 8:
            return None
        try:
            return tuple(float(value) for value in parts[3:7])  # type: ignore[return-value]
        except (TypeError, ValueError):
            return None

    def quote(self, payload: dict[str, Any]) -> DeliveryQuote:
        km = _distance_km(payload["pickup"], payload["drop"])
        fee = (Decimal("35") + Decimal(str(round(km, 2))) * Decimal("8")).quantize(
            Decimal("0.01")
        )
        return DeliveryQuote(
            quote_id=f"mock_quote_{uuid.uuid4().hex}",
            fee=fee,
            eta_minutes=max(20, int(20 + km * 3)),
            provider=self.code,
        )

    def book(self, payload: dict[str, Any]) -> dict[str, Any]:
        stamp = int(datetime.now(tz=UTC).timestamp())
        pickup = payload.get("pickup") or {}
        drop = payload.get("drop") or {}
        route = "_".join(
            str(value)
            for value in (
                pickup.get("latitude", ""),
                pickup.get("longitude", ""),
                drop.get("latitude", ""),
                drop.get("longitude", ""),
            )
        )
        return {
            "booking_id": f"mock_delivery_{stamp}_{route}_{uuid.uuid4().hex}",
            "tracking_url": "",
            "partner_status": "rider_assigned",
            "eta_minutes": int(payload.get("eta_minutes") or 25),
            "rider": dict(self.RIDER),
        }

    def cancel(self, booking_id: str) -> dict[str, Any]:
        return {"booking_id": booking_id, "partner_status": "cancelled"}

    def track(self, booking_id: str) -> dict[str, Any]:
        stage = self._stage_for(booking_id)
        remaining = {
            "rider_assigned": 12,
            "at_pickup": 9,
            "picked_up": 6,
            "nearby": 2,
        }
        rider = dict(self.RIDER)
        route = self._route_for(booking_id)
        if route is not None:
            pickup_lat, pickup_lng, drop_lat, drop_lng = route
            booked_at = self._booked_at(booking_id)
            elapsed = (
                (datetime.now(tz=UTC) - booked_at).total_seconds()
                if booked_at
                else 0
            )
            progress = min(1.0, max(0.0, (elapsed - 60) / 120))
            rider["location"] = {
                "latitude": pickup_lat + (drop_lat - pickup_lat) * progress,
                "longitude": pickup_lng + (drop_lng - pickup_lng) * progress,
            }
        return {
            "booking_id": booking_id,
            "partner_status": stage,
            "rider": rider,
            **({"eta_minutes": remaining[stage]} if stage in remaining else {}),
        }


class JsonHttpProvider:
    code = ""

    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self.base_url = str(config.get("base_url") or "").rstrip("/")
        if not self.base_url:
            raise ValidationError({"base_url": f"{self.code} API base URL is required."})

    def _headers(self) -> dict[str, str]:
        return {"Accept": "application/json", "Content-Type": "application/json"}

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = path if path.startswith("http") else f"{self.base_url}/{path.lstrip('/')}"
        if query:
            filtered = {
                key: value
                for key, value in query.items()
                if value not in (None, "")
            }
            if filtered:
                separator = "&" if "?" in url else "?"
                url = f"{url}{separator}{urllib.parse.urlencode(filtered)}"
        body = None
        if method.upper() != "GET" and payload is not None:
            body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            headers=self._headers(),
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                decoded = json.loads(response.read().decode("utf-8") or "{}")
                return decoded if isinstance(decoded, dict) else {"data": decoded}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise ValidationError(
                {"delivery_provider": f"{self.code} returned HTTP {exc.code}: {detail[:300]}"}
            ) from exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise ValidationError(
                {"delivery_provider": f"{self.code} is temporarily unavailable."}
            ) from exc


def _value(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        value: Any = data
        for part in key.split("."):
            if isinstance(value, dict):
                value = value.get(part)
            elif isinstance(value, list) and part.isdigit() and int(part) < len(value):
                value = value[int(part)]
            else:
                value = None
        if value not in (None, ""):
            return value
    return default


class PorterProvider(JsonHttpProvider):
    code = "porter"

    def _headers(self) -> dict[str, str]:
        headers = super()._headers()
        api_key = str(self.config.get("api_key") or "")
        headers["X-API-KEY"] = api_key
        headers["Authorization"] = f"Bearer {api_key}"
        return headers

    def quote(self, payload: dict[str, Any]) -> DeliveryQuote:
        raw = self._request(
            "POST",
            str(self.config.get("quote_path") or "/v1/get_quote"),
            payload=porter_quote_payload(payload),
        )
        fee = _value(raw, "fee", "estimated_fare", "fare.amount", "vehicles.0.fare")
        if fee is None:
            raise ValidationError({"delivery_provider": "Porter did not return a delivery fee."})
        return DeliveryQuote(
            quote_id=str(_value(raw, "quote_id", "id", "request_id", default=uuid.uuid4())),
            fee=Decimal(str(fee)),
            eta_minutes=int(_value(raw, "eta_minutes", "estimated_eta", "duration", default=30)),
            provider=self.code,
            expires_in_seconds=int(_value(raw, "expires_in", default=300)),
        )

    def book(self, payload: dict[str, Any]) -> dict[str, Any]:
        raw = self._request(
            "POST",
            str(self.config.get("book_path") or "/v1/orders/create"),
            payload=porter_book_payload(payload),
        )
        return {
            **raw,
            "booking_id": str(_value(raw, "booking_id", "order_id", "id", default="")),
            "tracking_url": str(_value(raw, "tracking_url", "tracking.url", default="")),
            "partner_status": str(_value(raw, "status", default="finding_rider")),
        }

    def cancel(self, booking_id: str) -> dict[str, Any]:
        return self._request(
            "POST",
            str(self.config.get("cancel_path") or f"/v1/orders/{booking_id}/cancel"),
            payload={"order_id": booking_id},
        )

    def track(self, booking_id: str) -> dict[str, Any]:
        return self._request(
            "GET",
            str(self.config.get("track_path") or f"/v1/orders/{booking_id}"),
        )


def _digits(value: object, *, length: int = 10) -> str:
    digits = "".join(char for char in str(value or "") if char.isdigit())
    return digits[-length:] if digits else ""


def _split_person_name(value: object) -> tuple[str, str]:
    parts = str(value or "").strip().split()
    if not parts:
        return "Customer", "."
    if len(parts) == 1:
        return parts[0], "."
    return parts[0], " ".join(parts[1:])


class ShiprocketQuickProvider(JsonHttpProvider):
    code = "shiprocket_quick"
    DEFAULT_BASE_URL = "https://apiv2.shiprocket.in/v1/external"

    def __init__(self, config: dict[str, Any]) -> None:
        merged = dict(config)
        if not str(merged.get("base_url") or "").strip():
            merged["base_url"] = self.DEFAULT_BASE_URL
        self._token = str(merged.get("api_key") or merged.get("token") or "")
        self._skip_auth = False
        super().__init__(merged)

    def _headers(self) -> dict[str, str]:
        headers = super()._headers()
        if not self._skip_auth and self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
        retry_auth: bool = True,
    ) -> dict[str, Any]:
        try:
            return super()._request(method, path, payload=payload, query=query)
        except ValidationError as exc:
            detail = str(exc)
            if (
                retry_auth
                and ("HTTP 401" in detail or "HTTP 403" in detail)
                and self.config.get("email")
                and self.config.get("password")
            ):
                self._login()
                return self._request(
                    method,
                    path,
                    payload=payload,
                    query=query,
                    retry_auth=False,
                )
            raise

    def _login(self) -> None:
        email = str(self.config.get("email") or "").strip()
        password = str(self.config.get("password") or "")
        if not email or not password:
            raise ValidationError(
                {
                    "delivery_provider": (
                        "Add the Shiprocket API user email and password "
                        "(Settings → API → Create an API User). "
                        "Do not use the dashboard login email."
                    )
                }
            )
        self._skip_auth = True
        try:
            raw = JsonHttpProvider._request(
                self,
                "POST",
                str(self.config.get("auth_path") or "/auth/login"),
                payload={"email": email, "password": password},
            )
        finally:
            self._skip_auth = False
        token = _value(raw, "token")
        if not token:
            raise ValidationError(
                {"delivery_provider": "Shiprocket did not return an API token."}
            )
        self._token = str(token)

    def _ensure_token(self) -> None:
        if not self._token:
            self._login()

    def quote(self, payload: dict[str, Any]) -> DeliveryQuote:
        custom_path = str(self.config.get("quote_path") or "")
        if custom_path and custom_path not in {"/rates", "rates"}:
            self._ensure_token()
            raw = self._request("POST", custom_path, payload=payload)
            fee = _value(raw, "fee", "rate", "amount", "data.fee", "data.rate")
            if fee is None:
                raise ValidationError(
                    {"delivery_provider": "Shiprocket did not return a delivery fee."}
                )
            return DeliveryQuote(
                quote_id=str(
                    _value(raw, "quote_id", "id", "data.quote_id", default=uuid.uuid4())
                ),
                fee=Decimal(str(fee)),
                eta_minutes=int(
                    _value(raw, "eta_minutes", "eta", "data.eta_minutes", default=30)
                ),
                provider=self.code,
                expires_in_seconds=int(_value(raw, "expires_in", default=300)),
            )

        pickup = payload.get("pickup") or {}
        drop = payload.get("drop") or {}
        pickup_pin = str(pickup.get("postal_code") or "").strip()
        drop_pin = str(drop.get("postal_code") or "").strip()
        if not pickup_pin or not drop_pin:
            raise ValidationError(
                {
                    "delivery_provider": (
                        "Shiprocket needs pickup and delivery PIN codes. "
                        "Set the office PIN under Settings → Offices and use a mapped address."
                    )
                }
            )
        self._ensure_token()
        weight = str(
            self.config.get("default_parcel_weight_kg")
            or payload.get("weight")
            or "1"
        )
        raw = self._request(
            "GET",
            str(self.config.get("serviceability_path") or "/courier/serviceability/"),
            query={
                "pickup_postcode": pickup_pin,
                "delivery_postcode": drop_pin,
                "weight": weight,
                "cod": "1" if str(payload.get("payment_method") or "").lower() in {
                    "cod",
                    "cash",
                } else "0",
            },
        )
        companies = _value(
            raw,
            "data.available_courier_companies",
            "available_courier_companies",
            default=[],
        )
        if not isinstance(companies, list) or not companies:
            raise ValidationError(
                {
                    "delivery_provider": (
                        "Shiprocket has no courier for this PIN pair. "
                        "Confirm Quick/hyperlocal is enabled on the account, "
                        "or that standard couriers cover both PINs."
                    )
                }
            )
        company = self._pick_courier(companies)
        fee = _value(company, "rate", "freight_charge", "rate_after_discount")
        if fee is None:
            raise ValidationError(
                {"delivery_provider": "Shiprocket did not return a delivery fee."}
            )
        return DeliveryQuote(
            quote_id=str(
                _value(
                    company,
                    "courier_company_id",
                    "id",
                    default=uuid.uuid4(),
                )
            ),
            fee=Decimal(str(fee)),
            eta_minutes=self._eta_minutes(company),
            provider=self.code,
        )

    def book(self, payload: dict[str, Any]) -> dict[str, Any]:
        custom_path = str(self.config.get("book_path") or "")
        if custom_path and custom_path not in {"/orders", "orders"}:
            self._ensure_token()
            raw = self._request("POST", custom_path, payload=payload)
            return self._booking_from_response(raw)

        pickup = payload.get("pickup") or {}
        drop = payload.get("drop") or {}
        customer = payload.get("customer") or {}
        order = payload.get("order") or {}
        pickup_contact = pickup.get("contact") if isinstance(pickup.get("contact"), dict) else {}
        drop_contact = drop.get("contact") if isinstance(drop.get("contact"), dict) else {}
        first_name, last_name = _split_person_name(
            drop_contact.get("name") or customer.get("name")
        )
        phone = _digits(drop_contact.get("phone") or customer.get("phone"))
        amount = str(order.get("amount") or "1")
        payment = str(order.get("payment_method") or "").lower()
        weight = str(self.config.get("default_parcel_weight_kg") or "1")
        self._ensure_token()
        raw = self._request(
            "POST",
            str(self.config.get("create_order_path") or "/orders/create/adhoc"),
            payload={
                "order_id": str(order.get("number") or order.get("id") or uuid.uuid4()),
                "order_date": datetime.now(UTC).strftime("%Y-%m-%d %H:%M"),
                "pickup_location": str(
                    self.config.get("pickup_location") or "Primary"
                ),
                "billing_customer_name": first_name,
                "billing_last_name": last_name,
                "billing_address": str(drop.get("address") or pickup.get("address") or "Address"),
                "billing_address_2": "",
                "billing_city": str(drop.get("city") or ""),
                "billing_pincode": str(drop.get("postal_code") or ""),
                "billing_state": str(drop.get("state") or ""),
                "billing_country": "India",
                "billing_email": str(
                    customer.get("email")
                    or self.config.get("billing_email")
                    or "orders@example.com"
                ),
                "billing_phone": phone or _digits(pickup_contact.get("phone")) or "9999999999",
                "shipping_is_billing": True,
                "payment_method": "COD" if payment in {"cod", "cash"} else "Prepaid",
                "sub_total": amount,
                "length": 10,
                "breadth": 10,
                "height": 10,
                "weight": weight,
                "order_items": [
                    {
                        "name": str(order.get("number") or "Shop order"),
                        "sku": str(order.get("id") or "SHOP"),
                        "units": 1,
                        "selling_price": amount,
                    }
                ],
            },
        )
        return self._booking_from_response(raw)

    def cancel(self, booking_id: str) -> dict[str, Any]:
        self._ensure_token()
        custom_path = str(self.config.get("cancel_path") or "")
        if custom_path:
            return self._request(
                "POST",
                custom_path,
                payload={"order_id": booking_id},
            )
        try:
            order_id = int(booking_id)
        except (TypeError, ValueError):
            order_id = booking_id
        return self._request(
            "POST",
            "/orders/cancel",
            payload={"ids": [order_id]},
        )

    def track(self, booking_id: str) -> dict[str, Any]:
        self._ensure_token()
        custom_path = str(self.config.get("track_path") or "")
        if custom_path:
            return self._request("GET", custom_path)
        return self._request("GET", f"/courier/track/shipment/{booking_id}")

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

        preferred = [item for item in parsed if is_quick(item)] or parsed

        def rate_key(item: dict[str, Any]) -> Decimal:
            fee = _value(item, "rate", "freight_charge", "rate_after_discount", default="999999")
            try:
                return Decimal(str(fee))
            except Exception:
                return Decimal("999999")

        return min(preferred, key=rate_key)

    @staticmethod
    def _eta_minutes(company: dict[str, Any]) -> int:
        hours = _value(company, "etd_hours", "estimated_hours")
        if hours not in (None, ""):
            try:
                return max(20, int(float(hours) * 60))
            except (TypeError, ValueError):
                pass
        days = _value(company, "estimated_delivery_days")
        if days not in (None, ""):
            try:
                value = float(str(days).split()[0])
                if value < 1:
                    return 45
                return max(45, int(value * 24 * 60))
            except (TypeError, ValueError):
                pass
        return 45

    @staticmethod
    def _booking_from_response(raw: dict[str, Any]) -> dict[str, Any]:
        booking_id = str(
            _value(
                raw,
                "shipment_id",
                "payload.shipment_id",
                "booking_id",
                "order_id",
                "payload.order_id",
                "data.id",
                "id",
                default="",
            )
        )
        return {
            **raw,
            "booking_id": booking_id,
            "tracking_url": str(
                _value(raw, "tracking_url", "data.tracking_url", default="")
            ),
            "partner_status": str(
                _value(raw, "status", "payload.status", "data.status", default="finding_rider")
            ),
        }


def get_delivery_provider(config: dict[str, Any]) -> DeliveryProvider:
    provider = str(config.get("provider") or "mock").strip().lower()
    if provider == "mock":
        return MockDeliveryProvider()
    if provider == "porter":
        return PorterProvider(config)
    if provider == "shiprocket_quick":
        return ShiprocketQuickProvider(config)
    raise ValidationError({"provider": f"Unsupported delivery provider: {provider}"})
