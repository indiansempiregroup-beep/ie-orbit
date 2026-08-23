from django.db import migrations

NEW_FEATURE = "shopie_instant_delivery"


def add_feature(apps, schema_editor):
    PlatformPlanPackage = apps.get_model("platform_admin", "PlatformPlanPackage")
    for package in PlatformPlanPackage.objects.filter(product_code="shopie"):
        features = list(package.features or [])
        if "shopie_orders" not in features:
            continue
        if NEW_FEATURE not in features:
            features.append(NEW_FEATURE)
            package.features = features
            package.save(update_fields=["features"])


class Migration(migrations.Migration):

    dependencies = [
        ("platform_admin", "0013_affiliate_commission_settings"),
    ]

    operations = [
        migrations.RunPython(add_feature, migrations.RunPython.noop),
    ]
