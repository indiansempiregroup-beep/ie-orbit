from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.audit.models import AuditLogEntry, DomainEvent
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
def test_billing_plan_catalog_endpoint(api_client: APIClient, user: User) -> None:
    authenticate(api_client, user)
    response = api_client.get(reverse("billing-plan-catalog"))
    assert response.status_code == 200
    payload = response.json()["data"]
    assert isinstance(payload, list)
    assert any(plan["plan_code"] == "appointie-starter" for plan in payload)


@pytest.mark.django_db
def test_public_plan_catalog_unauthenticated(api_client: APIClient) -> None:
    response = api_client.get(reverse("billing-public-plan-catalog"))
    assert response.status_code == 200
    payload = response.json()["data"]
    codes = [plan["plan_code"] for plan in payload["plans"]]
    assert "appointie-starter" in codes
    assert payload["trial_days"] >= 1
    assert payload["addon_staff_price_paise"] > 0
    assert payload["addon_office_price_paise"] > 0


@pytest.mark.django_db
def test_public_plan_catalog_hides_private_packages(api_client: APIClient) -> None:
    from apps.platform_admin.models import PlatformPlanPackage

    hidden = PlatformPlanPackage.objects.filter(code="appointie-pro").first()
    if hidden is None:
        pytest.skip("appointie-pro package not seeded")
    hidden.is_public = False
    hidden.save(update_fields=["is_public", "updated_at"])

    public = api_client.get(reverse("billing-public-plan-catalog"))
    public_codes = [plan["plan_code"] for plan in public.json()["data"]["plans"]]
    assert "appointie-pro" not in public_codes
    assert "appointie-starter" in public_codes


@pytest.mark.django_db
def test_billing_plan_catalog_honors_price_override(api_client: APIClient, user: User, settings) -> None:
    settings.BILLING_PLAN_PRICE_OVERRIDES = {"appointie-starter": 123400}
    authenticate(api_client, user)
    response = api_client.get(reverse("billing-plan-catalog"))
    assert response.status_code == 200
    payload = response.json()["data"]
    starter = next(plan for plan in payload if plan["plan_code"] == "appointie-starter")
    assert starter["amount_paise"] == 123400


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
def test_billing_checkout_honors_price_override(api_client: APIClient, user: User, settings) -> None:
    settings.BILLING_PLAN_PRICE_OVERRIDES = {"appointie-starter": 123400}
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "billing-price-biz",
            "business_name": "Billing Price Biz",
            "display_name": "Billing Price Biz",
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
    assert response.json()["data"]["amount"] == 123400


