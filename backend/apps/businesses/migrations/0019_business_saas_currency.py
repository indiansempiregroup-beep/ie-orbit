from __future__ import annotations

from django.db import migrations, models


def _is_india(country: str) -> bool:
    normalized = " ".join((country or "").strip().lower().split())
    tokens = {"in", "ind", "india", "bharat"}
    if normalized in tokens:
        return True
    parts = {part.strip(".,") for part in normalized.replace("/", " ").replace("-", " ").split() if part}
    return bool(parts & tokens)


def backfill_saas_currency(apps, schema_editor) -> None:
    Business = apps.get_model("businesses", "Business")
    for business in Business.objects.all().only("id", "country", "saas_currency"):
        currency = "INR" if _is_india(str(business.country or "")) else "USD"
        if business.saas_currency != currency:
            business.saas_currency = currency
            business.save(update_fields=["saas_currency"])


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0018_business_billing_gst_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="business",
            name="saas_currency",
            field=models.CharField(
                default="INR",
                db_index=True,
                help_text="Orbit subscription currency: INR for India, USD for all other countries.",
                max_length=3,
            ),
        ),
        migrations.RunPython(backfill_saas_currency, migrations.RunPython.noop),
    ]
