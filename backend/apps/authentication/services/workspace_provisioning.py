from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.authentication.api.serializers import UserProfileSerializer
from apps.authentication.services.authentication import AuthenticationService, TokenPair
from apps.businesses.api.serializers import BusinessSerializer
from apps.businesses.services import BusinessService
from apps.tenancy.api.serializers import TenantSerializer, TenantSettingsSerializer
from apps.tenancy.models import Tenant
from apps.tenancy.repositories import TenantRepository
from apps.tenancy.services import TenantService


@dataclass(frozen=True)
class WorkspaceProvisionResult:
    user: Any
    tokens: TokenPair
    tenant: Tenant
    business: Any


class WorkspaceProvisioningService:
    def __init__(
        self,
        *,
        auth_service: AuthenticationService | None = None,
        tenant_service: TenantService | None = None,
        business_service: BusinessService | None = None,
        tenant_repository: TenantRepository | None = None,
    ) -> None:
        self.auth_service = auth_service or AuthenticationService()
        self.tenant_service = tenant_service or TenantService()
        self.business_service = business_service or BusinessService()
        self.tenant_repository = tenant_repository or TenantRepository()

    @transaction.atomic
    def provision(
        self,
        *,
        data: dict[str, Any],
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> WorkspaceProvisionResult:
        slug = str(data["slug"]).strip().lower()
        if Tenant.objects.filter(slug=slug).exists():
            raise ValidationError({"slug": "This workspace code is already taken."})

        affiliate_code = str(data.get("affiliate_code") or "").strip()

        user = self.auth_service.register(
            email=data["email"],
            password=data["password"],
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", ""),
            ip_address=ip_address,
            user_agent=user_agent,
        )

        tenant_data = {
            "slug": slug,
            "display_name": data.get("display_name") or data["business_name"],
            "legal_name": data.get("legal_name") or data["business_name"],
            "timezone": data.get("timezone", "UTC"),
            "currency": data.get("currency", "USD"),
            "language": data.get("language", "en"),
            "country": data.get("country", ""),
            "state": data.get("state", ""),
            "city": data.get("city", ""),
            "primary_color": data.get("primary_color") or "#0F6CBD",
            "secondary_color": data.get("secondary_color") or "#111827",
        }
        tenant = self.tenant_service.create_tenant(data=tenant_data, actor=user)
        organization = self.tenant_repository.default_organization(tenant)

        business_settings = data.get("settings") or {}
        business = self.business_service.create_business(
            tenant=tenant,
            organization=organization,
            actor=user,
            data={
                "business_code": data.get("business_code") or slug,
                "business_name": data["business_name"],
                "display_name": data.get("display_name") or data["business_name"],
                "business_type": data.get("business_type", "service-business"),
                "industry_category": data.get("industry_category", ""),
                "email": data.get("business_email", ""),
                "currency": data.get("currency", tenant.currency),
                "timezone": data.get("timezone", tenant.timezone),
                "language": data.get("language", tenant.language),
                "country": data.get("country", ""),
                "state": data.get("state", ""),
                "city": data.get("city", ""),
                "postal_code": data.get("postal_code", ""),
                "address_line1": data.get("address_line1", ""),
                "primary_contact": data.get("primary_contact", ""),
                "website": data.get("website", ""),
                "selected_product": data.get("selected_product", ""),
                "selected_products": data.get("selected_products") or [],
                "plan_code": data.get("plan_code") or None,
                "plan_codes": data.get("plan_codes") or {},
                "settings": business_settings,
            },
        )

        tenant_settings = self.tenant_repository.tenant_settings(tenant)
        settings_serializer = TenantSettingsSerializer(
            tenant_settings,
            data={"product_code": data.get("selected_product", "")},
            partial=True,
        )
        settings_serializer.is_valid(raise_exception=True)
        settings_serializer.save()

        if data.get("phone_number"):
            user.phone_number = data["phone_number"]
            user.save(update_fields=["phone_number", "updated_at"])

        if affiliate_code:
            from apps.platform_admin.affiliate_service import AffiliateService

            AffiliateService().attribute_signup(
                referred_tenant=tenant,
                code=affiliate_code,
            )

        login_result = self.auth_service.login(
            email=data["email"],
            password=data["password"],
            remember_me=True,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return WorkspaceProvisionResult(
            user=login_result.user,
            tokens=login_result.tokens,
            tenant=tenant,
            business=business,
        )

    def as_response_payload(self, result: WorkspaceProvisionResult) -> dict[str, Any]:
        return {
            "access": result.tokens.access,
            "refresh": result.tokens.refresh,
            "token_type": result.tokens.token_type,
            "expires_in": result.tokens.expires_in,
            "user": UserProfileSerializer(result.user).data,
            "tenant": TenantSerializer(result.tenant).data,
            "business": BusinessSerializer(result.business).data,
        }
