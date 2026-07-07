from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.audit.models import DomainEvent
from apps.authentication.models import User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.billing.models import BillingWebhookEvent, WebhookEventStatus
from apps.billing.services.checkout import CheckoutService
from apps.billing.services.razorpay_client import RazorpayClient
from apps.billing.services.webhooks import WebhookService


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user() -> User:
    user = User.objects.create_user(
        email="billing-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="business_owner")
    return user


def authenticate(api_client: APIClient, user: User) -> str:
    response = api_client.post(
        reverse("auth-login"),
        {"email": user.email, "password": "ValidPass123"},
        format="json",
    )
    access = response.json()["data"]["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return access


def create_tenant(api_client: APIClient) -> str:
    response = api_client.post(
        reverse("tenant-list-create"),
        {
            "slug": "billing-tenant",
            "display_name": "Billing Tenant",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
            "language": "en-IN",
        },
        format="json",
    )
    return response.json()["data"]["id"]


@pytest.mark.django_db
def test_billing_status_mock_mode(api_client: APIClient, user: User) -> None:
    authenticate(api_client, user)
    response = api_client.get(reverse("billing-status"))
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["provider"] == "razorpay"
    assert payload["configured"] is False
    assert payload["mock_mode"] is True


@pytest.mark.django_db
def test_billing_checkout_creates_mock_order(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    business_response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "billing-biz",
            "business_name": "Billing Biz",
            "display_name": "Billing Biz",
        },
        format="json",
    )
    business_id = business_response.json()["data"]["id"]
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {access}",
        HTTP_X_TENANT_ID=tenant_id,
        HTTP_X_BUSINESS_ID=business_id,
    )

    response = api_client.post(
        reverse("billing-checkout"),
        {"product_code": "appointie", "plan_code": "appointie-starter", "business_id": business_id},
        format="json",
    )

    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["mock_mode"] is True
    assert payload["order_id"].startswith("order_mock_")
    assert payload["amount"] == 99900


@pytest.mark.django_db
def test_razorpay_mock_order_client() -> None:
    client = RazorpayClient()
    order = client.create_order(amount_paise=100, currency="INR", receipt="test-receipt")
    assert order["id"].startswith("order_mock_")
    assert client.verify_payment_signature(
        order_id=order["id"],
        payment_id="pay_mock",
        signature="ignored",
    )


@pytest.mark.django_db
def test_checkout_service_status() -> None:
    status_payload = CheckoutService().get_status()
    assert status_payload["provider"] == "razorpay"


@pytest.mark.django_db
def test_razorpay_webhook_records_duplicate_event_once(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    business_response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "billing-biz-2",
            "business_name": "Billing Biz 2",
            "display_name": "Billing Biz 2",
        },
        format="json",
    )
    business_id = business_response.json()["data"]["id"]
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {access}",
        HTTP_X_TENANT_ID=tenant_id,
        HTTP_X_BUSINESS_ID=business_id,
    )
    checkout_response = api_client.post(
        reverse("billing-checkout"),
        {"product_code": "appointie", "plan_code": "appointie-starter", "business_id": business_id},
        format="json",
    )
    order_id = checkout_response.json()["data"]["order_id"]

    payload = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_mock_duplicate",
                    "order_id": order_id,
                    "notes": {"tenant_id": tenant_id},
                }
            }
        },
    }
    first = api_client.post(
        reverse("billing-razorpay-webhook"),
        payload,
        format="json",
        HTTP_X_RAZORPAY_SIGNATURE="sig",
        HTTP_X_RAZORPAY_EVENT_ID="evt_duplicate_1",
    )
    second = api_client.post(
        reverse("billing-razorpay-webhook"),
        payload,
        format="json",
        HTTP_X_RAZORPAY_SIGNATURE="sig",
        HTTP_X_RAZORPAY_EVENT_ID="evt_duplicate_1",
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["data"]["duplicate"] is True
    assert BillingWebhookEvent.objects.filter(external_event_id="evt_duplicate_1").count() == 1


@pytest.mark.django_db
def test_billing_webhook_events_endpoint_filters_by_status(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_processed_1",
        event_type="payment.captured",
        status=WebhookEventStatus.PROCESSED,
        payload={},
    )
    BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_failed_1",
        event_type="payment.failed",
        status=WebhookEventStatus.FAILED,
        payload={},
    )

    response = api_client.get(reverse("billing-webhook-events"), {"status": "failed"})
    assert response.status_code == 200
    rows = response.json()["data"]
    assert len(rows) == 1
    assert rows[0]["external_event_id"] == "evt_failed_1"

    dead_letter_event = BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_dead_letter_1",
        event_type="payment.captured",
        status=WebhookEventStatus.DEAD_LETTER,
        payload={},
    )
    exhausted_response = api_client.get(reverse("billing-webhook-events"), {"exhausted": "true"})
    assert exhausted_response.status_code == 200
    exhausted_rows = exhausted_response.json()["data"]
    assert len(exhausted_rows) == 1
    assert exhausted_rows[0]["external_event_id"] == dead_letter_event.external_event_id


