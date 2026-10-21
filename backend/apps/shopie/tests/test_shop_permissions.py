from types import SimpleNamespace

import pytest

from apps.authentication.models import Permission, Role, RolePermission, User, UserRole, UserStatus
from apps.shopie.api.permissions import ShopAccessPermission
from apps.tenancy.models import Tenant


@pytest.mark.django_db
def test_staff_can_create_shop_document_share_link():
    """Staff can open an invoice view. Roles are global and have no tenant field."""
    owner = User.objects.create_user(
        email="shop-perm-owner@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    tenant = Tenant.objects.create(slug="shop-perm", display_name="Rupali Sirsat", owner=owner)
    staff = User.objects.create_user(
        email="shop-perm-staff@example.com",
        password="ValidPass123",
        status=UserStatus.ACTIVE,
    )
    role = Role.objects.filter(code="staff").first() or Role.objects.create(
        code="staff", name="Staff", is_system=True
    )
    permission = Permission.objects.filter(code="booking:write").first()
    if permission is None:
        permission = Permission.objects.create(
            code="booking:write",
            name="Write bookings",
            resource="booking",
            action="write",
            is_system=True,
        )
    RolePermission.objects.get_or_create(role=role, permission=permission)
    UserRole.objects.create(user=staff, role=role)

    request = SimpleNamespace(user=staff, method="POST", current_tenant=tenant)
    assert ShopAccessPermission().has_permission(request, None) is True
