from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.billing.services.cashfree_client import CashfreeClient, CashfreeConfig
from apps.billing.services.razorpay_client import RazorpayClient, RazorpayConfig
from apps.businesses.constants import FEATURE_CASHFREE_PAYMENTS, FEATURE_RAZORPAY_PAYMENTS
from apps.businesses.models import Business
from apps.businesses.services.entitlements import EntitlementService
from apps.platform_admin.feature_flags import CASHFREE_FLAG, RAZORPAY_FLAG, tenant_feature_enabled
from apps.shopie.models import ShopBusinessSettings, ShopOrder
from apps.shopie.services.delivery_secrets import decrypt_secret, encrypt_secret, mask_secret


@dataclass(frozen=True)
class MerchantRazorpayConfig:
    key_id: str
    key_secret: str
    webhook_secret: str

    @property
    def connected(self) -> bool:
        return bool(self.key_id and self.key_secret)

    def as_client_config(self) -> RazorpayConfig:
        return RazorpayConfig(
            key_id=self.key_id,
            key_secret=self.key_secret,
            webhook_secret=self.webhook_secret,
        )


@dataclass(frozen=True)
class MerchantCashfreeConfig:
    app_id: str
    secret_key: str
    env: str = "sandbox"

    @property
    def connected(self) -> bool:
        return bool(self.app_id and self.secret_key)

    def as_client_config(self) -> CashfreeConfig:
        return CashfreeConfig(
            app_id=self.app_id,
            secret_key=self.secret_key,
            env=self.env,
        )


