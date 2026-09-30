from __future__ import annotations

from django.db import migrations

FEATURE = "automations"


def add_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.all():
        code = str(package.code or "").lower()
        # Default-on for Pro packages of either product.
        if "-pro" not in code and not code.endswith("_pro"):
            continue
        features = list(package.features or [])
        if FEATURE not in features:
            features.append(FEATURE)
            package.features = features
            package.save(update_fields=["features"])


def remove_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.all():
        features = [f for f in list(package.features or []) if f != FEATURE]
        if features != list(package.features or []):
            package.features = features
            package.save(update_fields=["features"])


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0031_billing_gst_tax_invoices"),
    ]

    operations = [
        migrations.RunPython(add_feature, remove_feature),
    ]
