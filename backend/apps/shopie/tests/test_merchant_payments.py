from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.billing.services.cashfree_client import CashfreeClient
from apps.billing.services.razorpay_client import RazorpayClient
from apps.businesses.models import Business
from apps.shopie.models import FulfillmentMode, ShopOrder
from apps.shopie.services.merchant_payments import MerchantPaymentService

pytestmark = pytest.mark.django_db


def test_merchant_credentials_are_encrypted_and_masked(shop_business: Business) -> None:
    service = MerchantPaymentService()

    payload = service.update_settings(
        business=shop_business,
        key_id="rzp_test_merchant",
        key_secret="merchant-secret",
        webhook_secret="webhook-secret",
        test_connection=False,
    )

    settings = service.ensure_settings(business=shop_business)
    stored = settings.metadata["razorpay"]
    assert stored["key_secret"].startswith("enc:")
    assert stored["webhook_secret"].startswith("enc:")
    assert "merchant-secret" not in str(stored)
    assert payload["configured"] is True
    assert payload["connected"] is False
    assert payload["status"] == "not_in_plan"
    assert payload["key_secret_masked"] == "••••••••"


def test_razorpay_connected_only_after_successful_test(
    monkeypatch: pytest.MonkeyPatch,
    shop_business: Business,
) -> None:
    monkeypatch.setattr(RazorpayClient, "test_connection", lambda self: True)
    monkeypatch.setattr(
        MerchantPaymentService,
        "availability",
        lambda self, **kwargs: {
            "platform_enabled": True,
            "plan_entitled": True,
            "available": True,
            "enabled": True,
        },
    )
    service = MerchantPaymentService()

    payload = service.update_settings(
        business=shop_business,
        key_id="rzp_test_verified",
        key_secret="verified-secret",
        test_connection=True,
    )

    assert payload["configured"] is True
    assert payload["connected"] is True
    assert payload["last_tested_at"]

    changed = service.update_settings(
        business=shop_business,
        key_id="rzp_test_changed",
        key_secret="changed-secret",
        test_connection=False,
    )
    assert changed["configured"] is True
    assert changed["connected"] is False
    assert changed["status"] == "verification_required"


def test_create_merchant_checkout_uses_business_keys(
    monkeypatch: pytest.MonkeyPatch,
    shop_business: Business,
) -> None:
    service = MerchantPaymentService()
    service.update_settings(
        business=shop_business,
        key_id="rzp_test_merchant",
        key_secret="merchant-secret",
        webhook_secret="webhook-secret",
        test_connection=False,
    )
    settings = service.ensure_settings(business=shop_business)
    settings.metadata["razorpay"]["last_tested_at"] = "2026-08-23T00:00:00+00:00"
    settings.save(update_fields=["metadata", "updated_at", "version"])
    order = ShopOrder.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        order_number="SO-RAZORPAY-1",
        fulfillment_mode=FulfillmentMode.POS,
        currency="INR",
        total=Decimal("125.50"),
        metadata={"pos": {"payment_method": "razorpay", "payment_status": "due"}},
    )

    def fake_create_order(self, **kwargs):
        assert self.config.key_id == "rzp_test_merchant"
        assert kwargs["amount_paise"] == 12550
        return {"id": "order_merchant_1"}

    monkeypatch.setattr(RazorpayClient, "create_order", fake_create_order)
    monkeypatch.setattr(
        MerchantPaymentService,
        "availability",
        lambda self, **kwargs: {
            "platform_enabled": True,
            "plan_entitled": True,
            "available": True,
            "enabled": True,
        },
    )

    checkout = service.create_checkout(order=order)

    assert checkout["razorpay_order_id"] == "order_merchant_1"
    assert checkout["amount"] == 12550
    order.refresh_from_db()
    assert order.metadata["pos"]["razorpay_order_id"] == "order_merchant_1"


def test_disabled_business_setting_blocks_merchant_checkout(
    monkeypatch: pytest.MonkeyPatch,
    shop_business: Business,
) -> None:
    order = ShopOrder.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        order_number="SO-RAZORPAY-OFF",
        fulfillment_mode=FulfillmentMode.POS,
        currency="INR",
        total=Decimal("10.00"),
        metadata={"pos": {"payment_method": "razorpay", "payment_status": "due"}},
    )
    monkeypatch.setattr(
        MerchantPaymentService,
        "availability",
        lambda self, **kwargs: {
            "platform_enabled": True,
            "plan_entitled": True,
            "available": True,
            "enabled": False,
        },
    )

    with pytest.raises(ValidationError, match="disabled in business payment settings"):
        MerchantPaymentService().create_checkout(order=order)


