# Adds ops-mobile function entitlements to existing plan packages so admin can
# enable/disable them without taking features away from current tenants.

from __future__ import annotations

from django.db import migrations

APPOINTIE_FUNCTION_FEATURES = [
    "appointie_bookings",
    "appointie_calendar",
    "appointie_customers",
    "appointie_reviews",
    "appointie_services",
    "appointie_staff",
]

SHOPIE_FUNCTION_FEATURES = [
    "shopie_pos",
    "shopie_products",
    "shopie_orders",
    "shopie_returns",
    "shopie_delivery_zones",
    "shopie_loyalty",
    "shopie_books_sale",
    "shopie_books_purchase",
    "shopie_books_cash",
    "shopie_books_expense",
    "shopie_books_quotations",
    "shopie_books_notes",
    "shopie_books_stock",
    "shopie_books_parties",
    "shopie_books_sale_order",
    "shopie_books_purchase_order",
    "shopie_books_challan",
    "shopie_books_godowns",
    "shopie_books_cheques",
    "shopie_books_loans",
    "shopie_books_job_work",
    "shopie_gst_reports",
    "shopie_einvoice",
    "shopie_eway",
    "shopie_grow_whatsapp",
    "shopie_grow_poster",
    "shopie_grow_google",
    "shopie_grow_sync",
    "shopie_grow_utilities",
]


def add_function_features(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.all():
        extras: list[str] = []
        if package.product_code == "appointie":
            extras = list(APPOINTIE_FUNCTION_FEATURES)
        elif package.product_code == "shopie":
            extras = list(SHOPIE_FUNCTION_FEATURES)
        if not extras:
            continue
        features = list(package.features or [])
        changed = False
        for feature in extras:
            if feature not in features:
                features.append(feature)
                changed = True
        if changed:
            package.features = features
            package.save(update_fields=["features"])


def noop_reverse(apps, schema_editor):
    # Keep newly granted keys; unchecking in admin is the supported rollback.
    return


class Migration(migrations.Migration):

    dependencies = [
        ("platform_admin", "0003_shopie_einvoice_eway_features"),
    ]

    operations = [
        migrations.RunPython(add_function_features, noop_reverse),
    ]
