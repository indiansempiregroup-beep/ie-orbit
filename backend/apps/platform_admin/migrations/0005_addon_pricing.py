from __future__ import annotations

from django.db import migrations, models

import apps.core.db.uuid


def seed_addon_pricing(apps, schema_editor):
    PlatformAddonPricing = apps.get_model("platform_admin", "PlatformAddonPricing")
    PlatformAddonPricing.objects.get_or_create(
        key="default",
        defaults={
            "staff_price_paise": 19900,
            "office_price_paise": 29900,
            "pets_price_paise": 50000,
        },
    )


def unseed_addon_pricing(apps, schema_editor):
    PlatformAddonPricing = apps.get_model("platform_admin", "PlatformAddonPricing")
    PlatformAddonPricing.objects.filter(key="default").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0004_ops_mobile_function_features"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformAddonPricing",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("created_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("updated_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("version", models.PositiveIntegerField(default=1)),
                (
                    "id",
                    models.UUIDField(
                        default=apps.core.db.uuid.generate_uuid,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("key", models.SlugField(default="default", max_length=20, unique=True)),
                ("staff_price_paise", models.PositiveIntegerField(default=19900)),
                ("office_price_paise", models.PositiveIntegerField(default=29900)),
                ("pets_price_paise", models.PositiveIntegerField(default=50000)),
            ],
            options={
                "db_table": "platform_addon_pricing",
            },
        ),
        migrations.RunPython(seed_addon_pricing, unseed_addon_pricing),
    ]
