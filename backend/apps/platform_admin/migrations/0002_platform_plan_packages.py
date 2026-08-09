# Generated for PlatformPlanPackage CMS backend.

from __future__ import annotations

import apps.core.db.uuid
from django.db import migrations, models

SHOPIE_BOOKS_FEATURES_STARTER = ["shopie_books_sale"]
SHOPIE_BOOKS_FEATURES_PRO = [
    "shopie_books_sale",
    "shopie_books_purchase",
    "shopie_books_cash",
    "shopie_books_expense",
    "shopie_gst_reports",
]


def seed_plan_packages(apps, schema_editor):
    from apps.billing.constants import PLAN_PRICE_PAISE, YEARLY_PRICE_MULTIPLIER
    from apps.businesses.constants import PRODUCT_PLAN_CATALOG

    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")

    sort_order = 0
    for product_code, plans in PRODUCT_PLAN_CATALOG.items():
        for plan in plans:
            sort_order += 1
            code = str(plan["code"])

            features = list(plan.get("features") or [])
            if product_code == "shopie":
                extra_features = (
                    SHOPIE_BOOKS_FEATURES_PRO if code.endswith("-pro") else SHOPIE_BOOKS_FEATURES_STARTER
                )
                for feature in extra_features:
                    if feature not in features:
                        features.append(feature)

            monthly = PLAN_PRICE_PAISE.get(code)
            yearly = monthly * YEARLY_PRICE_MULTIPLIER if monthly is not None else None

            PlatformPlanPackage.objects.update_or_create(
                code=code,
                defaults={
                    "product_code": product_code,
                    "name": str(plan.get("name", code)),
                    "description": str(plan.get("description", "")),
                    "billing_interval": str(plan.get("billing_interval", "monthly")),
                    "trial_days": int(plan.get("trial_days", 15) or 15),
                    "is_default": bool(plan.get("is_default", False)),
                    "max_staff": int(plan.get("max_staff", 1) or 1),
                    "max_branches": int(plan.get("max_branches", 1) or 1),
                    "bi_features": list(plan.get("bi_features") or []),
                    "features": features,
                    "amount_paise": monthly or 0,
                    "yearly_amount_paise": yearly,
                    "is_active": True,
                    "is_public": True,
                    "sort_order": sort_order,
                    "metadata": {},
                },
            )


def unseed_plan_packages(apps, schema_editor):
    from apps.businesses.constants import PRODUCT_PLAN_CATALOG

    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    codes = [str(plan["code"]) for plans in PRODUCT_PLAN_CATALOG.values() for plan in plans]
    PlatformPlanPackage.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("platform_admin", "0001_initial_platform_admin"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformPlanPackage",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("created_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("updated_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
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
                ("product_code", models.SlugField(db_index=True, max_length=40)),
                ("code", models.SlugField(max_length=60, unique=True)),
                ("name", models.CharField(max_length=160)),
                ("description", models.TextField(blank=True)),
                ("billing_interval", models.CharField(default="monthly", max_length=16)),
                ("trial_days", models.PositiveIntegerField(default=15)),
                ("is_default", models.BooleanField(default=False)),
                ("max_staff", models.PositiveIntegerField(default=1)),
                ("max_branches", models.PositiveIntegerField(default=1)),
                ("bi_features", models.JSONField(blank=True, default=list)),
                ("features", models.JSONField(blank=True, default=list)),
                ("amount_paise", models.PositiveIntegerField(default=0)),
                ("yearly_amount_paise", models.PositiveIntegerField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("is_public", models.BooleanField(default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("metadata", models.JSONField(blank=True, default=dict)),
            ],
            options={
                "db_table": "platform_plan_packages",
                "ordering": ["product_code", "sort_order", "code"],
            },
        ),
        migrations.RunPython(seed_plan_packages, unseed_plan_packages),
    ]
