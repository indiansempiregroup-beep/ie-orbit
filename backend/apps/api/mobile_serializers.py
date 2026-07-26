from __future__ import annotations

from rest_framework import serializers


class MobileDiscoverQuerySerializer(serializers.Serializer):
    tenant_slug = serializers.SlugField()
    business_code = serializers.SlugField()


class MobileBootstrapQuerySerializer(serializers.Serializer):
    flavor_key = serializers.SlugField(required=False)
    app_slug = serializers.SlugField(required=False)
    tenant_slug = serializers.SlugField(required=False)
    business_code = serializers.SlugField(required=False)

    def validate(self, attrs: dict) -> dict:
        if attrs.get("flavor_key") or attrs.get("app_slug"):
            return attrs
        if attrs.get("tenant_slug") and attrs.get("business_code"):
            return attrs
        raise serializers.ValidationError(
            "Provide flavor_key, app_slug, or both tenant_slug and business_code."
        )


class MobileScopedQuerySerializer(serializers.Serializer):
    tenant_slug = serializers.SlugField()
    business_code = serializers.SlugField()


class MobileAvailabilityQuerySerializer(serializers.Serializer):
    tenant_slug = serializers.SlugField()
    business_code = serializers.SlugField()
    date = serializers.DateField()
    duration_minutes = serializers.IntegerField(min_value=1, default=30)
    interval_minutes = serializers.IntegerField(min_value=1, default=15)
    buffer_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    staff_id = serializers.UUIDField(required=False, allow_null=True)
    service_id = serializers.UUIDField(required=False, allow_null=True)


class MobileStaffQuerySerializer(MobileScopedQuerySerializer):
    service_id = serializers.UUIDField(required=False, allow_null=True)


class MobileBookingRequestSerializer(serializers.Serializer):
    tenant_slug = serializers.SlugField()
    business_code = serializers.SlugField()
    service_id = serializers.UUIDField()
    branch_id = serializers.UUIDField(required=False, allow_null=True)
    staff_id = serializers.UUIDField(required=False, allow_null=True)
    start_at = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField(min_value=1)
    customer_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    phone_number = serializers.CharField(max_length=32, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    payment_mode = serializers.ChoiceField(
        choices=[("pay_at_venue", "Pay at venue")],
        required=False,
        default="pay_at_venue",
    )
    points_to_redeem = serializers.IntegerField(min_value=1, required=False)


class MobileLoyaltyQuoteSerializer(serializers.Serializer):
    tenant_slug = serializers.SlugField()
    business_code = serializers.SlugField()
    service_id = serializers.UUIDField()
    points_to_redeem = serializers.IntegerField(min_value=1)


class MobileBookingRescheduleSerializer(serializers.Serializer):
    tenant_slug = serializers.SlugField()
    business_code = serializers.SlugField()
    start_at = serializers.DateTimeField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class MobileBookingCancelSerializer(serializers.Serializer):
    tenant_slug = serializers.SlugField()
    business_code = serializers.SlugField()
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class MobileNotificationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    subject = serializers.CharField()
    body = serializers.CharField()
    channel = serializers.CharField()
    status = serializers.CharField()
    is_read = serializers.BooleanField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    booking_id = serializers.UUIDField(allow_null=True)
    notification_type = serializers.CharField()


class MobileBookingListQuerySerializer(MobileScopedQuerySerializer):
    upcoming = serializers.BooleanField(required=False, default=None, allow_null=True)
    status = serializers.CharField(required=False, allow_blank=True)


class MobileBookingReviewSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    rating = serializers.IntegerField()
    comment = serializers.CharField(allow_blank=True, required=False)
    created_at = serializers.DateTimeField()


class MobileBookingSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    booking_number = serializers.CharField()
    status = serializers.CharField()
    service_id = serializers.UUIDField()
    service_name = serializers.CharField()
    staff_id = serializers.UUIDField(allow_null=True)
    staff_name = serializers.CharField(allow_blank=True)
    appointment_date = serializers.DateField()
    start_at = serializers.DateTimeField()
    end_at = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField()
    notes = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()
    review = MobileBookingReviewSerializer(allow_null=True, required=False)


class MobileCustomerRegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone_number = serializers.CharField(required=False, allow_blank=True, max_length=32)

    def validate_password(self, value: str) -> str:
        from django.contrib.auth.password_validation import validate_password

        validate_password(value)
        return value


class MobileCustomerAddressSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    line1 = serializers.CharField(required=False, allow_blank=True)
    full_address = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True)
    state = serializers.CharField(required=False, allow_blank=True)
    country = serializers.CharField(required=False, allow_blank=True)
    postal_code = serializers.CharField(required=False, allow_blank=True)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)


class MobileCustomerProfileSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    display_name = serializers.CharField()
    email = serializers.EmailField(allow_blank=True)
    phone_number = serializers.CharField(allow_blank=True)
    profile_photo = serializers.CharField(allow_blank=True, required=False)
    address = MobileCustomerAddressSerializer(allow_null=True)


class MobileCustomerProfileUpdateSerializer(serializers.Serializer):
    full_address = serializers.CharField(required=False, allow_blank=True)
    # Accept GPS floats (often >6 dp) then quantize for CustomerAddress DecimalFields.
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)

    @staticmethod
    def _quantize_coordinate(value: float, *, minimum: float, maximum: float, label: str):
        from decimal import Decimal, ROUND_HALF_UP

        if value < minimum or value > maximum:
            raise serializers.ValidationError(f"{label} must be between {minimum} and {maximum}.")
        # str(value) avoids float→Decimal binary artifacts that break DecimalField(decimal_places=6).
        return Decimal(str(value)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)

    def validate_latitude(self, value: float | None):
        if value is None:
            return None
        return self._quantize_coordinate(float(value), minimum=-90, maximum=90, label="Latitude")

    def validate_longitude(self, value: float | None):
        if value is None:
            return None
        return self._quantize_coordinate(float(value), minimum=-180, maximum=180, label="Longitude")


class MobileReviewCreateSerializer(serializers.Serializer):
    tenant_slug = serializers.SlugField()
    business_code = serializers.SlugField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class MobileDeviceRegisterSerializer(serializers.Serializer):
    tenant_slug = serializers.SlugField()
    business_code = serializers.SlugField()
    expo_push_token = serializers.CharField(max_length=255)
    platform = serializers.CharField(required=False, allow_blank=True, max_length=32)
    app_flavor = serializers.CharField(required=False, allow_blank=True, max_length=120)


class MobileDeviceUnregisterSerializer(serializers.Serializer):
    tenant_slug = serializers.SlugField()
    business_code = serializers.SlugField()
    expo_push_token = serializers.CharField(max_length=255)
