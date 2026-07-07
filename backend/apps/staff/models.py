from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel, TenantModel
from apps.staff.validators import validate_tags
from apps.tenancy.managers import TenantAwareManager


class EmploymentStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    ON_LEAVE = "on_leave", "On Leave"
    TERMINATED = "terminated", "Terminated"
    ARCHIVED = "archived", "Archived"


class EmploymentType(models.TextChoices):
    FULL_TIME = "full_time", "Full Time"
    PART_TIME = "part_time", "Part Time"
    CONTRACT = "contract", "Contract"
    INTERN = "intern", "Intern"
    CONSULTANT = "consultant", "Consultant"


class BusinessRoleType(models.TextChoices):
    OWNER = "owner", "Owner"
    MANAGER = "manager", "Manager"
    RECEPTIONIST = "receptionist", "Receptionist"
    STYLIST = "stylist", "Stylist"
    THERAPIST = "therapist", "Therapist"
    TECHNICIAN = "technician", "Technician"
    CONSULTANT = "consultant", "Consultant"
    ASSISTANT = "assistant", "Assistant"
    READ_ONLY = "read_only", "Read Only"
    CUSTOM = "custom", "Custom"


class SkillLevel(models.TextChoices):
    BEGINNER = "beginner", "Beginner"
    INTERMEDIATE = "intermediate", "Intermediate"
    ADVANCED = "advanced", "Advanced"
    EXPERT = "expert", "Expert"


class Staff(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="staff_members",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="staff_profiles",
        null=True,
        blank=True,
    )
    photo = models.ForeignKey(
        "platform_media.Media",
        on_delete=models.SET_NULL,
        related_name="staff_photos",
        null=True,
        blank=True,
    )
    staff_code = models.SlugField(max_length=80)
    first_name = models.CharField(max_length=120)
    last_name = models.CharField(max_length=120, blank=True)
    display_name = models.CharField(max_length=160)
    email = models.EmailField(blank=True, db_index=True)
    phone_number = models.CharField(max_length=32, blank=True, db_index=True)
    designation = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=120, blank=True, db_index=True)
    working_location = models.CharField(max_length=160, blank=True)
    joining_date = models.DateField(null=True, blank=True)
    employment_status = models.CharField(
        max_length=32,
        choices=EmploymentStatus.choices,
        default=EmploymentStatus.ACTIVE,
        db_index=True,
    )
    emergency_contact = models.JSONField(default=dict, blank=True)
    preferences = models.JSONField(default=dict, blank=True)
    tags = models.JSONField(default=list, blank=True, validators=[validate_tags])
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "staff"
        ordering = ["display_name"]
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "employment_status"]),
            models.Index(fields=["tenant", "business", "staff_code"]),
            models.Index(fields=["tenant", "business", "email"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "staff_code"],
                name="uq_staff_tenant_business_code",
            )
        ]

    def __str__(self) -> str:
        return self.display_name


class StaffProfile(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    staff = models.OneToOneField(Staff, on_delete=models.CASCADE, related_name="profile")
    bio = models.TextField(blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=32, blank=True)
    address = models.JSONField(default=dict, blank=True)
    skills_summary = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "staff_profiles"

    def __str__(self) -> str:
        return f"{self.staff.display_name} profile"


class EmploymentDetails(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    staff = models.OneToOneField(Staff, on_delete=models.CASCADE, related_name="employment")
    employment_type = models.CharField(
        max_length=32,
        choices=EmploymentType.choices,
        default=EmploymentType.FULL_TIME,
    )
    supervisor = models.ForeignKey(
        Staff,
        on_delete=models.SET_NULL,
        related_name="direct_reports",
        null=True,
        blank=True,
    )
    contract_start = models.DateField(null=True, blank=True)
    contract_end = models.DateField(null=True, blank=True)
    salary_metadata = models.JSONField(default=dict, blank=True)
    payroll_reference = models.CharField(max_length=120, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "staff_employment_details"

    def __str__(self) -> str:
        return f"{self.staff.display_name} employment"


class BusinessRole(BaseModel):
    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=120)
    role_type = models.CharField(
        max_length=32,
        choices=BusinessRoleType.choices,
        default=BusinessRoleType.CUSTOM,
    )
    description = models.TextField(blank=True)
    permissions = models.JSONField(default=list, blank=True)
    is_system = models.BooleanField(default=True)

    class Meta:
        db_table = "business_roles"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class StaffRoleAssignment(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name="role_assignments")
    role = models.ForeignKey(BusinessRole, on_delete=models.PROTECT, related_name="assignments")
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="staff_role_assignments",
        null=True,
        blank=True,
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "staff_role_assignments"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "staff", "role"],
                name="uq_staff_role_assignment",
            )
        ]

    def __str__(self) -> str:
        return f"{self.staff.display_name} {self.role.name}"


