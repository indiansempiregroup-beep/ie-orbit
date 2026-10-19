from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0043_shop_business_settings_return_days"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopreturn",
            name="return_method",
            field=models.CharField(
                choices=[
                    ("in_store", "In store"),
                    ("dropoff", "Customer drop-off"),
                    ("reverse_pickup", "Reverse pickup"),
                ],
                db_index=True,
                default="in_store",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="shopreturn",
            name="received_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="shopreturn",
            name="pickup_arranged_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="shopreturn",
            name="pickup_notes",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="shopreturn",
            name="pickup_tracking_number",
            field=models.CharField(blank=True, max_length=128),
        ),
    ]
