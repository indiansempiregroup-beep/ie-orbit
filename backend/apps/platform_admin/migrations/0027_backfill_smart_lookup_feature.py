# Backfill Smart product lookup onto Orbit Mart packages that include catalog.

from __future__ import annotations

from django.db import migrations

NEW_FEATURE = "shopie_smart_lookup"


def add_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(product_code="shopie"):
        features = list(package.features or [])
        if "shopie_products" not in features and "shopie_pos" not in features:
            continue
        if NEW_FEATURE not in features:
            features.append(NEW_FEATURE)
            package.features = features
            package.save(update_fields=["features", "updated_at"])


def remove_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(product_code="shopie"):
        features = list(package.features or [])
        if NEW_FEATURE in features:
            package.features = [item for item in features if item != NEW_FEATURE]
            package.save(update_fields=["features", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0026_smart_lookup_gst_fx_meta"),
    ]

    operations = [
        migrations.RunPython(add_feature, remove_feature),
    ]