def test_merchant_cashfree_credentials_are_encrypted(shop_business: Business) -> None:
    service = MerchantPaymentService()
    payload = service.update_cashfree_settings(
        business=shop_business,
        app_id="TESTAPP123",
        secret_key="cf-secret",
        test_connection=False,
    )
    settings = service.ensure_settings(business=shop_business)
    stored = settings.metadata["cashfree"]
    assert stored["secret_key"].startswith("enc:")
    assert "cf-secret" not in str(stored)
    assert payload["cashfree"]["configured"] is True
    assert payload["cashfree"]["connected"] is False
    assert payload["cashfree"]["status"] == "not_in_plan"
    assert payload["cashfree"]["secret_masked"] == "••••••••"


def test_cashfree_connected_only_after_successful_test(
    monkeypatch: pytest.MonkeyPatch,
    shop_business: Business,
) -> None:
    monkeypatch.setattr(CashfreeClient, "test_connection", lambda self: True)
    monkeypatch.setattr(
        MerchantPaymentService,
        "cashfree_availability",
        lambda self, **kwargs: {
            "platform_enabled": True,
            "plan_entitled": True,
            "available": True,
            "enabled": True,
        },
    )
    service = MerchantPaymentService()

    payload = service.update_cashfree_settings(
        business=shop_business,
        app_id="TEST_VERIFIED",
        secret_key="verified-secret",
        test_connection=True,
    )

    assert payload["cashfree"]["configured"] is True
    assert payload["cashfree"]["connected"] is True
    assert payload["cashfree"]["webhook_configured"] is True
    assert payload["cashfree"]["last_tested_at"]

    changed = service.update_cashfree_settings(
        business=shop_business,
        app_id="TEST_CHANGED",
        secret_key="changed-secret",
        test_connection=False,
    )
    assert changed["cashfree"]["configured"] is True
    assert changed["cashfree"]["connected"] is False
    assert changed["cashfree"]["status"] == "verification_required"


def test_create_merchant_cashfree_checkout_uses_business_keys(
    monkeypatch: pytest.MonkeyPatch,
    shop_business: Business,
) -> None:
    service = MerchantPaymentService()
    service.update_cashfree_settings(
        business=shop_business,
        app_id="TESTAPP123",
        secret_key="cf-secret",
        test_connection=False,
    )
    settings = service.ensure_settings(business=shop_business)
    settings.metadata["cashfree"]["last_tested_at"] = "2026-08-23T00:00:00+00:00"
    settings.save(update_fields=["metadata", "updated_at", "version"])
    order = ShopOrder.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        order_number="SO-CASHFREE-1",
        fulfillment_mode=FulfillmentMode.POS,
        currency="INR",
        total=Decimal("80.00"),
        metadata={"pos": {"payment_method": "cashfree", "payment_status": "due"}},
    )

    def fake_create_order(self, **kwargs):
        assert self.config.app_id == "TESTAPP123"
        assert kwargs["amount_paise"] == 8000
        return {"order_id": "order_cf_1", "payment_session_id": "session_cf_1"}

    monkeypatch.setattr(CashfreeClient, "create_order", fake_create_order)
    monkeypatch.setattr(
        MerchantPaymentService,
        "cashfree_availability",
        lambda self, **kwargs: {
            "platform_enabled": True,
            "plan_entitled": True,
            "available": True,
            "enabled": True,
        },
    )

    checkout = service.create_cashfree_checkout(order=order)
    assert checkout["cashfree_order_id"] == "order_cf_1"
    assert checkout["payment_session_id"] == "session_cf_1"
    order.refresh_from_db()
    assert order.metadata["pos"]["cashfree_order_id"] == "order_cf_1"


def test_cashfree_unavailable_without_plan(
    monkeypatch: pytest.MonkeyPatch, shop_business: Business
) -> None:
    monkeypatch.setattr(
        MerchantPaymentService,
        "cashfree_availability",
        lambda self, **kwargs: {
            "platform_enabled": True,
            "plan_entitled": False,
            "available": False,
            "enabled": True,
        },
    )
    order = ShopOrder.objects.create(
        tenant=shop_business.tenant,
        business=shop_business,
        order_number="SO-CASHFREE-OFF",
        fulfillment_mode=FulfillmentMode.POS,
        currency="INR",
        total=Decimal("10.00"),
        metadata={"pos": {"payment_method": "cashfree", "payment_status": "due"}},
    )
    with pytest.raises(ValidationError, match="not included"):
        MerchantPaymentService().create_cashfree_checkout(order=order)
