from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0038_platform_gtin_index_names"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopbusinesssettings",
            name="cod_allowed_for_instant_delivery",
            field=models.BooleanField(
                default=True,
                help_text=(
                    "Allow cash on delivery when the customer chooses instant delivery "
                    "(Porter / Shiprocket Quick). Turn off to require prepaid payment."
                ),
            ),
        ),
    ]
