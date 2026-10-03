from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0006_rename_booking_lin_is_acti_4f2c11_idx_booking_lin_is_acti_6c029b_idx_and_more"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="booking",
            options={"ordering": ["-created_at"]},
        ),
    ]