@pytest.mark.django_db
def test_billing_webhook_summary_endpoint(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_summary_ok",
        event_type="payment.captured",
        status=WebhookEventStatus.PROCESSED,
        payload={},
    )
    BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_summary_fail",
        event_type="payment.failed",
        status=WebhookEventStatus.FAILED,
        payload={},
    )
    BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_summary_dead",
        event_type="payment.failed",
        status=WebhookEventStatus.DEAD_LETTER,
        payload={},
    )

    response = api_client.get(reverse("billing-webhook-summary"), {"window_hours": 24})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["total"] == 3
    assert data["processed"] == 1
    assert data["failed"] == 1
    assert data["dead_letter"] == 1
    assert data["failure_rate"] > 0


@pytest.mark.django_db
def test_billing_webhook_event_reprocess_endpoint(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    event = BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_reprocess_1",
        event_type="payment.failed",
        status=WebhookEventStatus.FAILED,
        payload={"event": "payment.failed", "payload": {}},
    )
    response = api_client.post(reverse("billing-webhook-reprocess", kwargs={"event_id": event.id}))
    assert response.status_code == 200
    assert response.json()["data"]["reprocessed"] is True
    event.refresh_from_db()
    assert event.status == WebhookEventStatus.PROCESSED


@pytest.mark.django_db
def test_billing_webhook_bulk_reprocess_endpoint(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_bulk_1",
        event_type="payment.failed",
        status=WebhookEventStatus.FAILED,
        payload={"event": "payment.failed", "payload": {}},
    )
    BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_bulk_2",
        event_type="payment.failed",
        status=WebhookEventStatus.FAILED,
        payload={"event": "payment.failed", "payload": {}},
    )

    response = api_client.post(
        reverse("billing-webhook-bulk-reprocess"),
        {"scope": "failed", "limit": 10, "confirm": True},
        format="json",
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["selected"] == 2
    assert data["processed"] == 2


@pytest.mark.django_db
def test_billing_webhook_bulk_reprocess_requires_cooldown(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_bulk_cd_1",
        event_type="payment.failed",
        status=WebhookEventStatus.FAILED,
        payload={"event": "payment.failed", "payload": {}},
    )
    first = api_client.post(
        reverse("billing-webhook-bulk-reprocess"),
        {"scope": "failed", "limit": 10, "confirm": True},
        format="json",
    )
    second = api_client.post(
        reverse("billing-webhook-bulk-reprocess"),
        {"scope": "failed", "limit": 10, "confirm": True},
        format="json",
    )
    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "BULK_REPROCESS_COOLDOWN"


@pytest.mark.django_db
def test_webhook_failure_emits_domain_event_alert(monkeypatch: pytest.MonkeyPatch) -> None:
    tenant = User.objects.create_user(
        email="webhook-alert-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    # Create tenant through API-driven path constraints are unnecessary here.
    from apps.tenancy.models import Tenant

    tenant_obj = Tenant.objects.create(
        owner=tenant,
        slug="webhook-alert-tenant",
        display_name="Webhook Alert Tenant",
    )
    event = BillingWebhookEvent.objects.create(
        tenant=tenant_obj,
        external_event_id="evt_alert_1",
        event_type="payment.captured",
        status=WebhookEventStatus.FAILED,
        payload={"event": "payment.captured", "payload": {}},
    )

    def _raise(_payload: dict) -> None:
        raise RuntimeError("simulated reprocess failure")

    service = WebhookService()
    monkeypatch.setattr(service, "_handle_event", _raise)

    result = service.reprocess_webhook_event(webhook_event=event)
    assert result["reprocessed"] is False
    assert DomainEvent.objects.filter(
        tenant=tenant_obj,
        event_type="billing.webhook.failed",
        aggregate_type="billing_webhook_event",
        aggregate_id=str(event.id),
    ).exists()


@pytest.mark.django_db
def test_webhook_failure_schedules_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    user = User.objects.create_user(
        email="retry-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    from apps.tenancy.models import Tenant

    tenant_obj = Tenant.objects.create(
        owner=user,
        slug="retry-tenant",
        display_name="Retry Tenant",
    )
    event = BillingWebhookEvent.objects.create(
        tenant=tenant_obj,
        external_event_id="evt_retry_1",
        event_type="payment.captured",
        status=WebhookEventStatus.FAILED,
        payload={"event": "payment.captured", "payload": {}},
    )

    service = WebhookService()
    monkeypatch.setattr(service, "_handle_event", lambda _payload: (_ for _ in ()).throw(RuntimeError("boom")))

    scheduled: dict[str, object] = {}

    def _fake_apply_async(*, args: list[str], countdown: int) -> None:
        scheduled["args"] = args
        scheduled["countdown"] = countdown

    from apps.billing.tasks import reprocess_webhook_event_task

    monkeypatch.setattr(reprocess_webhook_event_task, "apply_async", _fake_apply_async)

    result = service.reprocess_webhook_event(webhook_event=event)
    assert result["reprocessed"] is False
    event.refresh_from_db()
    assert event.retry_count == 1
    assert event.next_retry_at is not None
    assert scheduled["args"] == [str(event.id)]
    assert isinstance(scheduled["countdown"], int)


@pytest.mark.django_db
def test_webhook_failure_moves_to_dead_letter_when_retries_exhausted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = User.objects.create_user(
        email="deadletter-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    from apps.billing.constants import WEBHOOK_RETRY_DELAYS_SECONDS
    from apps.tenancy.models import Tenant

    tenant_obj = Tenant.objects.create(
        owner=user,
        slug="deadletter-tenant",
        display_name="Dead Letter Tenant",
    )
    event = BillingWebhookEvent.objects.create(
        tenant=tenant_obj,
        external_event_id="evt_dead_1",
        event_type="payment.captured",
        status=WebhookEventStatus.FAILED,
        retry_count=len(WEBHOOK_RETRY_DELAYS_SECONDS),
        payload={"event": "payment.captured", "payload": {}},
    )

    service = WebhookService()
    monkeypatch.setattr(service, "_handle_event", lambda _payload: (_ for _ in ()).throw(RuntimeError("boom")))
    result = service.reprocess_webhook_event(webhook_event=event)
    assert result["reprocessed"] is False
    event.refresh_from_db()
    assert event.status == WebhookEventStatus.DEAD_LETTER
    assert event.next_retry_at is None
    assert DomainEvent.objects.filter(
        tenant=tenant_obj,
        event_type="billing.webhook.dead_letter",
        aggregate_id=str(event.id),
    ).exists()
