from __future__ import annotations

import re

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.authentication.models import User


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    remember_me = serializers.BooleanField(default=False)


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
    all_sessions = serializers.BooleanField(default=False)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_new_password(self, value: str) -> str:
        validate_password(value)
        return value


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_new_password(self, value: str) -> str:
        validate_password(value, user=self.context["request"].user)
        return value


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField()


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)


class RegisterBusinessSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone_number = serializers.CharField(required=False, allow_blank=True)
    slug = serializers.SlugField(max_length=120)
    business_name = serializers.CharField(max_length=255)
    display_name = serializers.CharField(required=False, allow_blank=True)
    business_code = serializers.CharField(required=False, allow_blank=True)
    business_type = serializers.CharField(required=False, allow_blank=True)
    industry_category = serializers.CharField(required=False, allow_blank=True)
    business_email = serializers.EmailField(required=False, allow_blank=True)
    primary_contact = serializers.CharField(required=False, allow_blank=True)
    website = serializers.CharField(required=False, allow_blank=True)
    country = serializers.CharField(required=False, allow_blank=True)
    state = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True)
    postal_code = serializers.CharField(required=False, allow_blank=True)
    address_line1 = serializers.CharField(required=False, allow_blank=True)
    timezone = serializers.CharField(required=False, allow_blank=True, default="UTC")
    currency = serializers.CharField(required=False, allow_blank=True, default="USD")
    language = serializers.CharField(required=False, allow_blank=True, default="en")
    selected_product = serializers.CharField(required=False, allow_blank=True)
    primary_color = serializers.CharField(required=False, allow_blank=True)
    secondary_color = serializers.CharField(required=False, allow_blank=True)
    settings = serializers.DictField(required=False)

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def validate_website(self, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            return ""
        if not re.match(r"^https?://", trimmed, re.IGNORECASE):
            trimmed = f"https://{trimmed}"
        serializer = serializers.URLField()
        return serializer.run_validation(trimmed)


class UserProfileSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone_number",
            "profile_photo",
            "language",
            "timezone",
            "notification_preferences",
            "status",
            "email_verified_at",
            "roles",
            "permissions",
        ]
        read_only_fields = [
            "id",
            "email",
            "full_name",
            "status",
            "email_verified_at",
            "roles",
            "permissions",
        ]

    def get_roles(self, user: User) -> list[str]:
        return list(user.user_roles.values_list("role__code", flat=True))

    def get_permissions(self, user: User) -> list[str]:
        return list(
            user.user_roles.filter(role__role_permissions__permission__is_active=True)
            .values_list("role__role_permissions__permission__code", flat=True)
            .distinct()
        )
