from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.businesses.services.entitlements import EntitlementService
from apps.staff.models import (
    BusinessRole,
    BusinessRoleType,
    EmploymentDetails,
    Staff,
    StaffProfile,
    StaffServiceAssignment,
    StaffSkill,
)
from apps.staff.repositories import StaffRepository

logger = logging.getLogger("ie_orbit.staff")


class StaffManagementService:
    def __init__(
        self,
        repository: StaffRepository | None = None,
        entitlements: EntitlementService | None = None,
    ) -> None:
        self.repository = repository or StaffRepository()
        self.entitlements = entitlements or EntitlementService()

    @transaction.atomic
    def create_staff(self, *, data: dict[str, Any], tenant: Any, actor: Any) -> Staff:
        profile_data = data.pop("profile", None)
        employment_data = data.pop("employment", None)
        is_bookable = bool(data.get("is_bookable", True))
        business = data.get("business")
        if business is not None:
            self.entitlements.ensure_can_add_staff(business=business, is_bookable=is_bookable)
        staff = Staff(tenant=tenant, **data)
        if getattr(actor, "is_authenticated", False):
            staff.mark_created(actor_id=actor.id)
        self._validate_business_tenant(staff)
        staff.full_clean()
        staff.save()
        self.ensure_foundation_records(staff)
        if isinstance(profile_data, dict):
            self.update_profile(staff=staff, data=profile_data)
        if isinstance(employment_data, dict):
            self.update_employment(staff=staff, data=employment_data)
        logger.info("Staff created", extra={"staff_id": str(staff.id)})
        return staff

    @transaction.atomic
    def update_staff(self, *, staff: Staff, data: dict[str, Any], actor: Any) -> Staff:
        profile_data = data.pop("profile", None)
        employment_data = data.pop("employment", None)
        becoming_bookable = data.get("is_bookable") is True and not staff.is_bookable
        if becoming_bookable:
            self.entitlements.ensure_can_add_staff(business=staff.business, is_bookable=True)
        for field, value in data.items():
            setattr(staff, field, value)
        if getattr(actor, "is_authenticated", False):
            staff.mark_updated(actor_id=actor.id)
        self._validate_business_tenant(staff)
        staff.full_clean()
        staff.save()
        if isinstance(profile_data, dict):
            self.update_profile(staff=staff, data=profile_data)
        if isinstance(employment_data, dict):
            self.update_employment(staff=staff, data=employment_data)
        logger.info("Staff updated", extra={"staff_id": str(staff.id)})
        return staff

    def ensure_foundation_records(self, staff: Staff) -> None:
        StaffProfile.objects.get_or_create(tenant=staff.tenant, staff=staff)
        EmploymentDetails.objects.get_or_create(tenant=staff.tenant, staff=staff)

    def update_profile(self, *, staff: Staff, data: dict[str, Any]) -> StaffProfile:
        profile, _ = StaffProfile.objects.get_or_create(tenant=staff.tenant, staff=staff)
        for field, value in data.items():
            setattr(profile, field, value)
        profile.full_clean()
        profile.save()
        return profile

    def update_employment(self, *, staff: Staff, data: dict[str, Any]) -> EmploymentDetails:
        employment, _ = EmploymentDetails.objects.get_or_create(tenant=staff.tenant, staff=staff)
        for field, value in data.items():
            setattr(employment, field, value)
        employment.full_clean()
        employment.save()
        return employment

    def assign_skill(self, *, data: dict[str, Any], tenant: Any) -> StaffSkill:
        skill = StaffSkill(tenant=tenant, **data)
        self._validate_staff_service(skill.staff, skill.service)
        skill.full_clean()
        skill.save()
        return skill

    def assign_service(self, *, data: dict[str, Any], tenant: Any) -> StaffServiceAssignment:
        assignment = StaffServiceAssignment(tenant=tenant, **data)
        self._validate_staff_service(assignment.staff, assignment.service)
        assignment.full_clean()
        assignment.save()
        return assignment

    def update_assignment(
        self, *, assignment: StaffServiceAssignment, data: dict[str, Any]
    ) -> StaffServiceAssignment:
        for field, value in data.items():
            setattr(assignment, field, value)
        if assignment.staff_id and assignment.service_id:
            self._validate_staff_service(assignment.staff, assignment.service)
        assignment.full_clean()
        assignment.save()
        return assignment

    def delete_assignment(self, *, assignment: StaffServiceAssignment) -> None:
        assignment.delete()

    def seed_business_roles(self) -> None:
        for role_type, label in BusinessRoleType.choices:
            code = f"business-{role_type}"
            BusinessRole.objects.get_or_create(
                code=code,
                defaults={
                    "name": label,
                    "role_type": role_type,
                    "description": f"Standard business role: {label}.",
                    "permissions": [],
                    "is_system": role_type != BusinessRoleType.CUSTOM,
                },
            )

    def _validate_business_tenant(self, obj: Any) -> None:
        if obj.business.tenant_id != obj.tenant_id:
            raise ValidationError("Business does not belong to the current tenant.")

    def _validate_staff_service(self, staff: Staff, service: Any) -> None:
        if staff.tenant_id != service.tenant_id or staff.business_id != service.business_id:
            raise ValidationError("Staff and service must belong to the same tenant and business.")


from apps.common.utils.business_context import resolve_business_id


class StaffSearchService:
    def __init__(self, repository: StaffRepository | None = None) -> None:
        self.repository = repository or StaffRepository()

    def search(self, *, tenant: Any, user: Any, params: Any, request: Any | None = None):
        tags = [tag.strip().lower() for tag in params.get("tags", "").split(",") if tag.strip()]
        return self.repository.search(
            tenant=tenant,
            user=user,
            query=params.get("q", ""),
            business_id=resolve_business_id(request, params) if request is not None else params.get("business", ""),
            status_value=params.get("status", ""),
            department=params.get("department", ""),
            tags=tags,
        )
