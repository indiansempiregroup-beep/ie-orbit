from django.db import migrations, models

import apps.businesses.validators


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0020_godown_office_link"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopgodown",
            name="address_line1",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="shopgodown",
            name="address_line2",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="shopgodown",
            name="city",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="shopgodown",
            name="country",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="shopgodown",
            name="latitude",
            field=models.DecimalField(
                blank=True,
                decimal_places=6,
                max_digits=9,
                null=True,
                validators=[apps.businesses.validators.validate_latitude],
            ),
        ),
        migrations.AddField(
            model_name="shopgodown",
            name="longitude",
            field=models.DecimalField(
                blank=True,
                decimal_places=6,
                max_digits=9,
                null=True,
                validators=[apps.businesses.validators.validate_longitude],
            ),
        ),
        migrations.AddField(
            model_name="shopgodown",
            name="phone_number",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name="shopgodown",
            name="postal_code",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name="shopgodown",
            name="state",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
