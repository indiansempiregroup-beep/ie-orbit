# Sync Platform Admin plan packages to the launch catalog:
# ₹399 / ₹799, tighter Pro office limits, Mart Starter = counter + day-book.

from __future__ import annotations

from django.db import migrations


def sync_launch_packages(apps, schema_editor):
    from apps.billing.constants import PLAN_PRICE_PAISE, YEARLY_PRICE_MULTIPLIER
    from apps.businesses.constants import PRODUCT_PLAN_CATALOG

    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")

    sort_order = 0
    for product_code, plans in PRODUCT_PLAN_CATALOG.items():
        for plan in plans:
            sort_order += 1
            code = str(plan["code"])
            monthly = PLAN_PRICE_PAISE.get(code)
            defaults = {
                "product_code": product_code,
                "name": str(plan.get("name", code)),
                "description": str(plan.get("description", "")),
                "billing_interval": str(plan.get("billing_interval", "monthly")),
                "trial_days": int(plan.get("trial_days", 15) or 15),
                "is_default": bool(plan.get("is_default", False)),
                "max_staff": int(plan.get("max_staff", 1) or 1),
                "max_branches": int(plan.get("max_branches", 1) or 1),
                "bi_features": list(plan.get("bi_features") or []),
                "features": list(plan.get("features") or []),
                "amount_paise": monthly or 0,
                "yearly_amount_paise": monthly * YEARLY_PRICE_MULTIPLIER if monthly else None,
                "sort_order": sort_order,
                "is_active": True,
                "is_public": True,
            }
            PlatformPlanPackage.objects.update_or_create(code=code, defaults=defaults)


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0020_platform_auth_settings_base_fields"),
    ]

    operations = [
        migrations.RunPython(sync_launch_packages, noop_reverse),
    ]
