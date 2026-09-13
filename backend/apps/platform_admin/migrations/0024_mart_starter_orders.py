# Mart Starter includes online orders and returns. Instant delivery stays on Pro.

from __future__ import annotations

from django.db import migrations

STARTER_EXTRAS = ("shopie_orders", "shopie_returns")


def add_mart_starter_orders(apps, schema_editor):
    from apps.businesses.constants import PRODUCT_PLAN_CATALOG

    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    starter = PlatformPlanPackage.objects.filter(code="shopie-starter").first()
    if starter is not None:
        features = list(starter.features or [])
        changed = False
        for feature in STARTER_EXTRAS:
            if feature not in features:
                features.append(feature)
                changed = True
        updates = ["updated_at"]
        if changed:
            starter.features = features
            updates.append("features")
        catalog_starter = next(
            (plan for plan in PRODUCT_PLAN_CATALOG.get("shopie", []) if str(plan.get("code")) == "shopie-starter"),
            None,
        )
        if catalog_starter and catalog_starter.get("description"):
            starter.description = str(catalog_starter["description"])
            updates.append("description")
        starter.save(update_fields=updates)

    pro = PlatformPlanPackage.objects.filter(code="shopie-pro").first()
    catalog_pro = next(
        (plan for plan in PRODUCT_PLAN_CATALOG.get("shopie", []) if str(plan.get("code")) == "shopie-pro"),
        None,
    )
    if pro is not None and catalog_pro and catalog_pro.get("description"):
        pro.description = str(catalog_pro["description"])
        pro.save(update_fields=["description", "updated_at"])


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0023_plan_package_extra_caps"),
    ]

    operations = [
        migrations.RunPython(add_mart_starter_orders, noop_reverse),
    ]
