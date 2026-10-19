from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0042_sale_profit_fact_tax_amount_paid"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopbusinesssettings",
            name="return_days",
            field=models.PositiveIntegerField(
                default=0,
                help_text=(
                    "Days after purchase/delivery within which POS and online returns are "
                    "accepted. 0 means no time limit."
                ),
            ),
        ),
    ]
