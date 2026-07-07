from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenancy", "0003_rename_tenants_slug_f70d36_idx_tenants_slug_899f50_idx_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="tenant",
            name="logo",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name="tenant",
            name="favicon",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name="branding",
            name="logo",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name="branding",
            name="dark_logo",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name="branding",
            name="favicon",
            field=models.CharField(blank=True, max_length=500),
        ),
    ]
