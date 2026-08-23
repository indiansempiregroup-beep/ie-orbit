from django.db import migrations


def _rewrite(apps, *, door_first: bool) -> None:
    """Reorder stored delivery addresses, rewriting only exact matches against a saved address."""
    ShopOrder = apps.get_model("shopie", "ShopOrder")
    CustomerAddress = apps.get_model("customers", "CustomerAddress")

    orders = list(
        ShopOrder.objects.filter(fulfillment_mode="delivery", customer__isnull=False)
        .exclude(delivery_address="")
        .values_list("id", "customer_id", "delivery_address")
    )
    if not orders:
        return

    rewrites: dict[tuple[object, str], str] = {}
    saved = (
        CustomerAddress.objects.filter(customer_id__in={row[1] for row in orders})
        .exclude(line2="")
        .values_list("customer_id", "line1", "line2")
    )
    for customer_id, line1, line2 in saved:
        street = str(line1 or "").strip()
        door = str(line2 or "").strip()
        if not street or not door:
            continue
        stored, wanted = (
            (f"{street}, {door}", f"{door}, {street}")
            if door_first
            else (f"{door}, {street}", f"{street}, {door}")
        )
        rewrites[(customer_id, stored)] = wanted

    updates = []
    for order_id, customer_id, address in orders:
        wanted = rewrites.get((customer_id, str(address or "").strip()))
        if wanted:
            updates.append(ShopOrder(id=order_id, delivery_address=wanted))
    if updates:
        ShopOrder.objects.bulk_update(updates, ["delivery_address"], batch_size=500)


def door_detail_first(apps, schema_editor):
    _rewrite(apps, door_first=True)


def street_first(apps, schema_editor):
    _rewrite(apps, door_first=False)


class Migration(migrations.Migration):
    dependencies = [
        ("shopie", "0022_delivery_zone_instant_delivery"),
        ("customers", "0006_loyalty_order_voucher"),
    ]

    operations = [
        migrations.RunPython(door_detail_first, street_first),
    ]
