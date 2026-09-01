# Generated manually for multi-service booking line items

import apps.core.db.uuid
import django.db.models.deletion
from decimal import Decimal
from django.db import migrations, models


def backfill_booking_line_items(apps, schema_editor):
    Booking = apps.get_model("bookings", "Booking")
    BookingLineItem = apps.get_model("bookings", "BookingLineItem")
    for booking in Booking.objects.all().iterator():
        if BookingLineItem.objects.filter(booking_id=booking.id).exists():
            continue
        BookingLineItem.objects.create(
            tenant_id=booking.tenant_id,
            booking_id=booking.id,
            service_id=booking.service_id,
            staff_id=booking.staff_id,
            start_at=booking.start_at,
            end_at=booking.end_at,
            duration_minutes=booking.duration_minutes,
            buffer_before_minutes=booking.buffer_before_minutes,
            buffer_after_minutes=booking.buffer_after_minutes,
            sort_order=0,
            price_snapshot=Decimal("0.00"),
            created_by=booking.created_by,
            updated_by=booking.updated_by,
            is_active=booking.is_active,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("bookings", "0004_grow_ads_referrals_slots_affiliates"),
        ("tenancy", "0004_expand_asset_url_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="BookingLineItem",
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
                ("service_id", models.UUIDField(db_index=True)),
                ("staff_id", models.UUIDField(blank=True, db_index=True, null=True)),
                ("start_at", models.DateTimeField(db_index=True)),
                ("end_at", models.DateTimeField(db_index=True)),
                ("duration_minutes", models.PositiveIntegerField()),
                ("buffer_before_minutes", models.PositiveIntegerField(default=0)),
                ("buffer_after_minutes", models.PositiveIntegerField(default=0)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "price_snapshot",
                    models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
                ),
                ("variant_id", models.UUIDField(blank=True, null=True)),
                (
                    "booking",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="line_items",
                        to="bookings.booking",
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
                "db_table": "booking_line_items",
                "ordering": ["sort_order", "start_at"],
                "abstract": False,
            },
        ),
        migrations.AddIndex(
            model_name="bookinglineitem",
            index=models.Index(
                fields=["is_active", "deleted_at"], name="booking_lin_is_acti_4f2c11_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="bookinglineitem",
            index=models.Index(fields=["created_at"], name="booking_lin_created_8e9f22_idx"),
        ),
        migrations.AddIndex(
            model_name="bookinglineitem",
            index=models.Index(fields=["updated_at"], name="booking_lin_updated_1a3b44_idx"),
        ),
        migrations.AddIndex(
            model_name="bookinglineitem",
            index=models.Index(
                fields=["tenant", "is_active", "deleted_at"],
                name="booking_lin_tenant__5c6d77_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="bookinglineitem",
            index=models.Index(
                fields=["tenant", "created_at"], name="booking_lin_tenant__7e8f99_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="bookinglineitem",
            index=models.Index(
                fields=["tenant", "booking", "sort_order"], name="booking_lin_tenant__aa11bb_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="bookinglineitem",
            index=models.Index(
                fields=["tenant", "staff_id", "start_at", "end_at"],
                name="booking_lin_tenant__cc22dd_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="bookinglineitem",
            index=models.Index(
                fields=["tenant", "service_id", "start_at"], name="booking_lin_tenant__ee33ff_idx"
            ),
        ),
        migrations.RunPython(backfill_booking_line_items, migrations.RunPython.noop),
    ]
