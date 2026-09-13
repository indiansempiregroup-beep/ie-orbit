from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0016_remove_crmie_invoiceie"),
    ]

    operations = [
        migrations.AddField(
            model_name="businesssettings",
            name="whatsapp_integration",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
