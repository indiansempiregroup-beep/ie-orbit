# Backfill shop coupons onto existing ShopIE packages.

from __future__ import annotations

from django.db import migrations

NEW_FEATURE = "shopie_coupons"


def add_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(product_code="shopie"):
        features = list(package.features or [])
        if "shopie_orders" not in features and "shopie_pos" not in features:
            continue
        if NEW_FEATURE not in features:
            features.append(NEW_FEATURE)
            package.features = features
            package.save(update_fields=["features"])


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("platform_admin", "0009_affiliate_payout_details"),
    ]

    operations = [
        migrations.RunPython(add_feature, noop_reverse),
    ]
