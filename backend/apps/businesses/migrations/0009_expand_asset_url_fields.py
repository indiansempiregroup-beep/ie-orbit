from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0008_alter_whitelabelprofile_tenantmodel_indexes"),
    ]

    operations = [
        migrations.AlterField(
            model_name="business",
            name="logo",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name="business",
            name="banner_image",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name="whitelabelprofile",
            name="logo",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name="whitelabelprofile",
            name="dark_logo",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name="whitelabelprofile",
            name="splash_image",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name="whitelabelprofile",
            name="favicon",
            field=models.CharField(blank=True, max_length=500),
        ),
    ]
