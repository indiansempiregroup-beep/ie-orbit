from __future__ import annotations

from django.db import migrations

PRO_FEATURES = ["ad_free", "razorpay_payments"]


def add_pro_features(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(code__endswith="-pro"):
        features = list(package.features or [])
        changed = False
        for feature in PRO_FEATURES:
            if feature not in features:
                features.append(feature)
                changed = True
        if changed:
            package.features = features
            package.save(update_fields=["features"])


def remove_pro_features(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(code__endswith="-pro"):
        features = [
            feature
            for feature in list(package.features or [])
            if feature not in PRO_FEATURES
        ]
        package.features = features
        package.save(update_fields=["features"])


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0014_backfill_shop_instant_delivery"),
    ]

    operations = [
        migrations.RunPython(add_pro_features, remove_pro_features),
    ]
