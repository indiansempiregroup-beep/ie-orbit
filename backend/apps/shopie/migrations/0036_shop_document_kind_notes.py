# Generated manually for credit/debit note document kinds

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shopie", "0035_workflow_and_coupon_eligibility"),
    ]

    operations = [
        migrations.AlterField(
            model_name="shopdocumentsharelink",
            name="kind",
            field=models.CharField(
                choices=[
                    ("sale", "Sale invoice"),
                    ("quotation", "Quotation"),
                    ("delivery_challan", "Delivery challan"),
                    ("credit_note", "Credit note"),
                    ("debit_note", "Debit note"),
                ],
                db_index=True,
                max_length=32,
            ),
        ),
    ]
