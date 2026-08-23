from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0003_webhook_dead_letter_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="billingcheckoutsession",
            name="cashfree_order_id",
            field=models.CharField(blank=True, max_length=120, null=True, unique=True),
        ),
        migrations.AddIndex(
            model_name="billingcheckoutsession",
            index=models.Index(fields=["cashfree_order_id"], name="billing_che_cashfre_idx"),
        ),
    ]
