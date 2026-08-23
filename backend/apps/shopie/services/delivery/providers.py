from __future__ import annotations

import json
import math
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Protocol

from django.core.exceptions import ValidationError


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
    code = "mock"

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
        return {
            "booking_id": f"mock_delivery_{uuid.uuid4().hex}",
            "tracking_url": "",
            "partner_status": "rider_assigned",
            "eta_minutes": int(payload.get("eta_minutes") or 25),
            "rider": {
                "name": "Demo rider",
                "phone": "+910000000000",
                "vehicle": "Two-wheeler",
                "photo_url": "",
            },
        }

    def cancel(self, booking_id: str) -> dict[str, Any]:
        return {"booking_id": booking_id, "partner_status": "cancelled"}

    def track(self, booking_id: str) -> dict[str, Any]:
        return {"booking_id": booking_id, "partner_status": "rider_assigned"}


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
    ) -> dict[str, Any]:
        url = path if path.startswith("http") else f"{self.base_url}/{path.lstrip('/')}"
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8") if payload is not None else None,
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
            payload={
                "pickup_details": payload["pickup"],
                "drop_details": payload["drop"],
                "customer": payload.get("customer") or {},
            },
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
            payload=payload,
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


class ShiprocketQuickProvider(JsonHttpProvider):
    code = "shiprocket_quick"

    def _headers(self) -> dict[str, str]:
        headers = super()._headers()
        token = str(self.config.get("api_key") or self.config.get("token") or "")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def quote(self, payload: dict[str, Any]) -> DeliveryQuote:
        raw = self._request(
            "POST",
            str(self.config.get("quote_path") or "/rates"),
            payload=payload,
        )
        fee = _value(raw, "fee", "rate", "amount", "data.fee", "data.rate")
        if fee is None:
            raise ValidationError(
                {"delivery_provider": "Shiprocket Quick did not return a delivery fee."}
            )
        return DeliveryQuote(
            quote_id=str(_value(raw, "quote_id", "id", "data.quote_id", default=uuid.uuid4())),
            fee=Decimal(str(fee)),
            eta_minutes=int(_value(raw, "eta_minutes", "eta", "data.eta_minutes", default=30)),
            provider=self.code,
            expires_in_seconds=int(_value(raw, "expires_in", default=300)),
        )

    def book(self, payload: dict[str, Any]) -> dict[str, Any]:
        raw = self._request(
            "POST",
            str(self.config.get("book_path") or "/orders"),
            payload=payload,
        )
        return {
            **raw,
            "booking_id": str(_value(raw, "booking_id", "order_id", "data.id", "id", default="")),
            "tracking_url": str(
                _value(raw, "tracking_url", "data.tracking_url", default="")
            ),
            "partner_status": str(
                _value(raw, "status", "data.status", default="finding_rider")
            ),
        }

    def cancel(self, booking_id: str) -> dict[str, Any]:
        return self._request(
            "POST",
            str(self.config.get("cancel_path") or f"/orders/{booking_id}/cancel"),
            payload={"order_id": booking_id},
        )

    def track(self, booking_id: str) -> dict[str, Any]:
        return self._request(
            "GET",
            str(self.config.get("track_path") or f"/orders/{booking_id}/tracking"),
        )


def get_delivery_provider(config: dict[str, Any]) -> DeliveryProvider:
    provider = str(config.get("provider") or "mock").strip().lower()
    if provider == "mock":
        return MockDeliveryProvider()
    if provider == "porter":
        return PorterProvider(config)
    if provider == "shiprocket_quick":
        return ShiprocketQuickProvider(config)
    raise ValidationError({"provider": f"Unsupported delivery provider: {provider}"})
