# Starter add-on caps: 1 extra staff, no extra office. Pro extras stay unlimited.

from __future__ import annotations

from django.db import migrations, models


def sync_extra_caps(apps, schema_editor):
    from apps.billing.constants import PLAN_PRICE_PAISE, YEARLY_PRICE_MULTIPLIER
    from apps.businesses.constants import PRODUCT_PLAN_CATALOG, plan_extra_cap

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
                "max_extra_staff": plan_extra_cap(plan, "max_extra_staff"),
                "max_extra_offices": plan_extra_cap(plan, "max_extra_offices"),
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
        ("platform_admin", "0022_sync_white_label_plan_copy"),
    ]

    operations = [
        migrations.AddField(
            model_name="platformplanpackage",
            name="max_extra_staff",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="platformplanpackage",
            name="max_extra_offices",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(sync_extra_caps, noop_reverse),
    ]
