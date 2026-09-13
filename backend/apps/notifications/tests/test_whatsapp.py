from __future__ import annotations

from unittest.mock import patch

import pytest

from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.businesses.models import Business, BusinessSettings
from apps.customers.models import Customer
from apps.tenancy.models import Organization, Tenant
from apps.notifications.models import Notification, NotificationChannel
from apps.notifications.services.preferences import (
    channel_enabled,
    merge_notification_preferences,
    normalize_notification_preferences,
    whatsapp_opted_in,
)
from apps.notifications.services.whatsapp_catalog import WHATSAPP_CATALOG, mapping_for_event, phase1_event_types
from apps.notifications.services.whatsapp_opt_in import set_whatsapp_opt_in
from apps.notifications.services.whatsapp_send import send_whatsapp_for_event
from apps.notifications.services.whatsapp_settings import (
    WhatsAppIntegrationService,
    webhook_url_for_platform,
    webhook_verify_token,
)
from apps.shopie.services.delivery_secrets import decrypt_secret


def test_phase1_events_map_one_to_one() -> None:
    events = phase1_event_types()
    assert len(events) == len(set(events))
    assert len(events) == 9
    for event_type in events:
        entry = mapping_for_event(event_type=event_type, audience="customer")
        assert entry is not None
    assert mapping_for_event(event_type="BookingRescheduled") is None
    assert mapping_for_event(event_type="ShopOrderPendingAdmin", audience="admin") is None
    assert mapping_for_event(event_type="ShopOrderOutForDelivery") is not None


def test_webhook_helpers_support_owner_setup() -> None:
    from django.test import override_settings

    with override_settings(
        PUBLIC_API_ORIGIN="https://api.example.com",
        WHATSAPP_WEBHOOK_VERIFY_TOKEN="owner-verify-token",
    ):
        assert webhook_url_for_platform() == "https://api.example.com/api/v1/notifications/whatsapp/webhook"
        assert webhook_verify_token() == "owner-verify-token"


def test_whatsapp_pref_defaults_off() -> None:
    normalized = normalize_notification_preferences(None)
    assert normalized["whatsapp"] is False
    merged = merge_notification_preferences(None, {"whatsapp": True, "email": False})
    assert merged["whatsapp"] is True
    assert merged["email"] is False
    user = type("U", (), {"notification_preferences": {}})()
    assert channel_enabled(user, "whatsapp") is False


@pytest.fixture
def workspace() -> dict:
    owner = User.objects.create_user(
        email="wa-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=owner, role_code="business_owner")
    customer_user = User.objects.create_user(
        email="wa-customer@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
        phone_number="9876543210",
        notification_preferences={"email": True, "push": True},
    )
    tenant = Tenant.objects.create(slug="wa-tenant", display_name="WA Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="WA Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="wa-biz",
        business_name="WA Biz",
        display_name="WA Biz",
    )
    customer = Customer.objects.create(
        tenant=tenant,
        business=business,
        customer_code="wa-customer",
        email=customer_user.email,
        phone_number="9876543210",
        first_name="Prefs",
        last_name="Customer",
        display_name="Prefs Customer",
    )
    return {
        "owner": owner,
        "customer_user": customer_user,
        "tenant": tenant,
        "business": business,
        "customer": customer,
    }


@pytest.mark.django_db
def test_whatsapp_credentials_encrypted_and_masked(workspace: dict) -> None:
    service = WhatsAppIntegrationService()
    with patch.object(WhatsAppIntegrationService, "_plan_entitled", return_value=True), patch(
        "apps.notifications.services.whatsapp_settings.get_phone_number",
        return_value={"display_phone_number": "+91 98765 43210", "quality_rating": "GREEN"},
    ):
        payload = service.update_settings(
            business=workspace["business"],
            phone_number_id="123456",
            waba_id="waba-1",
            access_token="secret-token",
            test_connection=True,
        )
    stored = BusinessSettings.objects.get(business=workspace["business"]).whatsapp_integration
    assert stored["access_token"].startswith("enc:")
    assert decrypt_secret(stored["access_token"]) == "secret-token"
    assert payload["access_token_masked"] == "••••••••"
    assert payload["display_number"]


@pytest.mark.django_db
def test_whatsapp_send_skips_without_opt_in(workspace: dict) -> None:
    with patch.object(WhatsAppIntegrationService, "_plan_entitled", return_value=True):
        WhatsAppIntegrationService().update_settings(
            business=workspace["business"],
            phone_number_id="123456",
            waba_id="waba-1",
            access_token="secret-token",
            test_connection=False,
        )
        settings = BusinessSettings.objects.get(business=workspace["business"])
        raw = dict(settings.whatsapp_integration)
        templates = dict(raw.get("templates") or {})
        templates["booking_confirmed"] = {"status": "approved", "enabled": True}
        raw["templates"] = templates
        settings.whatsapp_integration = raw
        settings.save(update_fields=["whatsapp_integration"])

        with patch("apps.notifications.services.whatsapp_send.send_template_message") as send_mock:
            result = send_whatsapp_for_event(
                tenant=workspace["tenant"],
                business=workspace["business"],
                event_type="BookingConfirmed",
                user=workspace["customer_user"],
                customer=workspace["customer"],
                context={
                    "customer_name": "Prefs",
                    "booking_number": "BK-1",
                    "service_name": "Cut",
                    "business_name": "Biz",
                    "start_at": "10:00",
                },
            )
    send_mock.assert_not_called()
    assert result is None


@pytest.mark.django_db
def test_whatsapp_send_when_opted_in(workspace: dict) -> None:
    set_whatsapp_opt_in(enabled=True, user=workspace["customer_user"], customer=workspace["customer"])
    with patch.object(WhatsAppIntegrationService, "_plan_entitled", return_value=True):
        WhatsAppIntegrationService().update_settings(
            business=workspace["business"],
            phone_number_id="123456",
            waba_id="waba-1",
            access_token="secret-token",
            test_connection=False,
        )
        settings = BusinessSettings.objects.get(business=workspace["business"])
        raw = dict(settings.whatsapp_integration)
        templates = dict(raw.get("templates") or {})
        templates["booking_confirmed"] = {"status": "approved", "enabled": True}
        raw["templates"] = templates
        settings.whatsapp_integration = raw
        settings.save(update_fields=["whatsapp_integration"])

        with patch(
            "apps.notifications.services.whatsapp_send.send_template_message",
            return_value={"messages": [{"id": "wamid.1"}]},
        ) as send_mock:
            result = send_whatsapp_for_event(
                tenant=workspace["tenant"],
                business=workspace["business"],
                event_type="BookingConfirmed",
                user=workspace["customer_user"],
                customer=workspace["customer"],
                context={
                    "customer_name": "Prefs",
                    "booking_number": "BK-1",
                    "service_name": "Cut",
                    "business_name": "Biz",
                    "start_at": "10:00",
                },
            )
    send_mock.assert_called_once()
    assert result is not None
    assert result.channel == NotificationChannel.WHATSAPP
    assert result.external_id == "wamid.1"
    assert Notification.objects.filter(channel=NotificationChannel.WHATSAPP, external_id="wamid.1").exists()
    assert whatsapp_opted_in(user=workspace["customer_user"], customer=workspace["customer"]) is True
    assert len(WHATSAPP_CATALOG) == 9
