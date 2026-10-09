from __future__ import annotations

import pytest
from rest_framework.exceptions import ValidationError

from apps.billing.services.region import (
    assert_country_allowed_for_signup,
    assert_saas_currency_allowed,
    billing_region_for_country,
    is_india_country,
    saas_currency_for_country,
)


@pytest.mark.parametrize(
    ("country", "expected"),
    [
        ("India", True),
        ("IN", True),
        ("india", True),
        ("Republic of India", True),
        ("Germany", False),
        ("US", False),
        ("United States", False),
        ("", False),
    ],
)
def test_is_india_country(country: str, expected: bool) -> None:
    assert is_india_country(country) is expected


def test_saas_currency_locked_to_country() -> None:
    assert saas_currency_for_country("India") == "INR"
    assert saas_currency_for_country("Germany") == "USD"
    assert billing_region_for_country("India") == "IN"
    assert billing_region_for_country("Germany") == "INTL"


def test_assert_saas_currency_rejects_mismatch() -> None:
    with pytest.raises(ValidationError) as exc:
        assert_saas_currency_allowed(country="Germany", saas_currency="INR")
    assert exc.value.detail["code"] == "saas_currency_locked"


def test_sanctions_block_signup() -> None:
    with pytest.raises(ValidationError) as exc:
        assert_country_allowed_for_signup("North Korea")
    assert exc.value.detail["code"] == "country_blocked"


def test_price_minor_resolves_usd_and_inr() -> None:
    from apps.billing.services.region import price_minor_for_currency

    prices = {"INR": {"monthly": 99900, "yearly": 999000}, "USD": {"monthly": 1200, "yearly": 12000}}
    assert price_minor_for_currency(prices, currency="INR") == 99900
    assert price_minor_for_currency(prices, currency="USD") == 1200
    assert price_minor_for_currency(prices, currency="USD", interval="yearly") == 12000


def test_public_catalog_usd_currency(monkeypatch) -> None:
    from apps.billing.services import checkout as checkout_module
    from apps.billing.services.checkout import CheckoutService

    service = CheckoutService()
    monkeypatch.setattr(
        service,
        "list_plan_catalog",
        lambda **kwargs: [
            {
                "product_code": "appointie",
                "plan_code": "appointie-starter",
                "currency": kwargs.get("currency") or "USD",
                "amount_paise": 1200,
                "is_public": True,
                "trial_days": 45,
            }
        ],
    )
    monkeypatch.setattr(
        checkout_module,
        "get_addon_prices",
        lambda **kwargs: {
            "staff_price_paise": 500,
            "office_price_paise": 1000,
            "pets_price_paise": 300,
        },
    )
    monkeypatch.setattr(
        checkout_module,
        "get_addon_prices_minor",
        lambda: {"INR": {}, "USD": {}},
    )
    catalog = service.list_public_plan_catalog(currency="USD")
    assert catalog["currency"] == "USD"
    assert catalog["plans"]
    for plan in catalog["plans"]:
        assert plan.get("currency") == "USD"
        assert int(plan.get("amount_paise") or 0) == 1200


def test_intl_checkout_rejects_india_psps(monkeypatch) -> None:
    from types import SimpleNamespace

    from apps.billing.services import checkout as checkout_module
    from apps.billing.services.checkout import CheckoutService

    business = SimpleNamespace(
        id="b1",
        country="Germany",
        saas_currency="USD",
        email="owner@example.com",
        product_subscriptions=SimpleNamespace(
            filter=lambda **_: SimpleNamespace(only=lambda *a, **k: SimpleNamespace(first=lambda: None))
        ),
        save=lambda **_: None,
    )
    tenant = SimpleNamespace(id="t1")
    service = CheckoutService()
    monkeypatch.setattr(checkout_module, "get_plan_definition", lambda *a, **k: {"code": "appointie-starter"})
    monkeypatch.setattr(
        service,
        "_resolve_plan_price_minor",
        lambda *args, **kwargs: 1200,
    )
    with pytest.raises(ValidationError) as exc:
        service.create_checkout_session(
            tenant=tenant,
            business=business,
            product_code="appointie",
            plan_code="appointie-starter",
            provider="razorpay",
        )
    assert exc.value.detail["code"] == "intl_stripe_required"


def test_stripe_webhook_signature_roundtrip(settings) -> None:
    import hashlib
    import hmac
    import time

    from apps.billing.services.stripe_client import StripeClient, StripeConfig

    secret = "whsec_test_secret"
    body = b'{"id":"evt_1","type":"checkout.session.completed"}'
    timestamp = str(int(time.time()))
    signed = f"{timestamp}.{body.decode('utf-8')}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    header = f"t={timestamp},v1={digest}"
    client = StripeClient(config=StripeConfig(secret_key="sk_test", publishable_key="pk", webhook_secret=secret))
    assert client.verify_webhook_signature(body=body, signature_header=header) is True
    assert client.verify_webhook_signature(body=body, signature_header="t=1,v1=bad") is False
