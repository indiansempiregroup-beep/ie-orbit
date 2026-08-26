from __future__ import annotations

from django.db import migrations

PLAN_NAME_BY_CODE = {
    "appointie-starter": "Orbit Appoint Starter",
    "appointie-pro": "Orbit Appoint Pro",
    "shopie-starter": "Orbit Mart Starter",
    "shopie-pro": "Orbit Mart Pro",
}

REVERSE_PLAN_NAME_BY_CODE = {
    "appointie-starter": "AppointIE Starter",
    "appointie-pro": "AppointIE Pro",
    "shopie-starter": "ShopIE Starter",
    "shopie-pro": "ShopIE Pro",
}


def _rename_plans(apps, mapping: dict[str, str]) -> None:
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    SubscriptionPlan = apps.get_model("tenancy", "SubscriptionPlan")
    for code, name in mapping.items():
        PlatformPlanPackage.objects.filter(code=code).update(name=name)
        SubscriptionPlan.objects.filter(code=code).update(name=name)


def rename_product_display_names(apps, schema_editor):
    _rename_plans(apps, PLAN_NAME_BY_CODE)


def reverse_product_display_names(apps, schema_editor):
    _rename_plans(apps, REVERSE_PLAN_NAME_BY_CODE)


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0016_cashfree_payments_feature"),
        ("tenancy", "0004_expand_asset_url_fields"),
    ]

    operations = [
        migrations.RunPython(rename_product_display_names, reverse_product_display_names),
    ]
