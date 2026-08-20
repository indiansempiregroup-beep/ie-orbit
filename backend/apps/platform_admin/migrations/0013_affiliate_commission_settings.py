from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("platform_admin", "0012_affiliate_ledger_indexes"),
    ]

    operations = [
        migrations.AddField(
            model_name="platformaffiliate",
            name="commission_trigger",
            field=models.CharField(
                choices=[
                    ("first_payment", "First installment"),
                    ("every_payment", "Every installment"),
                    ("none", "Manual only"),
                ],
                db_index=True,
                default="first_payment",
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name="platformaffiliate",
            name="commission_type",
            field=models.CharField(
                choices=[("flat", "Fixed amount"), ("percent", "Percentage of payment")],
                default="flat",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="platformaffiliate",
            name="commission_percent",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=6),
        ),
    ]
