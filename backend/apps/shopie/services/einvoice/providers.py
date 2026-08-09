from __future__ import annotations

import base64
import hashlib
import json
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Any, Protocol

from django.core.exceptions import ValidationError
from django.utils import timezone


class GstComplianceProvider(Protocol):
    """Common interface implemented by every GST portal / GSP integration."""

    def generate_irn(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    def cancel_irn(
        self, irn: str, reason: str, cancel_date: datetime | None = None
    ) -> dict[str, Any]: ...

    def generate_eway(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    def cancel_eway(self, ewb_no: str, reason: str) -> dict[str, Any]: ...


def _stable_hash(payload: dict[str, Any], *, salt: str = "") -> str:
    blob = json.dumps(payload, sort_keys=True, default=str) + salt
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


class MockGstProvider:
    """Deterministic in-memory provider used for local/dev/testing.

    No network calls are made. IRNs, ack numbers, and e-way bill numbers are
    derived deterministically from the request payload so tests are
    reproducible.
    """

    mode = "mock"

    def generate_irn(self, payload: dict[str, Any]) -> dict[str, Any]:
        digest = _stable_hash(payload, salt="irn")
        irn = digest
        ack_no = str(int(digest[:14], 16))[:14].zfill(14)
        ack_date = timezone.now()
        signed_invoice = base64.b64encode(
            json.dumps({"payload": payload, "irn": irn}, default=str).encode("utf-8")
        ).decode("ascii")
        signed_qr = base64.b64encode(
            f"IRN:{irn}|AckNo:{ack_no}|AckDt:{ack_date.isoformat()}".encode()
        ).decode("ascii")
        return {
            "Irn": irn,
            "AckNo": ack_no,
            "AckDt": ack_date.strftime("%d/%m/%Y %H:%M:%S"),
            "SignedInvoice": signed_invoice,
            "SignedQRCode": signed_qr,
            "Status": "1",
            "mode": self.mode,
        }

    def cancel_irn(
        self, irn: str, reason: str, cancel_date: datetime | None = None
    ) -> dict[str, Any]:
        cancel_date = cancel_date or timezone.now()
        return {
            "Irn": irn,
            "CancelDate": cancel_date.strftime("%d/%m/%Y %H:%M:%S"),
            "Status": "1",
            "reason": reason,
            "mode": self.mode,
        }

    def generate_eway(self, payload: dict[str, Any]) -> dict[str, Any]:
        digest = _stable_hash(payload, salt="eway")
        ewb_no = "EWB" + str(int(digest[:12], 16))[:12].zfill(12)
        ewb_date = timezone.now()
        distance_km = int(payload.get("distance") or payload.get("distance_km") or 0)
        # GST rule of thumb: ~1 additional validity day per 200km, minimum 1 day.
        validity_days = max(1, (distance_km // 200) + 1)
        valid_upto = ewb_date + timedelta(days=validity_days)
        return {
            "EwbNo": ewb_no,
            "EwbDt": ewb_date.strftime("%d/%m/%Y %H:%M:%S"),
            "EwbValidTill": valid_upto.strftime("%d/%m/%Y %H:%M:%S"),
            "Status": "1",
            "mode": self.mode,
        }

    def cancel_eway(self, ewb_no: str, reason: str) -> dict[str, Any]:
        return {
            "EwbNo": ewb_no,
            "CancelDate": timezone.now().strftime("%d/%m/%Y %H:%M:%S"),
            "Status": "1",
            "reason": reason,
            "mode": self.mode,
        }


class NicHttpProvider:
    """Provider that talks to the NIC e-invoice/e-way bill APIs (or a compatible GSP).

    This targets the sandbox/production IRP/e-way REST APIs. Since the exact
    GSP contract varies by vendor, the endpoint paths below are configurable
    via `gst_compliance.base_url` and use a conventional `/eicore/...` layout;
    override `base_url` to point at your GSP's actual host if it differs.
    """

    def __init__(self, compliance: dict[str, Any], *, mode: str = "nic_sandbox") -> None:
        self.compliance = compliance or {}
        self.mode = mode
        self._token: str | None = None

    def _require(self, *fields: str) -> None:
        missing = [f for f in fields if not str(self.compliance.get(f) or "").strip()]
        if missing:
            raise ValidationError(
                {
                    "gst_compliance": (
                        f"Missing required GST compliance settings for provider '{self.mode}': "
                        f"{', '.join(missing)}. Configure these under "
                        "shop/books/compliance-settings."
                    )
                }
            )

    @property
    def base_url(self) -> str:
        return str(self.compliance.get("base_url") or "").rstrip("/")

    def _request(
        self, path: str, *, method: str = "POST", body: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        self._require("base_url")
        url = f"{self.base_url}{path}"
        data = json.dumps(body or {}).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
            raise ValidationError(
                {"gst_portal": f"GST portal request to {path} failed ({exc.code}): {detail}"}
            ) from exc
        except urllib.error.URLError as exc:
            raise ValidationError(
                {"gst_portal": f"Could not reach GST portal at {url}: {exc.reason}"}
            ) from exc
        except (TimeoutError, OSError) as exc:
            raise ValidationError(
                {"gst_portal": f"GST portal request to {path} timed out or failed: {exc}"}
            ) from exc

    def _authenticate(self) -> None:
        if self._token:
            return
        has_client_creds = self.compliance.get("client_id") and self.compliance.get("client_secret")
        has_user_creds = self.compliance.get("username") and self.compliance.get("password")
        if not has_client_creds and not has_user_creds:
            self._require("username", "password")
        response = self._request(
            "/authenticate",
            body={
                "username": self.compliance.get("username"),
                "password": self.compliance.get("password"),
                "client_id": self.compliance.get("client_id"),
                "client_secret": self.compliance.get("client_secret"),
            },
        )
        token = response.get("AuthToken") or response.get("access_token") or response.get("token")
        if not token:
            raise ValidationError(
                {"gst_portal": "GST portal authentication did not return a token."}
            )
        self._token = str(token)

    def generate_irn(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._require("base_url")
        self._authenticate()
        response = self._request("/eicore/v1.03/Invoice", body=payload)
        response.setdefault("mode", self.mode)
        return response

    def cancel_irn(
        self, irn: str, reason: str, cancel_date: datetime | None = None
    ) -> dict[str, Any]:
        self._require("base_url")
        self._authenticate()
        cancel_date = cancel_date or timezone.now()
        response = self._request(
            "/eicore/v1.03/Invoice/Cancel",
            body={
                "Irn": irn,
                "CnlRsn": reason or "1",
                "CnlRem": reason or "Cancelled",
                "CancelDate": cancel_date.strftime("%d/%m/%Y %H:%M:%S"),
            },
        )
        response.setdefault("mode", self.mode)
        return response

    def generate_eway(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._require("base_url")
        self._authenticate()
        response = self._request("/eicore/v1.03/ewayapi", body=payload)
        response.setdefault("mode", self.mode)
        return response

    def cancel_eway(self, ewb_no: str, reason: str) -> dict[str, Any]:
        self._require("base_url")
        self._authenticate()
        response = self._request(
            "/eicore/v1.03/ewayapi/cancel",
            body={"ewbNo": ewb_no, "cancelRsnCode": "1", "cancelRmrk": reason or "Cancelled"},
        )
        response.setdefault("mode", self.mode)
        return response


def get_provider(settings: Any) -> GstComplianceProvider:
    """Resolve the compliance provider from `ShopBusinessSettings` (or a raw dict)."""
    compliance = getattr(settings, "gst_compliance", None)
    if compliance is None and isinstance(settings, dict):
        compliance = settings
    compliance = compliance if isinstance(compliance, dict) else {}
    provider_name = str(compliance.get("provider") or "mock").strip().lower()
    if provider_name in {"nic_sandbox", "nic_production", "custom"}:
        return NicHttpProvider(compliance, mode=provider_name)
    return MockGstProvider()
