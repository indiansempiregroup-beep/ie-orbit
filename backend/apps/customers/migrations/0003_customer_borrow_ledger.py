# Generated manually for customer borrow ledger.

from decimal import Decimal

import apps.core.db.uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("businesses", "0009_expand_asset_url_fields"),
        ("customers", "0002_mobile_customer_features"),
        ("tenancy", "0004_expand_asset_url_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="CustomerBorrowAccount",
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
                    "balance_due",
                    models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
                ),
                ("currency", models.CharField(blank=True, max_length=3)),
                (
                    "business",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="borrow_accounts",
                        to="businesses.business",
                    ),
                ),
                (
                    "customer",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="borrow_account",
                        to="customers.customer",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)s_set",
                        to="tenancy.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "customer_borrow_accounts",
            },
        ),
        migrations.CreateModel(
            name="CustomerBorrowLedger",
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
                    "entry_type",
                    models.CharField(
                        choices=[
                            ("charge", "Charge"),
                            ("payment", "Payment"),
                            ("adjustment", "Adjustment"),
                        ],
                        max_length=32,
                    ),
                ),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "balance_after",
                    models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
                ),
                ("payment_method", models.CharField(blank=True, max_length=32)),
                ("notes", models.CharField(blank=True, max_length=255)),
                ("order_id", models.UUIDField(blank=True, db_index=True, null=True)),
                ("order_number", models.CharField(blank=True, max_length=32)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                (
                    "account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ledger_entries",
                        to="customers.customerborrowaccount",
                    ),
                ),
                (
                    "business",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="borrow_ledger_entries",
                        to="businesses.business",
                    ),
                ),
                (
                    "customer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="borrow_ledger_entries",
                        to="customers.customer",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)s_set",
                        to="tenancy.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "customer_borrow_ledger",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="customerborrowaccount",
            constraint=models.UniqueConstraint(
                fields=("tenant", "business", "customer"),
                name="uq_borrow_account_tenant_business_customer",
            ),
        ),
    ]
