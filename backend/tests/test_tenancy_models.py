from apps.tenancy.models import Tenant, TenantStatus


def test_tenant_defaults():
    tenant = Tenant(display_name="Demo Salon", slug="demo-salon")

    assert tenant.status == TenantStatus.ACTIVE
    assert tenant.timezone == "UTC"
    assert tenant.currency == "USD"
    assert tenant.language == "en"
