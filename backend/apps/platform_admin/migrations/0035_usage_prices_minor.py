from __future__ import annotations

from django.db import migrations, models


DEFAULT_ASSISTANT_PRICES_MINOR = {
    "INR": {"message": 50, "confirm": 100, "top_ups": [5000, 10000, 25000, 50000]},
    "USD": {"message": 1, "confirm": 2, "top_ups": [500, 1000, 2500, 5000]},
}

DEFAULT_SMART_LOOKUP_PRICES_MINOR = {
    "INR": {"min_charge": 1, "top_ups": [5000, 10000, 25000, 50000]},
    "USD": {"min_charge": 1, "top_ups": [500, 1000, 2500, 5000]},
}


def backfill_prices_minor(apps, schema_editor) -> None:
    Assistant = apps.get_model("platform_admin", "PlatformAssistantSettings")
    Smart = apps.get_model("platform_admin", "PlatformSmartLookupSettings")
    for row in Assistant.objects.all():
        tops = row.suggested_top_up_paise if isinstance(row.suggested_top_up_paise, list) else []
        cleaned = [int(v) for v in tops if int(v) > 0] or list(
            DEFAULT_ASSISTANT_PRICES_MINOR["INR"]["top_ups"]
        )
        row.prices_minor = {
            "INR": {
                "message": int(row.message_price_paise or 50),
                "confirm": int(row.confirm_price_paise or 100),
                "top_ups": cleaned,
            },
            "USD": dict(DEFAULT_ASSISTANT_PRICES_MINOR["USD"]),
        }
        row.save(update_fields=["prices_minor", "updated_at"])
    for row in Smart.objects.all():
        tops = row.suggested_top_up_paise if isinstance(row.suggested_top_up_paise, list) else []
        cleaned = [int(v) for v in tops if int(v) > 0] or list(
            DEFAULT_SMART_LOOKUP_PRICES_MINOR["INR"]["top_ups"]
        )
        row.prices_minor = {
            "INR": {
                "min_charge": int(row.min_charge_paise or 1),
                "top_ups": cleaned,
            },
            "USD": dict(DEFAULT_SMART_LOOKUP_PRICES_MINOR["USD"]),
        }
        row.save(update_fields=["prices_minor", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0034_plan_addon_prices_minor"),
    ]

    operations = [
        migrations.AddField(
            model_name="platformassistantsettings",
            name="prices_minor",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    'Unit prices by SaaS currency, e.g. '
                    '{"INR":{"message":50,"confirm":100,"top_ups":[5000]},'
                    '"USD":{"message":1,"confirm":2,"top_ups":[500]}}.'
                ),
            ),
        ),
        migrations.AddField(
            model_name="platformsmartlookupsettings",
            name="prices_minor",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    'Wallet pricing by SaaS currency, e.g. '
                    '{"INR":{"min_charge":1,"top_ups":[5000]},'
                    '"USD":{"min_charge":1,"top_ups":[500]}}.'
                ),
            ),
        ),
        migrations.RunPython(backfill_prices_minor, migrations.RunPython.noop),
    ]
