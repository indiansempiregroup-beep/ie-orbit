from __future__ import annotations

from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


class UserStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    PENDING_VERIFICATION = "pending_verification", "Pending Verification"
    LOCKED = "locked", "Locked"
    SUSPENDED = "suspended", "Suspended"
    ARCHIVED = "archived", "Archived"


class UserManager(BaseUserManager):
    def create_user(self, email: str, password: str | None = None, **extra_fields: object) -> User:
        if not email:
            raise ValueError("Email address is required.")
        normalized_email = self.normalize_email(email).lower()
        user = self.model(email=normalized_email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(
        self, email: str, password: str | None = None, **extra_fields: object
    ) -> User:
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("status", UserStatus.ACTIVE)
        extra_fields.setdefault("email_verified_at", timezone.now())

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email=email, password=password, **extra_fields)


class User(BaseModel, AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone_number = models.CharField(max_length=32, blank=True)
    profile_photo = models.URLField(blank=True)
    language = models.CharField(max_length=16, default="en")
    timezone = models.CharField(max_length=64, default="UTC")
    notification_preferences = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=32,
        choices=UserStatus.choices,
        default=UserStatus.PENDING_VERIFICATION,
        db_index=True,
    )
    email_verified_at = models.DateTimeField(null=True, blank=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    last_login_user_agent = models.TextField(blank=True)
    failed_login_count = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        db_table = "users"
        indexes = [
            models.Index(fields=["email", "status"]),
            models.Index(fields=["is_active", "deleted_at"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return self.email

    @property
    def full_name(self) -> str:
        return " ".join(part for part in [self.first_name, self.last_name] if part).strip()

    @property
    def is_locked(self) -> bool:
        return bool(self.locked_until and self.locked_until > timezone.now())

    def mark_email_verified(self) -> None:
        self.email_verified_at = timezone.now()
        if self.status == UserStatus.PENDING_VERIFICATION:
            self.status = UserStatus.ACTIVE
        self.save(update_fields=["email_verified_at", "status", "updated_at"])


class Role(BaseModel):
    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=True)

    class Meta:
        db_table = "roles"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Permission(BaseModel):
    code = models.CharField(max_length=120, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    resource = models.CharField(max_length=120)
    action = models.CharField(max_length=80)
    is_system = models.BooleanField(default=True)

    class Meta:
        db_table = "permissions"
        ordering = ["resource", "action"]

    def __str__(self) -> str:
        return self.code


class RolePermission(BaseModel):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(
        Permission,
        on_delete=models.CASCADE,
        related_name="role_permissions",
    )

    class Meta:
        db_table = "role_permissions"
        constraints = [
            models.UniqueConstraint(
                fields=["role", "permission"],
                name="uq_role_permission_role_permission",
            )
        ]


class UserRole(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="user_roles"
    )
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="user_roles")
    assigned_at = models.DateTimeField(default=timezone.now)
    assigned_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "user_roles"
        constraints = [
            models.UniqueConstraint(fields=["user", "role"], name="uq_user_role_user_role")
        ]


class UserSession(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sessions"
    )
    refresh_jti = models.CharField(max_length=255, unique=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    remember_me = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=120, blank=True)

    class Meta:
        db_table = "user_sessions"
        indexes = [
            models.Index(fields=["user", "revoked_at"]),
            models.Index(fields=["refresh_jti"]),
        ]

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    def revoke(self, *, reason: str = "logout") -> None:
        self.revoked_at = timezone.now()
        self.revoked_reason = reason
        self.save(update_fields=["revoked_at", "revoked_reason", "updated_at"])


class RefreshTokenRecord(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="refresh_tokens",
    )
    session = models.ForeignKey(
        UserSession, on_delete=models.CASCADE, related_name="refresh_tokens"
    )
    jti = models.CharField(max_length=255, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    replaced_by_jti = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "refresh_tokens"
        indexes = [models.Index(fields=["user", "revoked_at"])]

    def revoke(self, *, replaced_by_jti: str = "") -> None:
        self.revoked_at = timezone.now()
        self.replaced_by_jti = replaced_by_jti
        self.save(update_fields=["revoked_at", "replaced_by_jti", "updated_at"])


class PasswordResetToken(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    token_hash = models.CharField(max_length=128, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "password_reset_tokens"

    @property
    def is_usable(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()


class EmailVerificationToken(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_verification_tokens",
    )
    token_hash = models.CharField(max_length=128, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "email_verification_tokens"

    @property
    def is_usable(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()


class OtpPurpose(models.TextChoices):
    LOGIN = "login", "Login"
    PASSWORD_RESET = "password_reset", "Password Reset"
    EMAIL_VERIFICATION = "email_verification", "Email Verification"


class OtpChallenge(BaseModel):
    identifier = models.CharField(max_length=255, db_index=True)
    purpose = models.CharField(max_length=40, choices=OtpPurpose.choices)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField(default=5)
    verified_at = models.DateTimeField(null=True, blank=True)
    provider = models.CharField(max_length=80, default="mock")

    class Meta:
        db_table = "otp_challenges"
        indexes = [models.Index(fields=["identifier", "purpose", "expires_at"])]

    @property
    def is_usable(self) -> bool:
        return (
            self.verified_at is None
            and self.expires_at > timezone.now()
            and self.attempts < self.max_attempts
        )


class PasswordHistory(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_history",
    )
    password_hash = models.CharField(max_length=255)

    class Meta:
        db_table = "password_history"
        ordering = ["-created_at"]


class SecurityAuditEvent(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="security_audit_events",
    )
    event_type = models.CharField(max_length=120, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "security_audit_events"
        indexes = [
            models.Index(fields=["event_type", "created_at"]),
            models.Index(fields=["user", "created_at"]),
        ]


password_policy_validator = RegexValidator(
    regex=r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$",
    message="Password must be at least 10 characters and include upper, lower, and digit.",
)


def default_expiry(minutes: int) -> datetime:
    return timezone.now() + timedelta(minutes=minutes)
