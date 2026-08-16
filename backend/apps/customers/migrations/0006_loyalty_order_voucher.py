from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0005_customer_gst_and_batches"),
    ]

    operations = [
        migrations.AddField(
            model_name="customerloyaltyledger",
            name="order_id",
            field=models.UUIDField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="customerloyaltyledger",
            name="voucher_id",
            field=models.UUIDField(blank=True, db_index=True, null=True),
        ),
    ]
