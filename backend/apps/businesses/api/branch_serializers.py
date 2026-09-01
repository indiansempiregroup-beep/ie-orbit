from __future__ import annotations

from rest_framework import serializers

from apps.businesses.models import Branch
from apps.common.api.fields import CoordinateField


class BranchSerializer(serializers.ModelSerializer):
    latitude = CoordinateField()
    longitude = CoordinateField()

    class Meta:
        model = Branch
        fields = [
            "id",
            "business",
            "branch_code",
            "branch_name",
            "display_name",
            "is_primary",
            "email",
            "phone_number",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "country",
            "postal_code",
            "latitude",
            "longitude",
            "timezone",
            "status",
            "created_at",
            "updated_at",
            "is_active",
        ]
        # branch_code is generated from branch_name in BranchService.create_branch.
        read_only_fields = ["id", "business", "branch_code", "created_at", "updated_at", "is_active"]
