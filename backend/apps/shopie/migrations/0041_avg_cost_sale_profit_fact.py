# Generated manually for avg_cost + ShopSaleProfitFact

import apps.core.db.uuid
import django.db.models.deletion
from decimal import Decimal
from django.db import migrations, models


def backfill_avg_cost(apps, schema_editor):
    ShopProduct = apps.get_model("shopie", "ShopProduct")
    batch = []
    for product in ShopProduct.objects.all().iterator(chunk_size=500):
        purchase = product.purchase_price or Decimal("0.00")
        if product.avg_cost != purchase:
            product.avg_cost = purchase
            batch.append(product)
        if len(batch) >= 500:
            ShopProduct.objects.bulk_update(batch, ["avg_cost"])
            batch = []
    if batch:
        ShopProduct.objects.bulk_update(batch, ["avg_cost"])


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0019_business_saas_currency"),
        ("shopie", "0040_product_purchase_price"),
        ("tenancy", "0004_expand_asset_url_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="shopproduct",
            name="avg_cost",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
        ),
        migrations.RunPython(backfill_avg_cost, migrations.RunPython.noop),
        migrations.CreateModel(
            name="ShopSaleProfitFact",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("created_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("updated_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_by", models.UUIDField(blank=True, editable=False, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("version", models.PositiveIntegerField(default=1)),
                (
                    "id",
                    models.UUIDField(
                        default=apps.core.db.uuid.generate_uuid,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "fact_kind",
                    models.CharField(
                        choices=[
                            ("sale", "Sale"),
                            ("cancel", "Cancel"),
                            ("return", "Return"),
                        ],
                        db_index=True,
                        max_length=16,
                    ),
                ),
                ("source_id", models.UUIDField(db_index=True)),
                ("sold_at", models.DateTimeField(db_index=True)),
                (
                    "channel",
                    models.CharField(
                        choices=[
                            ("pos", "POS"),
                            ("online_pickup", "Online pickup"),
                            ("online_delivery", "Online delivery"),
                        ],
                        db_index=True,
                        max_length=32,
                    ),
                ),
                ("order_number", models.CharField(blank=True, max_length=32)),
                ("product_name", models.CharField(blank=True, max_length=200)),
                ("sku", models.CharField(blank=True, max_length=64)),
                ("quantity", models.DecimalField(decimal_places=3, default=Decimal("0"), max_digits=12)),
                (
                    "unit_sell_price",
                    models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
                ),
                (
                    "unit_purchase_cost",
                    models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
                ),
                (
                    "line_discount_amount",
                    models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
                ),
                (
                    "bill_discount_share",
                    models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
                ),
                (
                    "gross_sell",
                    models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
                ),
                (
                    "net_revenue",
                    models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
                ),
                ("cogs", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12)),
                (
                    "gross_profit",
                    models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
                ),
                ("currency", models.CharField(blank=True, max_length=3)),
                (
                    "business",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="shop_sale_profit_facts",
                        to="businesses.business",
                    ),
                ),
                (
                    "order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="profit_facts",
                        to="shopie.shoporder",
                    ),
                ),
                (
                    "order_line",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="profit_facts",
                        to="shopie.shoporderline",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="profit_facts",
                        to="shopie.shopproduct",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="%(app_label)s_%(class)s_records",
                        to="tenancy.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "shop_sale_profit_facts",
                "ordering": ["-sold_at", "-created_at"],
                "abstract": False,
                "indexes": [
                    models.Index(fields=["is_active", "deleted_at"], name="shop_sale_p_is_acti_f1a2b3_idx"),
                    models.Index(fields=["created_at"], name="shop_sale_p_created_f1a2b3_idx"),
                    models.Index(fields=["updated_at"], name="shop_sale_p_updated_f1a2b3_idx"),
                    models.Index(
                        fields=["tenant", "is_active", "deleted_at"],
                        name="shop_sale_p_tenant__f1a2b3_idx",
                    ),
                    models.Index(fields=["tenant", "created_at"], name="shop_sale_p_tenant_c_f1a2b3_idx"),
                    models.Index(fields=["tenant", "business", "sold_at"], name="shop_sale_p_t_b_sold_idx"),
                    models.Index(
                        fields=["tenant", "business", "product", "sold_at"],
                        name="shop_sale_p_t_b_prod_idx",
                    ),
                    models.Index(
                        fields=["tenant", "business", "channel", "sold_at"],
                        name="shop_sale_p_t_b_chan_idx",
                    ),
                    models.Index(
                        fields=["tenant", "business", "fact_kind", "sold_at"],
                        name="shop_sale_p_t_b_kind_idx",
                    ),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("tenant", "order_line", "fact_kind", "source_id"),
                        name="uq_shop_sale_profit_fact_line_kind_source",
                    ),
                ],
            },
        ),
    ]
