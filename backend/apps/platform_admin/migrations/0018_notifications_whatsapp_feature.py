from __future__ import annotations

from django.db import migrations

FEATURE = "notifications_whatsapp"


def add_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.all():
        features = list(package.features or [])
        if FEATURE not in features:
            features.append(FEATURE)
            package.features = features
            package.save(update_fields=["features"])


def remove_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.all():
        features = [feature for feature in list(package.features or []) if feature != FEATURE]
        package.features = features
        package.save(update_fields=["features"])


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0017_rename_product_display_names"),
    ]

    operations = [
        migrations.RunPython(add_feature, remove_feature),
    ]
