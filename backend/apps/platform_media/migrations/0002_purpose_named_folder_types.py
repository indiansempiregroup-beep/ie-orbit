from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("platform_media", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="mediafolder",
            name="folder_type",
            field=models.CharField(
                choices=[
                    ("branding", "Branding"),
                    ("products", "Products"),
                    ("services", "Services"),
                    ("pets", "Pets"),
                    ("staff", "Staff"),
                    ("customers", "Customers"),
                    ("documents", "Documents"),
                    ("temp", "Temp"),
                    ("archive", "Archive"),
                    ("business", "Business"),
                ],
                db_index=True,
                default="branding",
                max_length=32,
            ),
        ),
    ]
