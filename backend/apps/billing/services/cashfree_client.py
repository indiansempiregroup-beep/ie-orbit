from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import uuid
from dataclasses import dataclass
from typing import Any
from urllib import error, request

from django.conf import settings

logger = logging.getLogger("ie_orbit.billing.cashfree")

CASHFREE_API_VERSION = "2023-08-01"
CASHFREE_SANDBOX_BASE = "https://sandbox.cashfree.com/pg"
CASHFREE_PRODUCTION_BASE = "https://api.cashfree.com/pg"


@dataclass(frozen=True)
class CashfreeConfig:
    app_id: str
    secret_key: str
    env: str = "sandbox"

    @property
    def is_configured(self) -> bool:
        return bool(self.app_id and self.secret_key)

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def api_base(self) -> str:
        return CASHFREE_PRODUCTION_BASE if self.is_production else CASHFREE_SANDBOX_BASE


def get_cashfree_config() -> CashfreeConfig:
    env = str(getattr(settings, "CASHFREE_ENV", "sandbox") or "sandbox").strip().lower()
    if env not in {"sandbox", "production"}:
        env = "sandbox"
    return CashfreeConfig(
        app_id=str(getattr(settings, "CASHFREE_APP_ID", "") or "").strip(),
        secret_key=str(getattr(settings, "CASHFREE_SECRET_KEY", "") or "").strip(),
        env=env,
    )


class CashfreeClient:
    def __init__(self, config: CashfreeConfig | None = None) -> None:
        self.config = config or get_cashfree_config()

    @property
    def is_configured(self) -> bool:
        return self.config.is_configured

    def create_order(
        self,
        *,
        amount_paise: int,
        currency: str,
        order_id: str,
        customer_id: str,
        customer_phone: str = "9999999999",
        customer_email: str = "",
        notes: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        if not self.is_configured:
            mock_id = order_id or f"cf_mock_{uuid.uuid4().hex[:20]}"
            session_id = f"session_mock_{uuid.uuid4().hex[:20]}"
            logger.info(
                "cashfree.mock_order_created", extra={"order_id": mock_id, "amount": amount_paise}
            )
            return {
                "order_id": mock_id,
                "payment_session_id": session_id,
                "order_amount": amount_paise / 100,
                "order_currency": currency,
                "order_status": "ACTIVE",
                "mock": True,
            }

        payload: dict[str, Any] = {
            "order_id": order_id,
            "order_amount": round(amount_paise / 100, 2),
            "order_currency": currency,
            "customer_details": {
                "customer_id": customer_id[:50],
                "customer_phone": (customer_phone or "9999999999")[:15],
            },
            "order_note": json.dumps(notes or {})[:150],
        }
        email = str(customer_email or "").strip()
        if email:
            payload["customer_details"]["customer_email"] = email
        return self._request("POST", "/orders", payload)

    def get_order(self, order_id: str) -> dict[str, Any]:
        if not self.is_configured:
            return {"order_id": order_id, "order_status": "PAID", "mock": True}
        return self._request("GET", f"/orders/{order_id}")

    def get_payments(self, order_id: str) -> list[dict[str, Any]]:
        if not self.is_configured:
            return [{"payment_status": "SUCCESS", "cf_payment_id": f"pay_mock_{order_id}"}]
        payload = self._request("GET", f"/orders/{order_id}/payments")
        if isinstance(payload, list):
            return payload
        rows = payload.get("data")
        return rows if isinstance(rows, list) else []

    def test_connection(self) -> bool:
        if not self.is_configured:
            return False
        try:
            self._request("GET", "/orders/ie-orbit-connection-test")
        except RuntimeError as exc:
            # Cashfree has no credential-introspection endpoint. A missing
            # synthetic order proves authentication succeeded; any other
            # response (auth, rate limit, or server failure) is not a pass.
            if "Cashfree API error (404)" not in str(exc):
                raise
        return True

    def verify_webhook_signature(self, *, body: bytes, timestamp: str, signature: str) -> bool:
        # Cashfree signs PG webhooks with the merchant Secret Key.
        # It does not use a separately configured webhook secret.
        secret = self.config.secret_key
        if not secret:
            logger.warning("cashfree.secret_key_missing")
            return not self.is_configured
        if not timestamp or not signature:
            return False
        signed_payload = f"{timestamp}{body.decode('utf-8')}"
        digest = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256).digest()
        expected = base64.b64encode(digest).decode()
        return hmac.compare_digest(expected, signature)

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{self.config.api_base}{path}"
        data = json.dumps(payload).encode() if payload is not None else None
        req = request.Request(
            url,
            data=data,
            method=method,
            headers={
                "x-client-id": self.config.app_id,
                "x-client-secret": self.config.secret_key,
                "x-api-version": CASHFREE_API_VERSION,
                "Content-Type": "application/json",
            },
        )
        try:
            with request.urlopen(req, timeout=15) as response:
                raw = response.read().decode()
                parsed = json.loads(raw) if raw else {}
                if isinstance(parsed, list):
                    return {"data": parsed}
                return parsed if isinstance(parsed, dict) else {"data": parsed}
        except error.HTTPError as exc:
            body = exc.read().decode()
            logger.error("cashfree.api_error", extra={"status": exc.code, "body": body})
            raise RuntimeError(f"Cashfree API error ({exc.code}): {body}") from exc
