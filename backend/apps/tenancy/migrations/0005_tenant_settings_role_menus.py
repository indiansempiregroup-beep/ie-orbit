from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenancy", "0004_expand_asset_url_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenantsettings",
            name="role_menus",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
