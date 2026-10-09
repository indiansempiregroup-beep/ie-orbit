from __future__ import annotations

from django.db import migrations, models

PLAN_PRICE_USD_CENTS = {
    "appointie-starter": 499,
    "appointie-pro": 999,
    "shopie-starter": 499,
    "shopie-pro": 999,
}
ADDON_STAFF_USD = 299
ADDON_OFFICE_USD = 399
ADDON_PETS_USD = 699
YEARLY_MONTHS = 10


def backfill_prices_minor(apps, schema_editor) -> None:
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    PlatformAddonPricing = apps.get_model("platform_admin", "PlatformAddonPricing")

    for row in PlatformPlanPackage.objects.all():
        monthly_inr = int(row.amount_paise or 0) or None
        yearly_inr = row.yearly_amount_paise
        months = int(getattr(row, "yearly_months_charged", None) or YEARLY_MONTHS)
        if yearly_inr is None and monthly_inr:
            yearly_inr = monthly_inr * months
        usd_monthly = PLAN_PRICE_USD_CENTS.get(str(row.code))
        row.prices_minor = {
            "INR": {
                "monthly": monthly_inr,
                "yearly": int(yearly_inr) if yearly_inr is not None else None,
            },
            "USD": {
                "monthly": usd_monthly,
                "yearly": (usd_monthly * months) if usd_monthly else None,
            },
        }
        row.save(update_fields=["prices_minor", "updated_at"])

    addon = PlatformAddonPricing.objects.filter(key="default").first()
    if addon is not None:
        addon.prices_minor = {
            "INR": {
                "staff": int(addon.staff_price_paise or 19900),
                "office": int(addon.office_price_paise or 29900),
                "pets": int(addon.pets_price_paise or 50000),
            },
            "USD": {
                "staff": ADDON_STAFF_USD,
                "office": ADDON_OFFICE_USD,
                "pets": ADDON_PETS_USD,
            },
        }
        addon.save(update_fields=["prices_minor", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0033_backfill_bg_remove_features"),
    ]

    operations = [
        migrations.AddField(
            model_name="platformplanpackage",
            name="prices_minor",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='SaaS prices by currency, e.g. {"INR":{"monthly":39900,"yearly":399000},"USD":{"monthly":499,"yearly":4990}}.',
            ),
        ),
        migrations.AddField(
            model_name="platformaddonpricing",
            name="prices_minor",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Add-on prices by currency, e.g. {"INR":{"staff":19900,"office":29900,"pets":50000},"USD":{...}}.',
            ),
        ),
        migrations.RunPython(backfill_prices_minor, migrations.RunPython.noop),
    ]
