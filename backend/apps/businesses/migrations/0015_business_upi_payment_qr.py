from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0014_pets_pack_addon"),
    ]

    operations = [
        migrations.AddField(
            model_name="business",
            name="upi_vpa",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="business",
            name="payment_qr_url",
            field=models.CharField(blank=True, max_length=500),
        ),
    ]
