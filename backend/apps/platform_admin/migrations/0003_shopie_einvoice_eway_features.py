# Appends the GST e-invoice / e-way bill feature flags to the ShopIE Pro plan
# package so tenants that already seeded PlatformPlanPackage rows (via
# 0002_platform_plan_packages or seed_plan_packages_from_catalog) pick up the
# new entitlements without needing a full re-seed.

from __future__ import annotations

from django.db import migrations

NEW_SHOPIE_PRO_FEATURES = ["shopie_einvoice", "shopie_eway"]


def add_einvoice_eway_features(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(product_code="shopie", code="shopie-pro"):
        features = list(package.features or [])
        changed = False
        for feature in NEW_SHOPIE_PRO_FEATURES:
            if feature not in features:
                features.append(feature)
                changed = True
        if changed:
            package.features = features
            package.save(update_fields=["features"])


def remove_einvoice_eway_features(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(product_code="shopie", code="shopie-pro"):
        features = [f for f in (package.features or []) if f not in NEW_SHOPIE_PRO_FEATURES]
        if features != list(package.features or []):
            package.features = features
            package.save(update_fields=["features"])


class Migration(migrations.Migration):

    dependencies = [
        ("platform_admin", "0002_platform_plan_packages"),
    ]

    operations = [
        migrations.RunPython(add_einvoice_eway_features, remove_einvoice_eway_features),
    ]