class MerchantPaymentService:
    metadata_key = "razorpay"
    cashfree_metadata_key = "cashfree"

    def ensure_settings(self, *, business: Business) -> ShopBusinessSettings:
        settings, _ = ShopBusinessSettings.objects.get_or_create(
            tenant=business.tenant,
            business=business,
        )
        return settings

    def config_for_business(self, *, business: Business) -> MerchantRazorpayConfig:
        settings = self.ensure_settings(business=business)
        metadata = settings.metadata if isinstance(settings.metadata, dict) else {}
        stored = metadata.get(self.metadata_key)
        raw = stored if isinstance(stored, dict) else {}
        return MerchantRazorpayConfig(
            key_id=str(raw.get("key_id") or "").strip(),
            key_secret=decrypt_secret(str(raw.get("key_secret") or "")),
            webhook_secret=decrypt_secret(str(raw.get("webhook_secret") or "")),
        )

    def availability(self, *, business: Business) -> dict[str, bool]:
        settings = self.ensure_settings(business=business)
        metadata = settings.metadata if isinstance(settings.metadata, dict) else {}
        stored = metadata.get(self.metadata_key)
        raw = stored if isinstance(stored, dict) else {}
        platform_enabled = tenant_feature_enabled(
            tenant=business.tenant,
            key=RAZORPAY_FLAG,
        )
        plan_entitled = FEATURE_RAZORPAY_PAYMENTS in EntitlementService().entitled_features(
            business=business
        )
        enabled = bool(raw.get("enabled", True))
        return {
            "platform_enabled": platform_enabled,
            "plan_entitled": plan_entitled,
            "available": platform_enabled and plan_entitled,
            "enabled": enabled,
        }

    def public_settings(
        self,
        *,
        business: Business,
        webhook_url: str = "",
        cashfree_webhook_url: str = "",
    ) -> dict[str, Any]:
        settings = self.ensure_settings(business=business)
        metadata = settings.metadata if isinstance(settings.metadata, dict) else {}
        stored = metadata.get(self.metadata_key)
        raw = stored if isinstance(stored, dict) else {}
        config = self.config_for_business(business=business)
        availability = self.availability(business=business)
        configured = config.connected
        connected = configured and bool(raw.get("last_tested_at"))
        can_accept = connected and availability["available"] and availability["enabled"]
        return {
            "provider": "razorpay",
            "configured": configured,
            "connected": connected,
            **availability,
            "can_accept_payments": can_accept,
            "status": self._status(
                configured=configured,
                connected=connected,
                availability=availability,
            ),
            "key_id": config.key_id,
            "key_secret_masked": mask_secret(config.key_secret),
            "webhook_secret_masked": mask_secret(config.webhook_secret),
            "webhook_configured": bool(config.webhook_secret),
            "last_tested_at": raw.get("last_tested_at"),
            "webhook_url": webhook_url,
            "upi_vpa": business.upi_vpa or "",
            "cashfree": self.cashfree_public_settings(
                business=business,
                webhook_url=cashfree_webhook_url,
            ),
        }

    def update_settings(
        self,
        *,
        business: Business,
        key_id: str,
        key_secret: str = "",
        webhook_secret: str = "",
        upi_vpa: str | None = None,
        enabled: bool | None = None,
        test_connection: bool = True,
    ) -> dict[str, Any]:
        settings = self.ensure_settings(business=business)
        metadata = dict(settings.metadata or {})
        existing = metadata.get(self.metadata_key)
        stored = dict(existing) if isinstance(existing, dict) else {}
        availability = self.availability(business=business)
        if enabled is True and not availability["available"]:
            raise ValidationError(
                {
                    "enabled": (
                        "Razorpay is disabled by the platform admin or is not included "
                        "in this plan."
                    )
                }
            )
        if enabled is not None:
            stored["enabled"] = bool(enabled)

        normalized_key_id = str(key_id or "").strip()
        if not normalized_key_id:
            if stored:
                stored.pop("key_id", None)
                stored.pop("key_secret", None)
                stored.pop("webhook_secret", None)
                stored.pop("last_tested_at", None)
                metadata[self.metadata_key] = stored
            else:
                metadata.pop(self.metadata_key, None)
            settings.metadata = metadata
            settings.save(update_fields=["metadata", "updated_at", "version"])
            if upi_vpa is not None:
                business.upi_vpa = str(upi_vpa).strip()
                business.save(update_fields=["upi_vpa", "updated_at", "version"])
            return self.public_settings(business=business)

        plain_key_secret = str(key_secret or "").strip() or decrypt_secret(
            str(stored.get("key_secret") or "")
        )
        plain_webhook_secret = str(webhook_secret or "").strip() or decrypt_secret(
            str(stored.get("webhook_secret") or "")
        )
        if not plain_key_secret:
            raise ValidationError(
                {"key_secret": "Key Secret is required when connecting Razorpay."}
            )

        config = MerchantRazorpayConfig(
            key_id=normalized_key_id,
            key_secret=plain_key_secret,
            webhook_secret=plain_webhook_secret,
        )
        credentials_changed = normalized_key_id != str(stored.get("key_id") or "").strip() or bool(
            str(key_secret or "").strip()
        )
        if test_connection:
            try:
                RazorpayClient(config.as_client_config()).test_connection()
            except RuntimeError as exc:
                raise ValidationError(
                    {"credentials": "Razorpay rejected these credentials."}
                ) from exc

        stored.update(
            {
                "key_id": normalized_key_id,
                "key_secret": encrypt_secret(plain_key_secret),
                "webhook_secret": encrypt_secret(plain_webhook_secret),
                "last_tested_at": (
                    timezone.now().isoformat()
                    if test_connection
                    else None
                    if credentials_changed
                    else stored.get("last_tested_at")
                ),
            }
        )
        metadata[self.metadata_key] = stored
        settings.metadata = metadata
        settings.save(update_fields=["metadata", "updated_at", "version"])
        if upi_vpa is not None:
            business.upi_vpa = str(upi_vpa).strip()
            business.save(update_fields=["upi_vpa", "updated_at", "version"])
        return self.public_settings(business=business)

    def create_checkout(self, *, order: ShopOrder) -> dict[str, Any]:
        availability = self.availability(business=order.business)
        if not availability["available"]:
            raise ValidationError(
                {
                    "razorpay": (
                        "Razorpay is disabled by the platform admin or is not included "
                        "in this plan."
                    )
                }
            )
        if not availability["enabled"]:
            raise ValidationError(
                {"razorpay": "Razorpay is disabled in business payment settings."}
            )
        config = self.config_for_business(business=order.business)
        if not config.connected:
            raise ValidationError({"razorpay": "Connect this business's Razorpay account first."})
        public = self.public_settings(business=order.business)
        if not public["connected"]:
            raise ValidationError(
                {"razorpay": "Test and verify the saved Razorpay credentials first."}
            )

        metadata = dict(order.metadata or {})
        pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
        if str(pos.get("payment_method") or "") != "razorpay":
            raise ValidationError({"payment_method": "This order is not a Razorpay order."})
        if str(pos.get("payment_status") or "") in {"paid", "settled"}:
            raise ValidationError({"payment": "This order is already paid."})
        existing_order_id = str(pos.get("razorpay_order_id") or "")
        if existing_order_id:
            return self._checkout_payload(order=order, config=config, pos=pos)

        amount_paise = int((Decimal(str(order.total)) * 100).quantize(Decimal("1")))
        remote = RazorpayClient(config.as_client_config()).create_order(
            amount_paise=amount_paise,
            currency=order.currency or "INR",
            receipt=f"{order.order_number}-{str(order.id)[:8]}",
            notes={
                "business_id": str(order.business_id),
                "shop_order_id": str(order.id),
                "order_number": order.order_number,
            },
        )
        pos.update(
            {
                "payment_status": "due",
                "razorpay_order_id": str(remote["id"]),
                "razorpay_created_at": timezone.now().isoformat(),
            }
        )
        metadata["pos"] = pos
        order.metadata = metadata
        order.save(update_fields=["metadata", "updated_at", "version"])
        return self._checkout_payload(order=order, config=config, pos=pos)

    def _checkout_payload(
        self,
        *,
        order: ShopOrder,
        config: MerchantRazorpayConfig,
        pos: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "shop_order_id": str(order.id),
            "order_number": order.order_number,
            "razorpay_order_id": str(pos.get("razorpay_order_id") or ""),
            "key_id": config.key_id,
            "amount": int((Decimal(str(order.total)) * 100).quantize(Decimal("1"))),
            "currency": order.currency or "INR",
            "business_name": order.business.display_name,
            "payment_status": str(pos.get("payment_status") or "due"),
        }

    def cashfree_config_for_business(self, *, business: Business) -> MerchantCashfreeConfig:
        settings = self.ensure_settings(business=business)
        metadata = settings.metadata if isinstance(settings.metadata, dict) else {}
        stored = metadata.get(self.cashfree_metadata_key)
        raw = stored if isinstance(stored, dict) else {}
        env = str(raw.get("env") or "sandbox").strip().lower()
        if env not in {"sandbox", "production"}:
            env = "sandbox"
        return MerchantCashfreeConfig(
            app_id=str(raw.get("app_id") or "").strip(),
            secret_key=decrypt_secret(str(raw.get("secret_key") or "")),
            env=env,
        )

    def cashfree_availability(self, *, business: Business) -> dict[str, bool]:
        settings = self.ensure_settings(business=business)
        metadata = settings.metadata if isinstance(settings.metadata, dict) else {}
        stored = metadata.get(self.cashfree_metadata_key)
        raw = stored if isinstance(stored, dict) else {}
        platform_enabled = tenant_feature_enabled(tenant=business.tenant, key=CASHFREE_FLAG)
        plan_entitled = FEATURE_CASHFREE_PAYMENTS in EntitlementService().entitled_features(
            business=business
        )
        enabled = bool(raw.get("enabled", True))
        return {
            "platform_enabled": platform_enabled,
            "plan_entitled": plan_entitled,
            "available": platform_enabled and plan_entitled,
            "enabled": enabled,
        }

    def cashfree_public_settings(
        self, *, business: Business, webhook_url: str = ""
    ) -> dict[str, Any]:
        settings = self.ensure_settings(business=business)
        metadata = settings.metadata if isinstance(settings.metadata, dict) else {}
        stored = metadata.get(self.cashfree_metadata_key)
        raw = stored if isinstance(stored, dict) else {}
        config = self.cashfree_config_for_business(business=business)
        availability = self.cashfree_availability(business=business)
        configured = config.connected
        connected = configured and bool(raw.get("last_tested_at"))
        can_accept = connected and availability["available"] and availability["enabled"]
        return {
            "provider": "cashfree",
            "configured": configured,
            "connected": connected,
            **availability,
            "can_accept_payments": can_accept,
            "status": self._status(
                configured=configured,
                connected=connected,
                availability=availability,
            ),
            "app_id": config.app_id,
            "secret_masked": mask_secret(config.secret_key),
            "webhook_configured": configured,
            "last_tested_at": raw.get("last_tested_at"),
            "webhook_url": webhook_url,
            "env": config.env,
        }

    def update_cashfree_settings(
        self,
        *,
        business: Business,
        app_id: str,
        secret_key: str = "",
        enabled: bool | None = None,
        env: str | None = None,
        test_connection: bool = True,
        upi_vpa: str | None = None,
    ) -> dict[str, Any]:
        settings = self.ensure_settings(business=business)
        metadata = dict(settings.metadata or {})
        existing = metadata.get(self.cashfree_metadata_key)
        stored = dict(existing) if isinstance(existing, dict) else {}
        previous_env = str(stored.get("env") or "sandbox")
        availability = self.cashfree_availability(business=business)
        if enabled is True and not availability["available"]:
            raise ValidationError(
                {
                    "enabled": (
                        "Cashfree is disabled by the platform admin or is not included "
                        "in this plan."
                    )
                }
            )
        if enabled is not None:
            stored["enabled"] = bool(enabled)
        if env in {"sandbox", "production"}:
            stored["env"] = env

        normalized_app_id = str(app_id or "").strip()
        if not normalized_app_id:
            if stored:
                stored.pop("app_id", None)
                stored.pop("secret_key", None)
                stored.pop("last_tested_at", None)
                metadata[self.cashfree_metadata_key] = stored
            else:
                metadata.pop(self.cashfree_metadata_key, None)
            settings.metadata = metadata
            settings.save(update_fields=["metadata", "updated_at", "version"])
            if upi_vpa is not None:
                business.upi_vpa = str(upi_vpa).strip()
                business.save(update_fields=["upi_vpa", "updated_at", "version"])
            return self.public_settings(business=business)

        plain_secret = str(secret_key or "").strip() or decrypt_secret(
            str(stored.get("secret_key") or "")
        )
        if not plain_secret:
            raise ValidationError(
                {"secret_key": "Secret Key is required when connecting Cashfree."}
            )

        config = MerchantCashfreeConfig(
            app_id=normalized_app_id,
            secret_key=plain_secret,
            env=str(stored.get("env") or "sandbox"),
        )
        credentials_changed = (
            normalized_app_id != str(stored.get("app_id") or "").strip()
            or bool(str(secret_key or "").strip())
            or previous_env != config.env
        )
        if test_connection:
            try:
                CashfreeClient(config.as_client_config()).test_connection()
            except RuntimeError as exc:
                raise ValidationError(
                    {"credentials": "Cashfree rejected these credentials."}
                ) from exc

        stored.update(
            {
                "app_id": normalized_app_id,
                "secret_key": encrypt_secret(plain_secret),
                "last_tested_at": (
                    timezone.now().isoformat()
                    if test_connection
                    else None
                    if credentials_changed
                    else stored.get("last_tested_at")
                ),
            }
        )
        metadata[self.cashfree_metadata_key] = stored
        settings.metadata = metadata
        settings.save(update_fields=["metadata", "updated_at", "version"])
        if upi_vpa is not None:
            business.upi_vpa = str(upi_vpa).strip()
            business.save(update_fields=["upi_vpa", "updated_at", "version"])
        return self.public_settings(business=business)

    def create_cashfree_checkout(self, *, order: ShopOrder) -> dict[str, Any]:
        availability = self.cashfree_availability(business=order.business)
        if not availability["available"]:
            raise ValidationError(
                {
                    "cashfree": (
                        "Cashfree is disabled by the platform admin or is not included "
                        "in this plan."
                    )
                }
            )
        if not availability["enabled"]:
            raise ValidationError(
                {"cashfree": "Cashfree is disabled in business payment settings."}
            )
        config = self.cashfree_config_for_business(business=order.business)
        if not config.connected:
            raise ValidationError({"cashfree": "Connect this business's Cashfree account first."})
        public = self.cashfree_public_settings(business=order.business)
        if not public["connected"]:
            raise ValidationError(
                {"cashfree": "Test and verify the saved Cashfree credentials first."}
            )

        metadata = dict(order.metadata or {})
        pos = dict(metadata.get("pos") if isinstance(metadata.get("pos"), dict) else {})
        if str(pos.get("payment_method") or "") != "cashfree":
            raise ValidationError({"payment_method": "This order is not a Cashfree order."})
        if str(pos.get("payment_status") or "") in {"paid", "settled"}:
            raise ValidationError({"payment": "This order is already paid."})
        if str(pos.get("cashfree_order_id") or "") and str(pos.get("payment_session_id") or ""):
            return self._cashfree_checkout_payload(order=order, config=config, pos=pos)

        amount_paise = int((Decimal(str(order.total)) * 100).quantize(Decimal("1")))
        order_id = f"so{str(order.id).replace('-', '')[:18]}"
        phone = ""
        if order.customer is not None:
            phone = "".join(
                ch for ch in str(getattr(order.customer, "phone", "") or "") if ch.isdigit()
            )[-10:]
        remote = CashfreeClient(config.as_client_config()).create_order(
            amount_paise=amount_paise,
            currency=order.currency or "INR",
            order_id=str(pos.get("cashfree_order_id") or order_id),
            customer_id=str(order.customer_id or order.business_id).replace("-", "")[:50],
            customer_phone=phone or "9999999999",
            notes={
                "business_id": str(order.business_id),
                "shop_order_id": str(order.id),
                "order_number": order.order_number,
            },
        )
        pos.update(
            {
                "payment_status": "due",
                "cashfree_order_id": str(remote.get("order_id") or order_id),
                "payment_session_id": str(remote.get("payment_session_id") or ""),
                "cashfree_created_at": timezone.now().isoformat(),
            }
        )
        metadata["pos"] = pos
        order.metadata = metadata
        order.save(update_fields=["metadata", "updated_at", "version"])
        return self._cashfree_checkout_payload(order=order, config=config, pos=pos)

    def _cashfree_checkout_payload(
        self,
        *,
        order: ShopOrder,
        config: MerchantCashfreeConfig,
        pos: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "shop_order_id": str(order.id),
            "order_number": order.order_number,
            "cashfree_order_id": str(pos.get("cashfree_order_id") or ""),
            "payment_session_id": str(pos.get("payment_session_id") or ""),
            "app_id": config.app_id,
            "env": config.env,
            "amount": int((Decimal(str(order.total)) * 100).quantize(Decimal("1"))),
            "currency": order.currency or "INR",
            "business_name": order.business.display_name,
            "payment_status": str(pos.get("payment_status") or "due"),
        }

    @staticmethod
    def _status(
        *,
        configured: bool,
        connected: bool,
        availability: dict[str, bool],
    ) -> str:
        if not availability["platform_enabled"]:
            return "disabled_by_platform"
        if not availability["plan_entitled"]:
            return "not_in_plan"
        if not configured:
            return "not_configured"
        if not connected:
            return "verification_required"
        if not availability["enabled"]:
            return "paused"
        return "live"
