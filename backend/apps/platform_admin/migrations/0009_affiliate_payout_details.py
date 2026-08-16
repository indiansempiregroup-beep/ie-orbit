from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("platform_admin", "0008_backfill_grow_ads_referral_features"),
    ]

    operations = [
        migrations.AddField(
            model_name="platformaffiliate",
            name="payout_method",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
        migrations.AddField(
            model_name="platformaffiliate",
            name="upi_vpa",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="platformaffiliate",
            name="bank_account_name",
            field=models.CharField(blank=True, default="", max_length=160),
        ),
        migrations.AddField(
            model_name="platformaffiliate",
            name="bank_account_number",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="platformaffiliate",
            name="bank_ifsc",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="platformaffiliate",
            name="payout_notes",
            field=models.TextField(blank=True, default=""),
        ),
    ]
