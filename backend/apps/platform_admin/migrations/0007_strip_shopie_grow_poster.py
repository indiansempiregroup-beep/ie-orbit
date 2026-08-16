# Strip legacy shopie_grow_poster from PlatformPlanPackage.features JSON.

from __future__ import annotations

from django.db import migrations

REMOVED = "shopie_grow_poster"


def strip_poster_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.all():
        features = list(package.features or [])
        if REMOVED not in features:
            continue
        package.features = [f for f in features if f != REMOVED]
        package.save(update_fields=["features"])


def restore_poster_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(product_code="shopie"):
        features = list(package.features or [])
        if REMOVED in features:
            continue
        # Only restore onto packages that already carry grow features.
        if any(str(f).startswith("shopie_grow_") for f in features):
            features.append(REMOVED)
            package.features = features
            package.save(update_fields=["features"])


class Migration(migrations.Migration):

    dependencies = [
        ("platform_admin", "0006_grow_ads_referrals_slots_affiliates"),
    ]

    operations = [
        migrations.RunPython(strip_poster_feature, restore_poster_feature),
    ]
