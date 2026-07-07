from __future__ import annotations

from rest_framework import serializers

from apps.authentication.models import Permission, Role, User


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["id", "code", "name", "description", "is_system"]


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "code", "name", "description", "resource", "action", "is_system"]


class MemberRoleSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()


class TenantMemberSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    full_name = serializers.CharField()
    roles = MemberRoleSerializer(many=True)


class AssignRoleSerializer(serializers.Serializer):
    role_code = serializers.SlugField()
