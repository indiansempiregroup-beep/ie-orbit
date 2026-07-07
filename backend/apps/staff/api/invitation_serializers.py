from __future__ import annotations

from rest_framework import serializers

from apps.staff.models import INVITABLE_PLATFORM_ROLES, StaffInvitation


class StaffInvitationCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    platform_role_code = serializers.ChoiceField(choices=sorted(INVITABLE_PLATFORM_ROLES))


class StaffInvitationSerializer(serializers.ModelSerializer):
    invited_by_email = serializers.SerializerMethodField()

    class Meta:
        model = StaffInvitation
        fields = [
            "id",
            "email",
            "platform_role_code",
            "status",
            "expires_at",
            "accepted_at",
            "invited_by_email",
            "created_at",
        ]
        read_only_fields = fields

    def get_invited_by_email(self, invitation: StaffInvitation) -> str | None:
        if invitation.invited_by_id and invitation.invited_by:
            return invitation.invited_by.email
        return None


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    password = serializers.CharField(required=False, allow_blank=True, min_length=8)
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
