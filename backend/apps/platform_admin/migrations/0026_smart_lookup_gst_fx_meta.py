from __future__ import annotations

from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0025_smart_lookup_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="platformsmartlookupsettings",
            name="gst_percent",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("18.00"),
                help_text="GST % applied after USD→INR conversion to approximate Cloud Billing tax.",
                max_digits=5,
            ),
        ),
        migrations.AddField(
            model_name="platformsmartlookupsettings",
            name="usd_to_inr_fetched_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When usd_to_inr was last auto-fetched.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="platformsmartlookupsettings",
            name="usd_to_inr_source",
            field=models.CharField(
                blank=True,
                default="",
                help_text="manual | frankfurter | …",
                max_length=40,
            ),
        ),
    ]
