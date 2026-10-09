from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any
from urllib import error, request

from django.conf import settings

logger = logging.getLogger("ie_orbit.billing.stripe")

STRIPE_API_BASE = "https://api.stripe.com/v1"
STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300


@dataclass(frozen=True)
class StripeConfig:
    secret_key: str
    publishable_key: str
    webhook_secret: str

    @property
    def is_configured(self) -> bool:
        return bool(self.secret_key)


def get_stripe_config() -> StripeConfig:
    return StripeConfig(
        secret_key=str(getattr(settings, "STRIPE_SECRET_KEY", "") or ""),
        publishable_key=str(getattr(settings, "STRIPE_PUBLISHABLE_KEY", "") or ""),
        webhook_secret=str(getattr(settings, "STRIPE_WEBHOOK_SECRET", "") or ""),
    )


class StripeClient:
    """Minimal Stripe Checkout Session client for international SaaS (USD)."""

    def __init__(self, config: StripeConfig | None = None) -> None:
        self.config = config or get_stripe_config()

    @property
    def is_configured(self) -> bool:
        return self.config.is_configured

    def create_checkout_session(
        self,
        *,
        amount_cents: int,
        currency: str,
        product_name: str,
        success_url: str,
        cancel_url: str,
        metadata: dict[str, str] | None = None,
        customer_email: str | None = None,
        enable_automatic_tax: bool = True,
    ) -> dict[str, Any]:
        currency_code = str(currency or "USD").strip().lower()
        if not self.is_configured:
            mock_id = f"cs_mock_{uuid.uuid4().hex[:24]}"
            logger.info(
                "stripe.mock_checkout_created",
                extra={"session_id": mock_id, "amount": amount_cents, "currency": currency_code},
            )
            return {
                "id": mock_id,
                "url": success_url,
                "amount_total": amount_cents,
                "currency": currency_code,
                "payment_status": "unpaid",
                "status": "open",
                "mock": True,
                "metadata": metadata or {},
            }

        form: list[tuple[str, str]] = [
            ("mode", "payment"),
            ("success_url", success_url),
            ("cancel_url", cancel_url),
            ("line_items[0][price_data][currency]", currency_code),
            ("line_items[0][price_data][unit_amount]", str(int(amount_cents))),
            ("line_items[0][price_data][product_data][name]", product_name),
            ("line_items[0][quantity]", "1"),
        ]
        if enable_automatic_tax:
            form.append(("automatic_tax[enabled]", "true"))
        if customer_email:
            form.append(("customer_email", customer_email))
        for key, value in (metadata or {}).items():
            form.append((f"metadata[{key}]", str(value)))
        return self._request_form("POST", "/checkout/sessions", form)

    def verify_webhook_signature(self, *, body: bytes, signature_header: str) -> bool:
        """Verify Stripe-Signature header (t=...,v1=...)."""
        secret = self.config.webhook_secret
        if not secret or not signature_header:
            return False
        timestamp = ""
        signatures: list[str] = []
        for item in signature_header.split(","):
            if "=" not in item:
                continue
            key, value = item.strip().split("=", 1)
            if key == "t":
                timestamp = value
            elif key == "v1":
                signatures.append(value)
        if not timestamp or not signatures:
            return False
        try:
            ts = int(timestamp)
        except ValueError:
            return False
        if abs(int(time.time()) - ts) > STRIPE_SIGNATURE_TOLERANCE_SECONDS:
            return False
        signed = f"{timestamp}.{body.decode('utf-8')}".encode("utf-8")
        expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
        return any(hmac.compare_digest(expected, candidate) for candidate in signatures)

    def create_connect_account_link(
        self,
        *,
        account_id: str,
        refresh_url: str,
        return_url: str,
        type: str = "account_onboarding",
    ) -> dict[str, Any]:
        """Create a Stripe Connect Express onboarding link (merchant customer payments)."""
        if not self.is_configured:
            return {
                "url": return_url,
                "mock": True,
                "account": account_id,
            }
        form = [
            ("account", account_id),
            ("refresh_url", refresh_url),
            ("return_url", return_url),
            ("type", type),
        ]
        return self._request_form("POST", "/account_links", form)

    def create_connect_express_account(self, *, email: str | None = None, country: str = "US") -> dict[str, Any]:
        if not self.is_configured:
            mock_id = f"acct_mock_{uuid.uuid4().hex[:16]}"
            return {"id": mock_id, "mock": True, "type": "express", "country": country}
        form: list[tuple[str, str]] = [
            ("type", "express"),
            ("country", country.upper()[:2]),
            ("capabilities[card_payments][requested]", "true"),
            ("capabilities[transfers][requested]", "true"),
        ]
        if email:
            form.append(("email", email))
        return self._request_form("POST", "/accounts", form)

    def _request_form(self, method: str, path: str, form: list[tuple[str, str]]) -> dict[str, Any]:
        from urllib.parse import urlencode

        body = urlencode(form).encode("utf-8")
        req = request.Request(
            f"{STRIPE_API_BASE}{path}",
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self.config.secret_key}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        try:
            with request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            logger.warning("stripe.http_error", extra={"status": exc.code, "detail": detail[:500]})
            raise RuntimeError(f"Stripe API error ({exc.code}): {detail[:300]}") from exc
        except error.URLError as exc:
            raise RuntimeError(f"Could not reach Stripe: {exc.reason}") from exc