@pytest.mark.django_db
def test_billing_checkout_live_enforcement(api_client: APIClient, user: User, settings) -> None:
    settings.BILLING_ENFORCE_LIVE_CHECKOUT = True
    settings.RAZORPAY_KEY_ID = ""
    settings.RAZORPAY_KEY_SECRET = ""
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    business_response = api_client.post(
        reverse("business-list-create"),
        {
            "business_code": "billing-live-biz",
            "business_name": "Billing Live Biz",
            "display_name": "Billing Live Biz",
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
    assert response.status_code == 422
    assert "Live checkout is enforced" in str(response.json())


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
def test_billing_reconciliation_run_endpoint(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    response = api_client.post(
        reverse("billing-reconciliation-run"),
        {"lookback_hours": 24},
        format="json",
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["tenant_id"] == tenant_id
    assert "scanned_sessions" in payload


@pytest.mark.django_db
def test_billing_go_live_check_endpoint(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    response = api_client.get(reverse("billing-go-live-check"))
    assert response.status_code == 200
    payload = response.json()["data"]
    assert "ready" in payload
    assert "checks" in payload
    assert isinstance(payload["checks"], list)


@pytest.mark.django_db
def test_billing_release_gate_endpoint(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    response = api_client.get(reverse("billing-release-gate"))
    assert response.status_code == 200
    payload = response.json()["data"]
    assert "passed" in payload
    assert "failing_checks" in payload
    assert isinstance(payload["failing_checks"], list)
    if payload["failing_checks"]:
        assert "remediation" in payload["failing_checks"][0]


@pytest.mark.django_db
def test_billing_release_gate_fails_when_razorpay_missing(
    api_client: APIClient,
    user: User,
    settings,
) -> None:
    settings.RAZORPAY_KEY_ID = ""
    settings.RAZORPAY_KEY_SECRET = ""
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    response = api_client.get(reverse("billing-release-gate"))
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["passed"] is False
    assert "razorpay_configured" in payload["blockers"]
    failing_ids = {check["id"] for check in payload["failing_checks"]}
    assert "razorpay_configured" in failing_ids


@pytest.mark.django_db
def test_billing_observability_endpoint(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    DomainEvent.objects.create(
        tenant_id=tenant_id,
        event_type="billing.webhook.failed",
        aggregate_type="billing_webhook_event",
        aggregate_id="evt-1",
        payload={},
        status="published",
    )
    DomainEvent.objects.create(
        tenant_id=tenant_id,
        event_type="onboarding.workspace.provisioned",
        aggregate_type="tenant",
        aggregate_id=tenant_id,
        payload={},
        status="published",
    )
    AuditLogEntry.objects.create(
        tenant_id=tenant_id,
        action="billing.reconciliation.run",
        resource_type="billing_checkout_session",
        metadata={},
    )
    response = api_client.get(reverse("billing-observability"), {"window_hours": 24})
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["events"]["billing_webhook_failed"] == 1
    assert payload["events"]["onboarding_workspace_provisioned"] == 1
    assert payload["audits"]["reconciliation_runs"] == 1


@pytest.mark.django_db
def test_billing_ops_snapshot_endpoint_json_and_csv(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)

    BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_snapshot_1",
        event_type="payment.failed",
        status=WebhookEventStatus.FAILED,
        payload={},
    )

    json_response = api_client.get(reverse("billing-ops-snapshot"), {"window_hours": 24})
    assert json_response.status_code == 200
    json_payload = json_response.json()["data"]
    assert "webhooks" in json_payload
    assert "events" in json_payload
    assert "audits" in json_payload
    assert "health_score" in json_payload
    assert "recommendations" in json_payload
    assert "trend" in json_payload

    csv_response = api_client.get(reverse("billing-ops-snapshot"), {"window_hours": 24, "format": "csv"})
    assert csv_response.status_code == 200
    assert csv_response["Content-Type"].startswith("text/csv")
    assert "metric,value" in csv_response.content.decode("utf-8")
    assert "health_score" in csv_response.content.decode("utf-8")
    assert "trend.failure_rate_delta" in csv_response.content.decode("utf-8")


@pytest.mark.django_db
def test_billing_ops_digest_endpoint(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    BillingWebhookEvent.objects.create(
        tenant_id=tenant_id,
        external_event_id="evt_digest_1",
        event_type="payment.failed",
        status=WebhookEventStatus.FAILED,
        payload={},
    )
    response = api_client.get(reverse("billing-ops-digest"), {"window_hours": 24})
    assert response.status_code == 200
    payload = response.json()["data"]
    assert "digest_text" in payload
    assert "Launch posture" in payload["digest_text"]


@pytest.mark.django_db
def test_billing_platform_ops_summary_requires_platform_role(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    response = api_client.get(reverse("billing-platform-ops-summary"), {"window_hours": 24})
    assert response.status_code == 403


@pytest.mark.django_db
def test_billing_platform_ops_summary_for_platform_admin(api_client: APIClient) -> None:
    user = User.objects.create_user(
        email="platform-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="platform_admin")
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    response = api_client.get(reverse("billing-platform-ops-summary"), {"window_hours": 24, "limit": 20})
    assert response.status_code == 200
    payload = response.json()["data"]
    assert "tenant_count" in payload
    assert "rows" in payload


@pytest.mark.django_db
def test_billing_platform_subscriptions_requires_platform_role(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    response = api_client.get(reverse("billing-platform-subscriptions"))
    assert response.status_code == 403


@pytest.mark.django_db
def test_billing_platform_subscriptions_for_platform_admin(api_client: APIClient) -> None:
    user = User.objects.create_user(
        email="platform-admin-subs@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="platform_admin")
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    response = api_client.get(reverse("billing-platform-subscriptions"))
    assert response.status_code == 200
    payload = response.json()["data"]
    assert "total_subscriptions" in payload
    assert "by_status" in payload
    assert "by_product" in payload


@pytest.mark.django_db
def test_billing_platform_monitoring_and_audit_feed_for_platform_admin(api_client: APIClient) -> None:
    user = User.objects.create_user(
        email="platform-admin-monitor@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="platform_admin")
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    AuditLogEntry.objects.create(
        tenant_id=tenant_id,
        action="billing.reconciliation.run",
        resource_type="billing_checkout_session",
        metadata={},
    )
    monitor_response = api_client.get(reverse("billing-platform-monitoring"), {"window_hours": 24})
    assert monitor_response.status_code == 200
    monitor_payload = monitor_response.json()["data"]
    assert "failed_events" in monitor_payload
    assert "tenants_impacted" in monitor_payload

    feed_response = api_client.get(reverse("billing-platform-audit-feed"), {"limit": 20})
    assert feed_response.status_code == 200
    feed_payload = feed_response.json()["data"]
    assert "rows" in feed_payload


@pytest.mark.django_db
def test_platform_addon_pricing_get_and_update(api_client: APIClient) -> None:
    user = User.objects.create_user(
        email="platform-addon-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="platform_admin")
    authenticate(api_client, user)

    get_response = api_client.get(reverse("platform-addon-pricing"))
    assert get_response.status_code == 200
    current = get_response.json()["data"]
    assert current["staff_price_paise"] >= 0
    assert current["office_price_paise"] >= 0
    assert current["pets_price_paise"] >= 0

    put_response = api_client.put(
        reverse("platform-addon-pricing"),
        {
            "staff_price_paise": 25000,
            "office_price_paise": 35000,
            "pets_price_paise": 60000,
            "reason": "Adjust add-on prices",
        },
        format="json",
    )
    assert put_response.status_code == 200
    updated = put_response.json()["data"]
    assert updated["staff_price_paise"] == 25000
    assert updated["office_price_paise"] == 35000
    assert updated["pets_price_paise"] == 60000
    assert updated["staff_price_inr"] == 250


@pytest.mark.django_db
def test_platform_revenue_requires_platform_role(api_client: APIClient, user: User) -> None:
    access = authenticate(api_client, user)
    tenant_id = create_tenant(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}", HTTP_X_TENANT_ID=tenant_id)
    response = api_client.get(reverse("billing-platform-revenue"))
    assert response.status_code == 403


@pytest.mark.django_db
def test_platform_revenue_insights_for_platform_admin(api_client: APIClient) -> None:
    from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
    from apps.billing.services.platform_revenue import build_platform_revenue_insights
    from apps.businesses.models import (
        Business,
        BusinessProductSubscription,
        BusinessProductSubscriptionStatus,
    )
    from apps.tenancy.models import Organization, SubscriptionPlan, Tenant
    from django.utils import timezone

    user = User.objects.create_user(
        email="platform-revenue-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="platform_admin")
    authenticate(api_client, user)

    owner = User.objects.create_user(
        email="revenue-tenant-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="revenue-tenant", display_name="Revenue Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Revenue Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="revenue-biz",
        business_name="Revenue Biz",
        display_name="Revenue Biz",
    )
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-starter",
        defaults={"name": "AppointIE Starter", "is_public": True},
    )
    BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
        billing_interval="monthly",
    )
    BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="shopie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
        billing_interval="monthly",
        extra_staff=0,
        extra_offices=0,
        external_billing_reference="comp:admin:2026-08-14",
    )
    BillingCheckoutSession.objects.create(
        tenant=tenant,
        business=business,
        product_code="appointie",
        plan_code="appointie-starter",
        razorpay_order_id="order_revenue_1",
        amount_paise=99900,
        currency="INR",
        status=CheckoutSessionStatus.PAID,
        paid_at=timezone.now(),
    )

    insights = build_platform_revenue_insights()
    assert insights["collected_all_time_paise"] >= 99900
    assert insights["paying_subscriptions"] >= 1
    assert insights["complimentary_subscriptions"] >= 1
    assert insights["mrr_paise"] >= 99900

    response = api_client.get(reverse("billing-platform-revenue"))
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["currency"] == "INR"
    assert "mrr_paise" in payload
    assert "collected_month_paise" in payload


@pytest.mark.django_db
def test_platform_upi_claims_list_for_platform_admin(api_client: APIClient) -> None:
    from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
    from apps.businesses.models import Business
    from apps.tenancy.models import Organization, Tenant

    user = User.objects.create_user(
        email="platform-claims-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="platform_admin")
    authenticate(api_client, user)
    owner = User.objects.create_user(
        email="claims-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="claims-tenant", display_name="Claims Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Claims Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="claims-biz",
        business_name="Claims Biz",
        display_name="Claims Biz",
    )
    BillingCheckoutSession.objects.create(
        tenant=tenant,
        business=business,
        product_code="appointie",
        plan_code="appointie-starter",
        razorpay_order_id="order_claim_1",
        amount_paise=99900,
        currency="INR",
        status=CheckoutSessionStatus.CREATED,
        metadata={"payment_status": "awaiting_confirmation", "upi_utr": "123456789012"},
    )
    response = api_client.get(reverse("platform-upi-claims"))
    assert response.status_code == 200
    claims = response.json()["data"]["claims"]
    assert len(claims) == 1
    assert claims[0]["upi_utr"] == "123456789012"
    assert claims[0]["tenant_name"] == "Claims Tenant"


@pytest.mark.django_db
def test_platform_tenant_directory_includes_billing_state(api_client: APIClient) -> None:
    from apps.billing.models import BillingCheckoutSession, CheckoutSessionStatus
    from apps.businesses.models import (
        Business,
        BusinessProductSubscription,
        BusinessProductSubscriptionStatus,
    )
    from apps.tenancy.models import Organization, SubscriptionPlan, Tenant
    from django.utils import timezone

    user = User.objects.create_user(
        email="platform-tenants-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="platform_admin")
    authenticate(api_client, user)
    owner = User.objects.create_user(
        email="dir-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="dir-tenant", display_name="Dir Tenant", owner=owner)
    organization = Organization.objects.create(tenant=tenant, name="Dir Org")
    business = Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="dir-biz",
        business_name="Dir Biz",
        display_name="Dir Biz",
        selected_product="appointie",
    )
    plan, _ = SubscriptionPlan.objects.get_or_create(
        code="appointie-pro",
        defaults={"name": "AppointIE Pro", "is_public": True},
    )
    BusinessProductSubscription.objects.create(
        tenant=tenant,
        business=business,
        product_code="appointie",
        status=BusinessProductSubscriptionStatus.ACTIVE,
        plan=plan,
    )
    BillingCheckoutSession.objects.create(
        tenant=tenant,
        business=business,
        product_code="appointie",
        plan_code="appointie-pro",
        razorpay_order_id="order_dir_1",
        amount_paise=199900,
        currency="INR",
        status=CheckoutSessionStatus.PAID,
        paid_at=timezone.now(),
    )
    response = api_client.get(reverse("platform-tenant-admin-list"))
    assert response.status_code == 200
    rows = response.json()["data"]["tenants"]
    match = next(row for row in rows if row["slug"] == "dir-tenant")
    assert match["billing_state"] == "paying"
    assert match["plan_code"] == "appointie-pro"
    assert match["last_paid_paise"] == 199900


@pytest.mark.django_db
def test_platform_webhook_events_for_platform_admin(api_client: APIClient) -> None:
    from apps.tenancy.models import Tenant

    user = User.objects.create_user(
        email="platform-monitor-admin@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    RoleService().assign_role(user=user, role_code="platform_admin")
    authenticate(api_client, user)
    owner = User.objects.create_user(
        email="monitor-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="monitor-tenant", display_name="Monitor Tenant", owner=owner)
    event = BillingWebhookEvent.objects.create(
        tenant=tenant,
        external_event_id="evt_platform_failed_1",
        event_type="payment.failed",
        status=WebhookEventStatus.FAILED,
        payload={},
        error_message="boom",
    )
    list_response = api_client.get(reverse("billing-platform-webhook-events"), {"window_hours": 24})
    assert list_response.status_code == 200
    payload = list_response.json()["data"]
    assert payload["count"] >= 1
    assert payload["events"][0]["external_event_id"] == event.external_event_id
    reprocess = api_client.post(
        reverse("billing-platform-webhook-reprocess", kwargs={"event_id": event.id})
    )
    assert reprocess.status_code == 200
    assert "reprocessed" in reprocess.json()["data"]


@pytest.mark.django_db
def test_send_billing_ops_digest_task(monkeypatch: pytest.MonkeyPatch, settings) -> None:
    user = User.objects.create_user(
        email="ops-digest-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    from apps.tenancy.models import Tenant

    Tenant.objects.create(owner=user, slug="ops-digest-tenant", display_name="Ops Digest Tenant")
    settings.BILLING_OPS_DIGEST_RECIPIENTS = "ops@example.com"
    captured: dict[str, object] = {}

    def _fake_send_mail(*, subject: str, message: str, from_email: str, recipient_list: list[str], fail_silently: bool):
        captured["subject"] = subject
        captured["message"] = message
        captured["recipients"] = recipient_list
        return 1

    monkeypatch.setattr("apps.billing.tasks.send_mail", _fake_send_mail)
    from apps.billing.tasks import send_billing_ops_digest_task

    result = send_billing_ops_digest_task(window_hours=24)
    assert result["sent"] is True
    assert captured["recipients"] == ["ops@example.com"]


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
