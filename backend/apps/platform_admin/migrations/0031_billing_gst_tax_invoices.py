import apps.core.db.uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("platform_admin", "0030_plan_package_yearly_months_charged"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformBillingGstSettings",
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
                ("key", models.SlugField(default="default", max_length=20, unique=True)),
                ("legal_name", models.CharField(blank=True, default="", max_length=255)),
                ("gstin", models.CharField(blank=True, default="", max_length=20)),
                ("address_line1", models.CharField(blank=True, default="", max_length=255)),
                ("address_line2", models.CharField(blank=True, default="", max_length=255)),
                ("city", models.CharField(blank=True, default="", max_length=120)),
                ("state_code", models.CharField(blank=True, default="", max_length=2)),
                ("postal_code", models.CharField(blank=True, default="", max_length=16)),
                ("sac_code", models.CharField(blank=True, default="998314", max_length=16)),
                (
                    "gst_percent",
                    models.DecimalField(decimal_places=2, default=18.0, max_digits=5),
                ),
                ("invoice_prefix", models.CharField(blank=True, default="IEO-INV-", max_length=24)),
                ("credit_note_prefix", models.CharField(blank=True, default="IEO-CN-", max_length=24)),
                ("next_invoice_seq", models.PositiveIntegerField(default=1)),
                ("next_credit_note_seq", models.PositiveIntegerField(default=1)),
            ],
            options={
                "db_table": "platform_billing_gst_settings",
            },
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="buyer_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="cgst_paise",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="document_type",
            field=models.CharField(
                choices=[("tax_invoice", "Tax invoice"), ("credit_note", "Credit note")],
                db_index=True,
                default="tax_invoice",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="gst_rate_percent",
            field=models.DecimalField(decimal_places=2, default=18.0, max_digits=5),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="igst_paise",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="is_interstate",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="issued_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="original_invoice",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="credit_notes",
                to="platform_admin.platformledgerinvoice",
            ),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="place_of_supply",
            field=models.CharField(blank=True, default="", max_length=2),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="sac_code",
            field=models.CharField(blank=True, default="998314", max_length=16),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="seller_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="sgst_paise",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="platformledgerinvoice",
            name="taxable_paise",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
