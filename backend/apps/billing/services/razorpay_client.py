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

logger = logging.getLogger("ie_orbit.billing.razorpay")

RAZORPAY_API_BASE = "https://api.razorpay.com/v1"


@dataclass(frozen=True)
class RazorpayConfig:
    key_id: str
    key_secret: str
    webhook_secret: str

    @property
    def is_configured(self) -> bool:
        return bool(self.key_id and self.key_secret)


def get_razorpay_config() -> RazorpayConfig:
    return RazorpayConfig(
        key_id=getattr(settings, "RAZORPAY_KEY_ID", ""),
        key_secret=getattr(settings, "RAZORPAY_KEY_SECRET", ""),
        webhook_secret=getattr(settings, "RAZORPAY_WEBHOOK_SECRET", ""),
    )


class RazorpayClient:
    def __init__(self, config: RazorpayConfig | None = None) -> None:
        self.config = config or get_razorpay_config()

    @property
    def is_configured(self) -> bool:
        return self.config.is_configured

    def create_order(
        self,
        *,
        amount_paise: int,
        currency: str,
        receipt: str,
        notes: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        if not self.is_configured:
            mock_id = f"order_mock_{uuid.uuid4().hex[:24]}"
            logger.info("razorpay.mock_order_created", extra={"order_id": mock_id, "amount": amount_paise})
            return {
                "id": mock_id,
                "amount": amount_paise,
                "currency": currency,
                "receipt": receipt,
                "status": "created",
                "mock": True,
            }

        payload = {
            "amount": amount_paise,
            "currency": currency,
            "receipt": receipt,
            "notes": notes or {},
        }
        return self._request("POST", "/orders", payload)

    def test_connection(self) -> bool:
        if not self.is_configured:
            return False
        self._request("GET", "/orders?count=1")
        return True

    def verify_payment_signature(
        self,
        *,
        order_id: str,
        payment_id: str,
        signature: str,
    ) -> bool:
        if not self.is_configured:
            return order_id.startswith("order_mock_")

        message = f"{order_id}|{payment_id}".encode()
        expected = hmac.new(
            self.config.key_secret.encode(),
            message,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool:
        if not self.config.webhook_secret:
            logger.warning("razorpay.webhook_secret_missing")
            return not self.is_configured
        expected = hmac.new(
            self.config.webhook_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    def refund_payment(
        self,
        *,
        payment_id: str,
        amount_paise: int,
        notes: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        if not self.is_configured or payment_id.startswith("pay_mock"):
            mock_id = f"rfnd_mock_{uuid.uuid4().hex[:16]}"
            logger.info(
                "razorpay.mock_refund_created",
                extra={"refund_id": mock_id, "payment_id": payment_id, "amount": amount_paise},
            )
            return {
                "id": mock_id,
                "payment_id": payment_id,
                "amount": amount_paise,
                "status": "processed",
                "mock": True,
            }
        payload: dict[str, Any] = {"amount": amount_paise}
        if notes:
            payload["notes"] = notes
        return self._request("POST", f"/payments/{payment_id}/refund", payload)

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{RAZORPAY_API_BASE}{path}"
        credentials = base64.b64encode(
            f"{self.config.key_id}:{self.config.key_secret}".encode()
        ).decode()
        data = json.dumps(payload).encode() if payload is not None else None
        req = request.Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/json",
            },
        )
        try:
            with request.urlopen(req, timeout=15) as response:
                return json.loads(response.read().decode())
        except error.HTTPError as exc:
            body = exc.read().decode()
            logger.error("razorpay.api_error", extra={"status": exc.code, "body": body})
            raise RuntimeError(f"Razorpay API error ({exc.code}): {body}") from exc
