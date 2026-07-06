from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import TenantModel
from apps.tenancy.managers import TenantAwareManager


class NotificationChannel(models.TextChoices):
    IN_APP = "in_app", "In App"
    EMAIL = "email", "Email"
    FIREBASE_PUSH = "firebase_push", "Firebase Push"
    SMS = "sms", "SMS"
    WHATSAPP = "whatsapp", "WhatsApp"


class NotificationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"
    READ = "read", "Read"


class NotificationTemplate(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="notification_templates",
    )
    code = models.SlugField(max_length=120)
    name = models.CharField(max_length=160)
    subject = models.CharField(max_length=255, blank=True)
    body = models.TextField()
    channel = models.CharField(max_length=32, choices=NotificationChannel.choices)
    locale = models.CharField(max_length=16, default="en")
    is_active = models.BooleanField(default=True)
    variables = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "notification_templates"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "code", "locale"],
                name="uq_notification_template_tenant_business_code_locale",
            )
        ]

    def __str__(self) -> str:
        return self.name


class NotificationPreference(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preference_records",
    )
    channel = models.CharField(max_length=32, choices=NotificationChannel.choices)
    is_enabled = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "notification_preferences"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "user", "channel"],
                name="uq_notification_preference_tenant_user_channel",
            )
        ]


class Notification(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="notifications",
        null=True,
        blank=True,
    )
    booking = models.ForeignKey(
        "bookings.Booking",
        on_delete=models.SET_NULL,
        related_name="notifications",
        null=True,
        blank=True,
    )
    template = models.ForeignKey(
        NotificationTemplate,
        on_delete=models.SET_NULL,
        related_name="notifications",
        null=True,
        blank=True,
    )
    channel = models.CharField(max_length=32, choices=NotificationChannel.choices)
    subject = models.CharField(max_length=255, blank=True)
    body = models.TextField()
    status = models.CharField(
        max_length=32,
        choices=NotificationStatus.choices,
        default=NotificationStatus.PENDING,
        db_index=True,
    )
    external_id = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "notifications"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.subject or self.body[:80]


class NotificationQueue(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    notification = models.ForeignKey(
        Notification,
        on_delete=models.CASCADE,
        related_name="queue_entries",
    )
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        db_table = "notification_queue"


class NotificationLog(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    notification = models.ForeignKey(
        Notification,
        on_delete=models.CASCADE,
        related_name="logs",
    )
    provider = models.CharField(max_length=80, blank=True)
    response_code = models.CharField(max_length=80, blank=True)
    response_body = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "notification_logs"


class NotificationHistory(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    notification = models.ForeignKey(
        Notification,
        on_delete=models.CASCADE,
        related_name="history",
    )
    event_type = models.CharField(max_length=120)
    payload = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "notification_history"
