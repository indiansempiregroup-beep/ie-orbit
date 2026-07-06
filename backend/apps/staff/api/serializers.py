from __future__ import annotations

from rest_framework import serializers

from apps.staff.models import (
    BusinessRole,
    EmploymentDetails,
    Staff,
    StaffCertification,
    StaffDocument,
    StaffNote,
    StaffProfile,
    StaffRoleAssignment,
    StaffServiceAssignment,
    StaffSkill,
)


class StaffProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffProfile
        fields = [
            "bio",
            "date_of_birth",
            "gender",
            "address",
            "skills_summary",
            "notes",
            "metadata",
        ]


class EmploymentDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmploymentDetails
        fields = [
            "employment_type",
            "supervisor",
            "contract_start",
            "contract_end",
            "salary_metadata",
            "payroll_reference",
            "metadata",
        ]


class BusinessRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessRole
        fields = ["id", "code", "name", "role_type", "description", "permissions", "is_system"]
        read_only_fields = ["id"]


class StaffRoleAssignmentSerializer(serializers.ModelSerializer):
    role_detail = BusinessRoleSerializer(source="role", read_only=True)

    class Meta:
        model = StaffRoleAssignment
        fields = ["id", "staff", "role", "role_detail", "assigned_by", "metadata", "created_at"]
        read_only_fields = ["id", "role_detail", "assigned_by", "created_at"]


class StaffSkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffSkill
        fields = [
            "id",
            "tenant",
            "staff",
            "service",
            "skill_level",
            "years_experience",
            "certification_date",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "tenant", "created_at", "updated_at"]


class StaffServiceAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffServiceAssignment
        fields = [
            "id",
            "tenant",
            "staff",
            "service",
            "default_duration_override",
            "default_price_override",
            "priority",
            "is_active_assignment",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "tenant", "created_at", "updated_at"]


class StaffCertificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffCertification
        fields = [
            "id",
            "name",
            "issuing_authority",
            "issued_at",
            "expires_at",
            "document",
            "metadata",
        ]
        read_only_fields = ["id"]


class StaffDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffDocument
        fields = ["id", "media", "document_type", "title", "expires_at", "metadata"]
        read_only_fields = ["id"]


class StaffNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffNote
        fields = ["id", "note", "is_internal", "created_by", "created_at"]
        read_only_fields = ["id", "created_by", "created_at"]


class StaffSerializer(serializers.ModelSerializer):
    profile = StaffProfileSerializer(required=False)
    employment = EmploymentDetailsSerializer(required=False)
    skills = StaffSkillSerializer(many=True, read_only=True)
    service_assignments = StaffServiceAssignmentSerializer(many=True, read_only=True)
    role_assignments = StaffRoleAssignmentSerializer(many=True, read_only=True)
    certifications = StaffCertificationSerializer(many=True, read_only=True)
    documents = StaffDocumentSerializer(many=True, read_only=True)
    notes = StaffNoteSerializer(many=True, read_only=True)

    class Meta:
        model = Staff
        fields = [
            "id",
            "tenant",
            "business",
            "user",
            "photo",
            "staff_code",
            "first_name",
            "last_name",
            "display_name",
            "email",
            "phone_number",
            "designation",
            "department",
            "working_location",
            "joining_date",
            "employment_status",
            "emergency_contact",
            "preferences",
            "tags",
            "metadata",
            "profile",
            "employment",
            "skills",
            "service_assignments",
            "role_assignments",
            "certifications",
            "documents",
            "notes",
            "created_at",
            "updated_at",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "tenant",
            "skills",
            "service_assignments",
            "role_assignments",
            "certifications",
            "documents",
            "notes",
            "created_at",
            "updated_at",
            "is_active",
        ]

    def validate_tags(self, value: list[str]) -> list[str]:
        return [tag.strip().lower() for tag in value if tag.strip()]

    def create(self, validated_data: dict[str, object]) -> Staff:
        raise NotImplementedError("Staff creation is handled by the service layer.")
