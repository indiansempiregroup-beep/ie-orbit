from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0017_businesssettings_whatsapp_integration"),
    ]

    operations = [
        migrations.AddField(
            model_name="business",
            name="billing_legal_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="business",
            name="billing_state_code",
            field=models.CharField(
                blank=True,
                help_text="GST place-of-supply state code (e.g. 27 for Maharashtra).",
                max_length=2,
            ),
        ),
    ]
