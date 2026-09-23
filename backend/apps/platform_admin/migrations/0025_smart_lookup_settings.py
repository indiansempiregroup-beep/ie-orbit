from __future__ import annotations

from decimal import Decimal

from django.db import migrations, models

import apps.core.db.uuid


def seed_smart_lookup_settings(apps, schema_editor):
    PlatformSmartLookupSettings = apps.get_model("platform_admin", "PlatformSmartLookupSettings")
    PlatformSmartLookupSettings.objects.get_or_create(
        key="default",
        defaults={
            "enabled": True,
            "usd_to_inr": Decimal("85.00"),
            "markup_bps": 0,
            "min_charge_paise": 1,
            "input_usd_per_million": Decimal("0.10"),
            "output_usd_per_million": Decimal("0.40"),
            "suggested_top_up_paise": [5000, 10000, 25000, 50000],
        },
    )


def unseed_smart_lookup_settings(apps, schema_editor):
    PlatformSmartLookupSettings = apps.get_model("platform_admin", "PlatformSmartLookupSettings")
    PlatformSmartLookupSettings.objects.filter(key="default").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0024_mart_starter_orders"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformSmartLookupSettings",
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
                (
                    "enabled",
                    models.BooleanField(
                        default=True,
                        help_text="Master switch. When off, businesses cannot use Smart lookup pack-photo fill.",
                    ),
                ),
                (
                    "usd_to_inr",
                    models.DecimalField(
                        decimal_places=4,
                        default=Decimal("85.0000"),
                        help_text="FX used to convert Gemini USD usage into INR wallet debit.",
                        max_digits=10,
                    ),
                ),
                (
                    "markup_bps",
                    models.PositiveIntegerField(
                        default=0,
                        help_text="Extra charge in basis points on top of model cost (100 = 1%). 0 = pass-through.",
                    ),
                ),
                (
                    "min_charge_paise",
                    models.PositiveIntegerField(
                        default=1,
                        help_text="Minimum wallet debit when a paid lookup runs (paise).",
                    ),
                ),
                (
                    "input_usd_per_million",
                    models.DecimalField(
                        decimal_places=6,
                        default=Decimal("0.100000"),
                        help_text="Gemini input token price USD per 1M tokens.",
                        max_digits=12,
                    ),
                ),
                (
                    "output_usd_per_million",
                    models.DecimalField(
                        decimal_places=6,
                        default=Decimal("0.400000"),
                        help_text="Gemini output token price USD per 1M tokens.",
                        max_digits=12,
                    ),
                ),
                (
                    "suggested_top_up_paise",
                    models.JSONField(
                        blank=True,
                        default=list,
                        help_text="Suggested wallet top-up amounts in paise shown to business owners.",
                    ),
                ),
            ],
            options={
                "db_table": "platform_smart_lookup_settings",
            },
        ),
        migrations.RunPython(seed_smart_lookup_settings, unseed_smart_lookup_settings),
    ]
