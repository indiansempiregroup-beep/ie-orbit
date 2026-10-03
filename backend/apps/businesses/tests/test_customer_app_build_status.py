from __future__ import annotations

from unittest.mock import patch

import pytest

from apps.authentication.models import User, UserStatus
from apps.businesses.models import Business, WhiteLabelProfile
from apps.businesses.services.customer_app_build import (
    _normalize_build_history,
    customer_app_recipe,
    record_build_callback,
    refresh_build_status_from_expo,
    update_customer_app_settings,
)
from apps.tenancy.models import Organization, Tenant


@pytest.fixture
def tenant_business() -> Business:
    owner = User.objects.create_user(
        email="build-status-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(
        slug="build-status-tenant",
        display_name="Build Status Tenant",
        owner=owner,
    )
    organization = Organization.objects.create(tenant=tenant, name="Build Status Org")
    return Business.objects.create(
        tenant=tenant,
        organization=organization,
        business_code="spa-main",
        business_name="Spa Main",
        display_name="Build Spa",
    )


@pytest.fixture
def white_label_profile(tenant_business: Business) -> WhiteLabelProfile:
    return WhiteLabelProfile.objects.create(
        tenant=tenant_business.tenant,
        business=tenant_business,
        flavor_key="build-status-tenant-spa-main",
        app_slug="build-status-tenant",
        app_name="Build Status",
        bundle_id_android="com.ieorbit.buildstatus",
        bundle_id_ios="com.ieorbit.buildstatus",
        white_label_enabled=True,
        build_metadata={},
    )


def test_normalize_build_history_fills_at_from_started_at() -> None:
    rows = _normalize_build_history(
        [
            {"track": "preview", "status": "queued", "started_at": "2026-04-01T10:00:00+00:00"},
            {"track": "preview", "status": "finished", "at": "2026-04-01T11:00:00+00:00"},
        ]
    )
    assert rows[0]["at"] == "2026-04-01T10:00:00+00:00"
    assert rows[1]["at"] == "2026-04-01T11:00:00+00:00"


@pytest.mark.django_db
def test_record_build_callback_collapses_duplicate_history(white_label_profile: WhiteLabelProfile) -> None:
    record_build_callback(
        profile=white_label_profile,
        track="preview",
        status="in_progress",
        build_id="build-1",
    )
    record_build_callback(
        profile=white_label_profile,
        track="preview",
        status="in_progress",
        build_id="build-1",
    )
    white_label_profile.refresh_from_db()
    builds = white_label_profile.build_metadata.get("builds") or []
    assert len(builds) == 1
    record_build_callback(
        profile=white_label_profile,
        track="preview",
        status="finished",
        build_id="build-1",
        apk_url="https://example.com/app.apk",
    )
    white_label_profile.refresh_from_db()
    builds = white_label_profile.build_metadata.get("builds") or []
    assert len(builds) == 2
    assert builds[0]["status"] == "finished"
    assert builds[0]["at"]


@pytest.mark.django_db
def test_refresh_recovers_build_id_and_syncs_finished(white_label_profile: WhiteLabelProfile) -> None:
    white_label_profile.build_metadata = {"preview": {"status": "in_progress"}}
    white_label_profile.save(update_fields=["build_metadata"])

    recovered = {
        "id": "expo-build-99",
        "status": "FINISHED",
        "appIdentifier": "com.ieorbit.buildstatus",
        "appVersion": "1.0.3",
        "appBuildVersion": "3",
        "artifacts": {"buildUrl": "https://example.com/preview.apk"},
    }

    with (
        patch(
            "apps.businesses.services.customer_app_build._expo_access_token",
            return_value="token",
        ),
        patch(
            "apps.businesses.services.customer_app_build._recover_build_id_from_expo",
            return_value=recovered,
        ),
        patch(
            "apps.businesses.services.customer_app_build._expo_graphql",
            return_value={
                "data": {
                    "builds": {
                        "byId": {
                            "id": "expo-build-99",
                            "status": "FINISHED",
                            "appVersion": "1.0.3",
                            "appBuildVersion": "3",
                            "artifacts": {"buildUrl": "https://example.com/preview.apk"},
                        }
                    }
                }
            },
        ),
    ):
        row = refresh_build_status_from_expo(profile=white_label_profile, track="preview")

    assert row["status"] == "finished"
    assert row["build_id"] == "expo-build-99"
    assert row["apk_url"] == "https://example.com/preview.apk"
    assert "Synced from Expo" in str(row.get("refresh_note") or "")
    white_label_profile.refresh_from_db()
    recipe = customer_app_recipe(white_label_profile)
    assert recipe["preview"]["status"] == "finished"
    assert recipe["builds"]


@pytest.mark.django_db
def test_mark_live_requires_finished_store_build(white_label_profile: WhiteLabelProfile) -> None:
    white_label_profile.build_metadata = {"production": {"status": "in_progress"}}
    white_label_profile.save(update_fields=["build_metadata"])
    with pytest.raises(RuntimeError, match="Store AAB must finish"):
        update_customer_app_settings(profile=white_label_profile, mark_live=True)

    white_label_profile.build_metadata = {
        "production": {
            "status": "finished",
            "version_name": "1.2.0",
            "version_code": 12,
            "build_id": "store-1",
            "apk_url": "https://example.com/app.aab",
        }
    }
    white_label_profile.save(update_fields=["build_metadata"])
    update_customer_app_settings(profile=white_label_profile, mark_live=True)
    white_label_profile.refresh_from_db()
    live = white_label_profile.build_metadata.get("live") or {}
    assert live["version_name"] == "1.2.0"
    assert live["marked_live_at"]
