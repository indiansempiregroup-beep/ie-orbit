from __future__ import annotations

from rest_framework import serializers

from apps.businesses.models import (
    Business,
    BusinessMedia,
    BusinessProfile,
    BusinessSettings,
)


class BusinessProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessProfile
        fields = [
            "mission",
            "vision",
            "about",
            "working_days",
            "opening_time",
            "closing_time",
            "break_hours",
            "emergency_contact",
            "booking_lead_time",
            "booking_window",
            "cancellation_policy",
            "rescheduling_policy",
            "social_media_links",
            "seo_metadata",
        ]


class BusinessSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessSettings
        fields = [
            "booking_settings",
            "appointment_duration_defaults",
            "buffer_time",
            "business_hours",
            "holiday_handling",
            "time_slot_interval",
            "notification_preferences",
            "invoice_preferences",
            "localization",
            "theme_overrides",
        ]


class BusinessMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessMedia
        fields = [
            "id",
            "media_type",
            "title",
            "file_url",
            "storage_backend",
            "mime_type",
            "file_size",
            "sort_order",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BusinessSerializer(serializers.ModelSerializer):
    profile = BusinessProfileSerializer(required=False)
    settings = BusinessSettingsSerializer(required=False)
    media = BusinessMediaSerializer(many=True, read_only=True)

    class Meta:
        model = Business
        fields = [
            "id",
            "tenant",
            "organization",
            "business_code",
            "business_name",
            "display_name",
            "business_type",
            "industry_category",
            "description",
            "logo",
            "banner_image",
            "primary_contact",
            "secondary_contact",
            "email",
            "website",
            "address_line1",
            "address_line2",
            "country",
            "state",
            "city",
            "postal_code",
            "latitude",
            "longitude",
            "timezone",
            "currency",
            "language",
            "gst_tax_number",
            "registration_number",
            "status",
            "verification_status",
            "tags",
            "profile",
            "settings",
            "media",
            "created_at",
            "updated_at",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "tenant",
            "organization",
            "media",
            "created_at",
            "updated_at",
            "is_active",
        ]

    def validate_tags(self, value: list[str]) -> list[str]:
        return [tag.strip().lower() for tag in value if tag.strip()]

    def create(self, validated_data: dict[str, object]) -> Business:
        raise NotImplementedError("Business creation is handled by the service layer.")

    def update(self, instance: Business, validated_data: dict[str, object]) -> Business:
        profile_data = validated_data.pop("profile", None)
        settings_data = validated_data.pop("settings", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.full_clean()
        instance.save()
        if isinstance(profile_data, dict):
            self._update_profile(instance, profile_data)
        if isinstance(settings_data, dict):
            self._update_settings(instance, settings_data)
        return instance

    def _update_profile(self, business: Business, data: dict[str, object]) -> None:
        profile = business.profile
        for field, value in data.items():
            setattr(profile, field, value)
        profile.full_clean()
        profile.save()

    def _update_settings(self, business: Business, data: dict[str, object]) -> None:
        settings = business.settings
        for field, value in data.items():
            setattr(settings, field, value)
        settings.full_clean()
        settings.save()
