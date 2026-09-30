# Extend default trial from 15 to 45 days on plan packages.

from __future__ import annotations

from django.db import migrations, models


def sync_trial_days(apps, schema_editor):
    from apps.businesses.constants import DEFAULT_TRIAL_DAYS, PRODUCT_PLAN_CATALOG

    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")

    for _product_code, plans in PRODUCT_PLAN_CATALOG.items():
        for plan in plans:
            code = str(plan["code"])
            trial_days = int(plan.get("trial_days", DEFAULT_TRIAL_DAYS) or DEFAULT_TRIAL_DAYS)
            PlatformPlanPackage.objects.filter(code=code).update(trial_days=trial_days)

    # Catch any other catalog packages still on the old default.
    PlatformPlanPackage.objects.filter(trial_days=15).update(trial_days=DEFAULT_TRIAL_DAYS)


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0028_assistant_wallet"),
    ]

    operations = [
        migrations.AlterField(
            model_name="platformplanpackage",
            name="trial_days",
            field=models.PositiveIntegerField(default=45),
        ),
        migrations.RunPython(sync_trial_days, noop_reverse),
    ]
