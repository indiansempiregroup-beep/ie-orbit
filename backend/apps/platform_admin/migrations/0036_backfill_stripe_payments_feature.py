# Pro plans already advertise Stripe in the catalog. Existing package rows
# predate that flag, so Platform Admin could not see it as included.

from __future__ import annotations

from django.db import migrations

FEATURE = "stripe_payments"


def add_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(code__endswith="-pro"):
        features = list(package.features or [])
        if FEATURE in features:
            continue
        features.append(FEATURE)
        package.features = features
        package.save(update_fields=["features"])


def remove_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(code__endswith="-pro"):
        features = [item for item in list(package.features or []) if item != FEATURE]
        if features == list(package.features or []):
            continue
        package.features = features
        package.save(update_fields=["features"])


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0035_usage_prices_minor"),
    ]

    operations = [
        migrations.RunPython(add_feature, remove_feature),
    ]
