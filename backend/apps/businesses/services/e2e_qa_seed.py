from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from apps.authentication.constants import DEFAULT_CUSTOMER_ROLE_CODE, DEFAULT_OWNER_ROLE_CODE
from apps.authentication.models import Role, User, UserStatus
from apps.authentication.services.roles import RoleService
from apps.businesses.models import (
    Business,
    BusinessProductSubscription,
    BusinessProductSubscriptionStatus,
)
from apps.businesses.services.businesses import BusinessService
from apps.customers.models import Customer, CustomerStatus
from apps.staff.models import EmploymentStatus, Staff
from apps.tenancy.models import Organization, Tenant
from apps.tenancy.repositories.tenancy import TenantRepository

DEFAULT_TENANT_SLUG = "e2e-qa"
DEFAULT_BUSINESS_CODE = "main"
STAFF_ROLE_CODE = "staff"
PLATFORM_ADMIN_ROLE_CODE = "platform_admin"


@dataclass(frozen=True)
class E2EQaSeedResult:
    tenant_id: str
    tenant_slug: str
    business_id: str
    business_code: str
    owner_email: str
    staff_email: str
    admin_email: str
    customer_email: str


def _get_or_create_user(*, email: str, first_name: str, last_name: str) -> User:
    normalized = email.strip().lower()
    user = User.objects.filter(email__iexact=normalized).first()
    if user is not None:
        updates: list[str] = []
        if user.status != UserStatus.ACTIVE:
            user.status = UserStatus.ACTIVE
            updates.append("status")
        if not user.email_verified_at:
            user.email_verified_at = timezone.now()
            updates.append("email_verified_at")
        if updates:
            updates.append("updated_at")
            user.save(update_fields=updates)
        return user
    return User.objects.create_user(
        email=normalized,
        password=None,
        status=UserStatus.ACTIVE,
        first_name=first_name,
        last_name=last_name,
        email_verified_at=timezone.now(),
    )


def _assign_role(user: User, role_code: str) -> None:
    if not Role.objects.filter(code=role_code).exists():
        raise ValueError(f"Role {role_code!r} is missing. Run migrations before seeding.")
    RoleService().assign_role(user=user, role_code=role_code, assigned_by=None)


def _ensure_product(tenant: Tenant, business: Business, product_code: str) -> None:
    subscription, _ = BusinessProductSubscription.objects.get_or_create(
        tenant=tenant,
        business=business,
        product_code=product_code,
        defaults={"status": BusinessProductSubscriptionStatus.TRIALING},
    )
    if subscription.status not in {
        BusinessProductSubscriptionStatus.TRIALING,
        BusinessProductSubscriptionStatus.ACTIVE,
    }:
        subscription.status = BusinessProductSubscriptionStatus.TRIALING
        subscription.canceled_at = None
        subscription.save(update_fields=["status", "canceled_at", "updated_at"])


@transaction.atomic
def seed_e2e_qa_tenant(
    *,
    owner_email: str,
    staff_email: str = "",
    admin_email: str = "",
    customer_email: str = "",
    tenant_slug: str = DEFAULT_TENANT_SLUG,
    business_code: str = DEFAULT_BUSINESS_CODE,
) -> E2EQaSeedResult:
    owner_email = owner_email.strip().lower()
    if not owner_email:
        raise ValueError("owner_email is required.")

    owner = _get_or_create_user(email=owner_email, first_name="QA", last_name="Owner")
    _assign_role(owner, DEFAULT_OWNER_ROLE_CODE)

    tenant = Tenant.objects.filter(slug=tenant_slug).first()
    if tenant is None:
        tenant = Tenant.objects.create(
            slug=tenant_slug,
            display_name="E2E QA Workspace",
            owner=owner,
            timezone="Asia/Kolkata",
            currency="INR",
            language="en",
        )
        TenantRepository().ensure_foundation_records(tenant)
    elif tenant.owner_id != owner.id:
        tenant.owner = owner
        tenant.save(update_fields=["owner", "updated_at"])
        TenantRepository().ensure_foundation_records(tenant)
    else:
        TenantRepository().ensure_foundation_records(tenant)

    organization = Organization.objects.filter(tenant=tenant).first()
    if organization is None:
        organization = Organization.objects.create(tenant=tenant, name="E2E QA Workspace")

    business_service = BusinessService()
    business = Business.objects.filter(tenant=tenant, business_code=business_code).first()
    if business is None:
        business = Business(
            tenant=tenant,
            organization=organization,
            business_code=business_code,
            business_name="E2E QA Business",
            display_name="E2E QA Business",
            timezone="Asia/Kolkata",
            currency="INR",
            language="en",
        )
        business.mark_created(actor_id=owner.id)
        business.save()
        business_service.ensure_foundation_records(business)
    else:
        business_service.ensure_foundation_records(business)

    _ensure_product(tenant, business, "appointie")
    _ensure_product(tenant, business, "shopie")
    if business.selected_product != "appointie":
        business.selected_product = "appointie"
        business.save(update_fields=["selected_product", "updated_at"])

    staff_email_norm = staff_email.strip().lower()
    if staff_email_norm:
        staff_user = _get_or_create_user(email=staff_email_norm, first_name="QA", last_name="Staff")
        _assign_role(staff_user, STAFF_ROLE_CODE)
        staff = Staff.objects.filter(
            tenant=tenant, business=business, staff_code="e2e-qa-staff"
        ).first()
        if staff is None:
            Staff.objects.create(
                tenant=tenant,
                business=business,
                user=staff_user,
                staff_code="e2e-qa-staff",
                first_name="QA",
                last_name="Staff",
                display_name="QA Staff",
                email=staff_email_norm,
                employment_status=EmploymentStatus.ACTIVE,
                is_bookable=True,
                is_active=True,
            )
        elif staff.user_id != staff_user.id:
            staff.user = staff_user
            staff.email = staff_email_norm
            staff.save(update_fields=["user", "email", "updated_at"])

    admin_email_norm = admin_email.strip().lower()
    if admin_email_norm:
        admin = _get_or_create_user(email=admin_email_norm, first_name="QA", last_name="Admin")
        _assign_role(admin, PLATFORM_ADMIN_ROLE_CODE)

    customer_email_norm = customer_email.strip().lower()
    if customer_email_norm:
        customer_user = _get_or_create_user(
            email=customer_email_norm, first_name="QA", last_name="Customer"
        )
        _assign_role(customer_user, DEFAULT_CUSTOMER_ROLE_CODE)
        customer = Customer.objects.filter(
            tenant=tenant, business=business, email__iexact=customer_email_norm
        ).first()
        if customer is None:
            Customer.objects.create(
                tenant=tenant,
                business=business,
                customer_code="e2e-qa-customer",
                first_name="QA",
                last_name="Customer",
                display_name="QA Customer",
                email=customer_email_norm,
                status=CustomerStatus.ACTIVE,
            )

    return E2EQaSeedResult(
        tenant_id=str(tenant.id),
        tenant_slug=tenant.slug,
        business_id=str(business.id),
        business_code=business.business_code,
        owner_email=owner.email,
        staff_email=staff_email_norm,
        admin_email=admin_email_norm,
        customer_email=customer_email_norm,
    )
