# Backfill Pro-only background-remove features onto Orbit Mart / Appoint packages.

from __future__ import annotations

from django.db import migrations

SHOPIE_FEATURE = "shopie_product_bg_remove"
APPOINTIE_FEATURE = "appointie_service_bg_remove"


def _is_pro_package(package) -> bool:
    code = str(getattr(package, "code", "") or "").strip().lower()
    return code.endswith("-pro") or code.endswith("_pro") or "-pro-" in code


def add_features(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(product_code="shopie"):
        if not _is_pro_package(package):
            continue
        features = list(package.features or [])
        if SHOPIE_FEATURE not in features:
            features.append(SHOPIE_FEATURE)
            package.features = features
            package.save(update_fields=["features", "updated_at"])
    for package in PlatformPlanPackage.objects.filter(product_code="appointie"):
        if not _is_pro_package(package):
            continue
        features = list(package.features or [])
        if APPOINTIE_FEATURE not in features:
            features.append(APPOINTIE_FEATURE)
            package.features = features
            package.save(update_fields=["features", "updated_at"])


def remove_features(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(product_code="shopie"):
        features = list(package.features or [])
        if SHOPIE_FEATURE in features:
            package.features = [item for item in features if item != SHOPIE_FEATURE]
            package.save(update_fields=["features", "updated_at"])
    for package in PlatformPlanPackage.objects.filter(product_code="appointie"):
        features = list(package.features or [])
        if APPOINTIE_FEATURE in features:
            package.features = [item for item in features if item != APPOINTIE_FEATURE]
            package.save(update_fields=["features", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0032_automations_feature"),
    ]

    operations = [
        migrations.RunPython(add_features, remove_features),
    ]