class StaffSkill(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name="skills")
    service = models.ForeignKey(
        "services.Service",
        on_delete=models.CASCADE,
        related_name="staff_skills",
    )
    skill_level = models.CharField(
        max_length=32,
        choices=SkillLevel.choices,
        default=SkillLevel.INTERMEDIATE,
    )
    years_experience = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    certification_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        db_table = "staff_skills"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "staff", "service"],
                name="uq_staff_skill_staff_service",
            )
        ]

    def __str__(self) -> str:
        return f"{self.staff.display_name} {self.service.display_name}"


class StaffServiceAssignment(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name="service_assignments")
    service = models.ForeignKey(
        "services.Service",
        on_delete=models.CASCADE,
        related_name="staff_assignments",
    )
    default_duration_override = models.PositiveIntegerField(null=True, blank=True)
    default_price_override = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    priority = models.PositiveIntegerField(default=0, db_index=True)
    is_active_assignment = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "staff_service_assignments"
        ordering = ["priority", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "staff", "service"],
                name="uq_staff_service_assignment",
            )
        ]

    def __str__(self) -> str:
        return f"{self.staff.display_name} -> {self.service.display_name}"


class StaffCertification(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name="certifications")
    name = models.CharField(max_length=160)
    issuing_authority = models.CharField(max_length=160, blank=True)
    issued_at = models.DateField(null=True, blank=True)
    expires_at = models.DateField(null=True, blank=True)
    document = models.ForeignKey(
        "platform_media.Media",
        on_delete=models.SET_NULL,
        related_name="staff_certificates",
        null=True,
        blank=True,
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "staff_certifications"
        ordering = ["-issued_at", "name"]

    def __str__(self) -> str:
        return f"{self.staff.display_name} {self.name}"


class StaffDocument(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name="documents")
    media = models.ForeignKey(
        "platform_media.Media",
        on_delete=models.PROTECT,
        related_name="staff_documents",
    )
    document_type = models.CharField(max_length=80)
    title = models.CharField(max_length=160)
    expires_at = models.DateField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta(TenantModel.Meta):
        db_table = "staff_documents"
        ordering = ["title"]

    def __str__(self) -> str:
        return self.title


class StaffNote(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name="notes")
    note = models.TextField()
    is_internal = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="staff_notes",
        null=True,
        blank=True,
    )

    class Meta(TenantModel.Meta):
        db_table = "staff_notes"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.staff.display_name} note"


class InvitationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    EXPIRED = "expired", "Expired"
    REVOKED = "revoked", "Revoked"


INVITABLE_PLATFORM_ROLES = frozenset({"manager", "staff"})


class StaffInvitation(TenantModel):
    objects = TenantAwareManager()
    active_objects = TenantAwareManager()

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="staff_invitations",
    )
    email = models.EmailField(db_index=True)
    platform_role_code = models.SlugField(max_length=80)
    token = models.UUIDField(unique=True, db_index=True)
    status = models.CharField(
        max_length=32,
        choices=InvitationStatus.choices,
        default=InvitationStatus.PENDING,
        db_index=True,
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="sent_staff_invitations",
        null=True,
        blank=True,
    )
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    staff = models.ForeignKey(
        Staff,
        on_delete=models.SET_NULL,
        related_name="invitations",
        null=True,
        blank=True,
    )

    class Meta(TenantModel.Meta):
        db_table = "staff_invitations"
        indexes = [
            *TenantModel.Meta.indexes,
            models.Index(fields=["tenant", "business", "status"]),
            models.Index(fields=["tenant", "email", "status"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "business", "email"],
                condition=models.Q(status="pending"),
                name="uq_staff_invitation_pending_email",
            )
        ]

    def __str__(self) -> str:
        return f"{self.email} ({self.status})"
