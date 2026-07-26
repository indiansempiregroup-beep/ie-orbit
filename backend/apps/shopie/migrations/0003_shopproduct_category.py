from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0002_shopie_zones_returns_pets"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopproduct",
            name="category",
            field=models.CharField(
                blank=True,
                choices=[
                    ("food_grocery", "Food & grocery"),
                    ("beverages", "Beverages"),
                    ("snacks", "Snacks & confectionery"),
                    ("dairy", "Dairy"),
                    ("personal_care", "Personal care"),
                    ("household", "Household"),
                    ("pet_food", "Pet food"),
                    ("pet_supplies", "Pet supplies"),
                    ("baby_care", "Baby care"),
                    ("health", "Health & wellness"),
                    ("electronics", "Electronics & accessories"),
                    ("apparel", "Apparel"),
                    ("other", "Other"),
                ],
                db_index=True,
                default="",
                max_length=64,
            ),
        ),
        migrations.AddIndex(
            model_name="shopproduct",
            index=models.Index(fields=["tenant", "business", "category"], name="shop_produc_tenant__catego_idx"),
        ),
    ]
