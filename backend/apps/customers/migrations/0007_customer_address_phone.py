from __future__ import annotations

from django.db import migrations, models


def backfill_address_phones(apps, schema_editor):
    CustomerAddress = apps.get_model("customers", "CustomerAddress")
    Customer = apps.get_model("customers", "Customer")
    for address in CustomerAddress.objects.filter(phone_number="").iterator():
        customer = Customer.objects.filter(id=address.customer_id).only("phone_number", "alternate_phone").first()
        if customer is None:
            continue
        phone = (customer.phone_number or customer.alternate_phone or "").strip()
        if not phone:
            continue
        address.phone_number = phone
        address.save(update_fields=["phone_number"])


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0006_loyalty_order_voucher"),
    ]

    operations = [
        migrations.AddField(
            model_name="customeraddress",
            name="phone_number",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.RunPython(backfill_address_phones, migrations.RunPython.noop),
    ]
