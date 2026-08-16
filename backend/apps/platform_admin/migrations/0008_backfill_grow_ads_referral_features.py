# Backfill new Grow ads + customer referral features onto existing ShopIE packages.

from __future__ import annotations

from django.db import migrations

NEW_FEATURES = [
    "shopie_grow_ads",
    "shopie_customer_referral",
]


def add_features(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(product_code="shopie"):
        features = list(package.features or [])
        changed = False
        # Packages that already had Grow tools should get ads + referral toggles.
        has_grow = any(str(feature).startswith("shopie_grow_") for feature in features)
        if not has_grow and "shopie_pos" not in features:
            continue
        for feature in NEW_FEATURES:
            if feature not in features:
                features.append(feature)
                changed = True
        if changed:
            package.features = features
            package.save(update_fields=["features"])


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("platform_admin", "0007_strip_shopie_grow_poster"),
    ]

    operations = [
        migrations.RunPython(add_features, noop_reverse),
    ]
