from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import TenantModel
from apps.tenancy.managers import TenantAwareManager


class WorkflowStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    ACTIVE = "active", "Active"
    PAUSED = "paused", "Paused"


class WorkflowCreatedVia(models.TextChoices):
    MANUAL = "manual", "Manual"
    GEMINI = "gemini", "Gemini"
    TEMPLATE = "template", "Template"


class WorkflowRunStatus(models.TextChoices):
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"
    SKIPPED = "skipped", "Skipped"


class WorkflowDefinition(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="workflow_definitions",
    )
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    product_code = models.CharField(max_length=32, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=WorkflowStatus.choices,
        default=WorkflowStatus.DRAFT,
        db_index=True,
    )
    trigger = models.JSONField(default=dict, blank=True)
    conditions = models.JSONField(default=list, blank=True)
    actions = models.JSONField(default=list, blank=True)
    created_via = models.CharField(
        max_length=16,
        choices=WorkflowCreatedVia.choices,
        default=WorkflowCreatedVia.MANUAL,
    )
    source_prompt = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workflow_definitions",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "workflow_definitions"
        ordering = ["-updated_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["tenant", "business", "product_code"]),
        ]

    def __str__(self) -> str:
        return self.name


class WorkflowRun(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="workflow_runs",
    )
    definition = models.ForeignKey(
        WorkflowDefinition,
        on_delete=models.CASCADE,
        related_name="runs",
    )
    trigger_key = models.CharField(max_length=80, db_index=True)
    subject_type = models.CharField(max_length=40, blank=True)
    subject_id = models.CharField(max_length=64, blank=True)
    status = models.CharField(
        max_length=16,
        choices=WorkflowRunStatus.choices,
        default=WorkflowRunStatus.SUCCEEDED,
        db_index=True,
    )
    idempotency_key = models.CharField(max_length=191, blank=True, db_index=True)
    context = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        db_table = "workflow_runs"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "created_at"]),
            models.Index(fields=["tenant", "definition", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "idempotency_key"],
                condition=models.Q(deleted_at__isnull=True)
                & ~models.Q(idempotency_key=""),
                name="uq_workflow_run_idempotency",
            ),
        ]


class WorkflowUsage(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="workflow_usages",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workflow_usages",
    )
    model = models.CharField(max_length=80, blank=True)
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    source_prompt = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "workflow_usages"
        ordering = ["-created_at"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "created_at"]),
        ]
