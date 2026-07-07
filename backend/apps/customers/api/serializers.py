from __future__ import annotations

from rest_framework import serializers

from apps.customers.models import (
    Customer,
    CustomerAddress,
    CustomerCommunicationPreference,
    CustomerExportJob,
    CustomerImportJob,
    CustomerMergeRecord,
    CustomerNote,
    CustomerPreferences,
    CustomerProfile,
    CustomerTag,
)


class CustomerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerProfile
        fields = [
            "photo",
            "occupation",
            "company",
            "about",
            "preferences_summary",
            "internal_reference",
            "metadata",
        ]


class CustomerPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerPreferences
        fields = [
            "timezone",
            "currency",
            "language",
            "booking_preferences",
            "communication_preferences",
            "marketing_opt_in",
            "accessibility_preferences",
            "metadata",
        ]


class CustomerAddressSerializer(serializers.ModelSerializer):
    full_address = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = CustomerAddress
        fields = [
            "id",
            "address_type",
            "line1",
            "line2",
            "city",
            "state",
            "country",
            "postal_code",
            "latitude",
            "longitude",
            "is_default",
            "full_address",
        ]
        read_only_fields = ["id"]


class CustomerCommunicationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerCommunicationPreference
        fields = ["id", "channel", "is_enabled", "opt_in_at", "opt_out_at", "metadata"]
        read_only_fields = ["id"]


class CustomerNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerNote
        fields = ["id", "note", "is_internal", "created_by", "created_at"]
        read_only_fields = ["id", "created_by", "created_at"]


class CustomerSerializer(serializers.ModelSerializer):
    profile = CustomerProfileSerializer(required=False)
    preferences = CustomerPreferencesSerializer(required=False)
    default_address = CustomerAddressSerializer(required=False, write_only=True)
    addresses = CustomerAddressSerializer(many=True, read_only=True)
    communication_channels = CustomerCommunicationPreferenceSerializer(many=True, read_only=True)
    notes = CustomerNoteSerializer(many=True, read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "tenant",
            "business",
            "customer_code",
            "first_name",
            "last_name",
            "display_name",
            "email",
            "phone_number",
            "alternate_phone",
            "date_of_birth",
            "gender",
            "source",
            "status",
            "tags",
            "merged_into",
            "archived_at",
            "metadata",
            "profile",
            "preferences",
            "default_address",
            "addresses",
            "communication_channels",
            "notes",
            "created_at",
            "updated_at",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "tenant",
            "merged_into",
            "archived_at",
            "addresses",
            "communication_channels",
            "notes",
            "created_at",
            "updated_at",
            "is_active",
        ]

    def validate_tags(self, value: list[str]) -> list[str]:
        return [tag.strip().lower() for tag in value if tag.strip()]

    def create(self, validated_data: dict[str, object]) -> Customer:
        raise NotImplementedError("Customer creation is handled by the service layer.")


class CustomerTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerTag
        fields = ["id", "business", "name", "color", "description", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class CustomerImportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerImportJob
        fields = [
            "id",
            "business",
            "source_media",
            "status",
            "total_rows",
            "processed_rows",
            "failed_rows",
            "mapping",
            "result",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "processed_rows",
            "failed_rows",
            "result",
            "created_at",
            "updated_at",
        ]


class CustomerExportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerExportJob
        fields = [
            "id",
            "business",
            "result_media",
            "status",
            "filters",
            "result",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "result_media", "status", "result", "created_at", "updated_at"]


class CustomerMergeSerializer(serializers.Serializer):
    target_customer = serializers.UUIDField()
    reason = serializers.CharField(required=False, allow_blank=True)


class CustomerMergeRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerMergeRecord
        fields = [
            "id",
            "business",
            "source_customer",
            "target_customer",
            "merged_by",
            "reason",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class BulkCustomerActionSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
