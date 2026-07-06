from __future__ import annotations

from django.contrib import admin

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


class StaffProfileInline(admin.StackedInline):
    model = StaffProfile
    extra = 0


class EmploymentDetailsInline(admin.StackedInline):
    model = EmploymentDetails
    fk_name = "staff"
    extra = 0


class StaffSkillInline(admin.TabularInline):
    model = StaffSkill
    extra = 0


class StaffServiceAssignmentInline(admin.TabularInline):
    model = StaffServiceAssignment
    extra = 0


class StaffRoleAssignmentInline(admin.TabularInline):
    model = StaffRoleAssignment
    extra = 0


class StaffCertificationInline(admin.TabularInline):
    model = StaffCertification
    extra = 0


class StaffDocumentInline(admin.TabularInline):
    model = StaffDocument
    extra = 0


class StaffNoteInline(admin.TabularInline):
    model = StaffNote
    extra = 0


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = (
        "display_name",
        "business",
        "designation",
        "department",
        "employment_status",
        "created_at",
    )
    list_filter = ("employment_status", "business", "department", "created_at")
    search_fields = (
        "display_name",
        "first_name",
        "last_name",
        "email",
        "phone_number",
        "staff_code",
    )
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "deleted_at",
        "created_by",
        "updated_by",
        "deleted_by",
    )
    inlines = [
        StaffProfileInline,
        EmploymentDetailsInline,
        StaffSkillInline,
        StaffServiceAssignmentInline,
        StaffRoleAssignmentInline,
        StaffCertificationInline,
        StaffDocumentInline,
        StaffNoteInline,
    ]


@admin.register(BusinessRole)
class BusinessRoleAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "role_type", "is_system")
    list_filter = ("role_type", "is_system")
    search_fields = ("name", "code", "description")
