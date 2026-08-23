from django.db import migrations, models


def enable_instant_for_existing_shops(apps, schema_editor):
    ShopBusinessSettings = apps.get_model("shopie", "ShopBusinessSettings")
    ShopDeliveryZone = apps.get_model("shopie", "ShopDeliveryZone")
    business_ids = ShopBusinessSettings.objects.filter(
        instant_delivery_enabled=True
    ).values_list("business_id", flat=True)
    ShopDeliveryZone.objects.filter(business_id__in=business_ids).update(
        instant_delivery_enabled=True
    )


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0021_godown_address"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopdeliveryzone",
            name="instant_delivery_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(enable_instant_for_existing_shops, migrations.RunPython.noop),
    ]
