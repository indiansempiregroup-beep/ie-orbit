from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
from apps.billing.services.upi_notifications import (
    notify_upi_claim_resolved,
    notify_upi_claim_submitted,
)
from apps.businesses.models import (
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
)
from apps.businesses.services.subscription_lifecycle import SubscriptionLifecycleService
from apps.notifications.api.serializers import notification_type_from_metadata
from apps.notifications.models import MobileDevice, Notification, NotificationChannel
from apps.notifications.services.expo_push import send_push_to_user
from apps.tenancy.models import Organization, SubscriptionPlan, Tenant


@pytest.fixture
def workspace() -> dict:
    owner = User.objects.create_user(
        email="sub-push-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=owner, role_code="business_owner")
    admin = User.objects.create_user(
        email="sub-push-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=admin, role_code="platform_admin")
    tenant = Tenant.objects.create(
        slug="sub-push-tenant",
        display_name="Sub Push Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Sub Push Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="sub-push-biz",
        business_name="Sub Push Biz",
        display_name="Sub Push Biz",
        timezone="Asia/Kolkata",
    )
    return {"owner": owner, "admin": admin, "tenant": tenant, "business": business}


def _session(workspace: dict) -> BillingCheckoutSession:
    return BillingCheckoutSession.objects.create(
        tenant=workspace["tenant"],
        business=workspace["business"],
        product_code="appointie",
        plan_code="appointie-starter",
        razorpay_order_id="order_sub_push_1",
        amount_paise=19900,
        currency="INR",
        status=CheckoutSessionStatus.CREATED,
        metadata={
            "payment_channel": "upi_claim",
            "upi_utr": "UTR123456",
            "claimed_at": timezone.now().isoformat(),
        },
    )


@pytest.mark.django_db
def test_upi_claim_submitted_pushes_admin_and_owner(
    workspace: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[dict[str, object]] = []

    def _fake_push(**kwargs):
        sent.append(kwargs)
        return {"data": []}

    monkeypatch.setattr("apps.notifications.services.expo_push.send_push_to_user", _fake_push)
    monkeypatch.setattr(
        "apps.notifications.services.providers.email.send_branded_email",
        lambda **kwargs: None,
    )
    notify_upi_claim_submitted(_session(workspace))
    user_ids = {str(item["user"].id) for item in sent}
    event_types = {str((item.get("data") or {}).get("event_type")) for item in sent}
    assert str(workspace["admin"].id) in user_ids
    assert str(workspace["owner"].id) in user_ids
    assert "billing.upi_claim_submitted" in event_types
    assert all(item.get("across_tenants") is True for item in sent)
    assert Notification.objects.filter(
        user=workspace["admin"],
        channel=NotificationChannel.IN_APP,
        metadata__event_type="billing.upi_claim_submitted",
    ).exists()
    assert Notification.objects.filter(
        user=workspace["owner"],
        channel=NotificationChannel.IN_APP,
        metadata__event_type="billing.upi_claim_submitted",
    ).exists()


@pytest.mark.django_db
def test_upi_claim_resolved_pushes_admin_and_owner(
    workspace: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[dict[str, object]] = []
    monkeypatch.setattr(
        "apps.notifications.services.expo_push.send_push_to_user",
        lambda **kwargs: sent.append(kwargs) or {"data": []},
    )
    monkeypatch.setattr(
        "apps.notifications.services.providers.email.send_branded_email",
        lambda **kwargs: None,
    )
    notify_upi_claim_resolved(_session(workspace), action="confirm")
    user_ids = {str(item["user"].id) for item in sent}
    assert str(workspace["admin"].id) in user_ids
    assert str(workspace["owner"].id) in user_ids
    assert all(
        str((item.get("data") or {}).get("event_type")) == "billing.upi_claim_resolved"
        for item in sent
    )


@pytest.mark.django_db
def test_soft_lock_pushes_owner_and_platform_admin(
    workspace: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-pro",
        defaults={"name": "Orbit Appoint Pro", "is_public": True},
    )
    now = timezone.now()
    BusinessProductSubscription.objects.create(
        tenant=workspace["tenant"],
        business=workspace["business"],
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
        current_period_starts_at=now - timedelta(days=30),
        current_period_ends_at=now - timedelta(minutes=1),
    )
    sent: list[dict[str, object]] = []
    monkeypatch.setattr(
        "apps.notifications.services.expo_push.send_push_to_user",
        lambda **kwargs: sent.append(kwargs) or {"data": []},
    )
    monkeypatch.setattr(
        "apps.notifications.services.providers.email.send_branded_email",
        lambda **kwargs: None,
    )
    stats = SubscriptionLifecycleService().apply_due_period_ends()
    assert stats["soft_locked"] == 1
    user_ids = {str(item["user"].id) for item in sent}
    assert str(workspace["owner"].id) in user_ids
    assert str(workspace["admin"].id) in user_ids
    assert any(
        str((item.get("data") or {}).get("event_type")) == "billing.renewal_required"
        for item in sent
    )


@pytest.mark.django_db
def test_renewal_reminder_pushes_owner_not_admin(
    workspace: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-pro",
        defaults={"name": "Orbit Appoint Pro", "is_public": True},
    )
    now = timezone.now()
    BusinessProductSubscription.objects.create(
        tenant=workspace["tenant"],
        business=workspace["business"],
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
        current_period_starts_at=now - timedelta(days=28),
        current_period_ends_at=now + timedelta(days=2),
    )
    sent: list[dict[str, object]] = []
    monkeypatch.setattr(
        "apps.notifications.services.expo_push.send_push_to_user",
        lambda **kwargs: sent.append(kwargs) or {"data": []},
    )
    monkeypatch.setattr(
        "apps.notifications.services.providers.email.send_branded_email",
        lambda **kwargs: None,
    )
    stats = SubscriptionLifecycleService().send_renewal_reminders()
    assert stats["sent"] == 1
    user_ids = {str(item["user"].id) for item in sent}
    assert str(workspace["owner"].id) in user_ids
    assert str(workspace["admin"].id) not in user_ids


@pytest.mark.django_db
def test_send_push_to_user_across_tenants_finds_other_workspace_device(workspace: dict) -> None:
    other_owner = User.objects.create_user(
        email="other-device-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    other_tenant = Tenant.objects.create(
        slug="other-device-tenant",
        display_name="Other Device Tenant",
        owner=other_owner,
    )
    MobileDevice.objects.create(
        tenant=other_tenant,
        user=workspace["admin"],
        expo_push_token="ExponentPushToken[admin-other-tenant]",
        platform="ios",
        app_flavor="ops-mobile",
    )
    with patch(
        "apps.notifications.services.expo_push.send_expo_push_messages",
        return_value={"data": [{"status": "ok"}]},
    ) as send_mock:
        scoped = send_push_to_user(
            tenant=workspace["tenant"],
            user=workspace["admin"],
            title="Scoped",
            body="Missing on this tenant",
        )
        across = send_push_to_user(
            tenant=workspace["tenant"],
            user=workspace["admin"],
            title="Across",
            body="Found on another tenant",
            across_tenants=True,
        )
    assert scoped.get("skipped") == "no_devices"
    assert across.get("skipped") is None
    send_mock.assert_called_once()
    messages = send_mock.call_args.args[0]
    assert messages[0]["to"] == "ExponentPushToken[admin-other-tenant]"


@pytest.mark.parametrize(
    ("metadata", "expected"),
    [
        ({"event_type": "billing.upi_claim_submitted"}, "payment"),
        ({"type": "billing.renewal_required"}, "payment"),
        ({"event_type": "ShopOrderReady"}, "order"),
        ({"event_type": "BookingConfirmed"}, "booking"),
    ],
)
def test_notification_type_maps_billing_events(metadata: dict, expected: str) -> None:
    assert notification_type_from_metadata(metadata) == expected
