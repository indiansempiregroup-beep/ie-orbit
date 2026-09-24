from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import TenantModel
from apps.tenancy.managers import TenantAwareManager


class AssistantMessageRole(models.TextChoices):
    USER = "user", "User"
    ASSISTANT = "assistant", "Assistant"
    SYSTEM = "system", "System"


class AssistantProposedActionStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    CONFIRMED = "confirmed", "Confirmed"
    CANCELLED = "cancelled", "Cancelled"
    FAILED = "failed", "Failed"


class AssistantThread(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="assistant_threads",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assistant_threads",
    )
    title = models.CharField(max_length=160, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "assistant_threads"
        ordering = ["-updated_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "updated_at"]),
        ]

    def __str__(self) -> str:
        return self.title or str(self.id)


class AssistantMessage(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    thread = models.ForeignKey(
        AssistantThread,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="assistant_messages",
    )
    role = models.CharField(max_length=16, choices=AssistantMessageRole.choices)
    content = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "assistant_messages"
        ordering = ["created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "thread", "created_at"]),
        ]


class AssistantProposedAction(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    thread = models.ForeignKey(
        AssistantThread,
        on_delete=models.CASCADE,
        related_name="proposed_actions",
    )
    message = models.ForeignKey(
        AssistantMessage,
        on_delete=models.CASCADE,
        related_name="proposed_actions",
        null=True,
        blank=True,
    )
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="assistant_proposed_actions",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assistant_proposed_actions",
    )
    action_type = models.CharField(max_length=80, db_index=True)
    summary = models.CharField(max_length=255)
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=16,
        choices=AssistantProposedActionStatus.choices,
        default=AssistantProposedActionStatus.PENDING,
        db_index=True,
    )
    result = models.JSONField(default=dict, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "assistant_proposed_actions"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
        ]


class AssistantUsageDaily(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="assistant_usage_daily",
    )
    usage_date = models.DateField(db_index=True)
    message_count = models.PositiveIntegerField(default=0)
    confirm_count = models.PositiveIntegerField(default=0)

    class Meta(TenantModel.Meta):
        db_table = "assistant_usage_daily"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "usage_date"],
                name="uq_assistant_usage_daily_business_date",
            )
        ]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "usage_date"]),
        ]


class AssistantWallet(TenantModel):
    """Prepaid INR wallet for Business Assistant overage after free daily limits."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.OneToOneField(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="assistant_wallet",
    )
    balance_paise = models.IntegerField(default=0)

    class Meta(TenantModel.Meta):
        db_table = "assistant_wallets"

    def __str__(self) -> str:
        return f"{self.business_id} {self.balance_paise}p"


class AssistantWalletLedger(TenantModel):
    """Append-only ledger: top-ups (negative charged_paise) and message/confirm debits."""

    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="assistant_wallet_ledger",
    )
    source = models.CharField(max_length=64, blank=True, db_index=True)
    charged_paise = models.IntegerField(default=0)
    balance_after_paise = models.IntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "assistant_wallet_ledger"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.source} {self.charged_paise}p"
