from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Q
from rest_framework import exceptions

from apps.authentication.constants import DEFAULT_CUSTOMER_ROLE_CODE, DEFAULT_OWNER_ROLE_CODE
from apps.authentication.emails.otp_email import build_login_otp_email
from apps.authentication.models import OtpPurpose, User, UserStatus
from apps.authentication.repositories.users import UserRepository
from apps.authentication.services.authentication import AuthenticationService, LoginResult
from apps.authentication.services.otp import OtpService
from apps.authentication.services.roles import RoleService
from apps.businesses.models import Business
from apps.customers.services.contact import format_contact_phone
from apps.notifications.services.whatsapp_catalog import catalog_by_code
from apps.notifications.services.whatsapp_graph import WhatsAppGraphError, send_template_message
from apps.notifications.services.whatsapp_settings import WhatsAppIntegrationService
from apps.tenancy.models import Tenant

logger = logging.getLogger(__name__)

AUTH_OTP_TEMPLATE_CODE = "auth_otp"
EMAIL_IDENTIFIER_PREFIX = "email:"
PHONE_IDENTIFIER_PREFIX = "phone:"


def _otp_identifier(*, channel: str, value: str) -> str:
    normalized = value.strip().lower()
    if channel == "email":
        return f"{EMAIL_IDENTIFIER_PREFIX}{normalized}"
    if channel in {"whatsapp", "sms"}:
        phone = format_contact_phone(value, e164=True)
        if not phone:
            raise exceptions.ValidationError({"identifier": "Enter a valid mobile number."})
        return f"{PHONE_IDENTIFIER_PREFIX}{phone}"
    raise exceptions.ValidationError({"channel": "Unsupported channel."})


@dataclass(frozen=True)
class OtpCapabilities:
    email_otp: bool
    mobile_otp: bool
    mobile_otp_via_whatsapp: bool
    mobile_otp_via_sms: bool
    whatsapp_status: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "email_otp": self.email_otp,
            "mobile_otp": self.mobile_otp,
            "mobile_otp_via_whatsapp": self.mobile_otp_via_whatsapp,
            "mobile_otp_via_sms": self.mobile_otp_via_sms,
            "whatsapp_status": self.whatsapp_status,
        }


class AuthOtpService:
    def __init__(
        self,
        *,
        otp_service: OtpService | None = None,
        auth_service: AuthenticationService | None = None,
        user_repository: UserRepository | None = None,
    ) -> None:
        self.otp_service = otp_service or OtpService()
        self.auth_service = auth_service or AuthenticationService()
        self.user_repository = user_repository or UserRepository()

    def _resolve_ops_whatsapp_sender_business(self) -> Business | None:
        from apps.platform_admin.models import PlatformAuthSettings

        row = (
            PlatformAuthSettings.objects.select_related("ops_otp_whatsapp_business")
            .filter(key="default")
            .first()
        )
        if row and row.ops_otp_whatsapp_business_id:
            return row.ops_otp_whatsapp_business

        iam = settings.IAM_SETTINGS
        tenant_slug = str(iam.get("OPS_OTP_WHATSAPP_TENANT_SLUG") or "").strip()
        business_code = str(iam.get("OPS_OTP_WHATSAPP_BUSINESS_CODE") or "").strip()
        if not tenant_slug or not business_code:
            return None
        try:
            from apps.api.mobile_helpers import resolve_tenant_business

            _tenant, business = resolve_tenant_business(
                tenant_slug=tenant_slug,
                business_code=business_code,
            )
        except ValueError:
            return None
        return business

    def resolve_business(
        self,
        *,
        tenant_slug: str | None,
        business_code: str | None,
    ) -> Business | None:
        if not tenant_slug or not business_code:
            return None
        from apps.api.mobile_helpers import resolve_tenant_business

        try:
            _tenant, business = resolve_tenant_business(
                tenant_slug=tenant_slug,
                business_code=business_code,
            )
        except ValueError as exc:
            raise exceptions.ValidationError(str(exc)) from exc
        return business

    def capabilities(
        self,
        *,
        client: str,
        tenant_slug: str | None = None,
        business_code: str | None = None,
    ) -> OtpCapabilities:
        business = self.resolve_business(tenant_slug=tenant_slug, business_code=business_code)
        whatsapp_status = "not_configured"
        mobile_whatsapp = False
        sender = business
        if sender is None and client == "ops":
            sender = self._resolve_ops_whatsapp_sender_business()
        if sender is not None:
            wa = WhatsAppIntegrationService()
            settings_row = wa.ensure_settings(tenant=sender.tenant, business=sender)
            raw = wa._raw(settings_row)
            whatsapp_status = wa.connection_status(business=sender, raw=raw)
            mobile_whatsapp = whatsapp_status == "live" and catalog_by_code().get(AUTH_OTP_TEMPLATE_CODE) is not None

        mobile_otp = mobile_whatsapp
        return OtpCapabilities(
            email_otp=True,
            mobile_otp=mobile_otp,
            mobile_otp_via_whatsapp=mobile_whatsapp,
            mobile_otp_via_sms=False,
            whatsapp_status=whatsapp_status,
        )

    def send(
        self,
        *,
        client: str,
        channel: str,
        identifier: str,
        tenant_slug: str | None = None,
        business_code: str | None = None,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict[str, Any]:
        caps = self.capabilities(
            client=client,
            tenant_slug=tenant_slug,
            business_code=business_code,
        )
        if channel == "email":
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", identifier.strip()):
                raise exceptions.ValidationError({"identifier": "Enter a valid email address."})
        elif channel == "whatsapp":
            if not caps.mobile_otp_via_whatsapp:
                raise exceptions.ValidationError(
                    {"channel": "Mobile OTP via WhatsApp is not available for this workspace."}
                )
        else:
            raise exceptions.ValidationError({"channel": "Unsupported channel."})

        otp_id = _otp_identifier(channel=channel, value=identifier)
        delivery = self.otp_service.create_challenge(identifier=otp_id, purpose=OtpPurpose.LOGIN)
        code = delivery.code
        debug: dict[str, Any] = {}

        if channel == "email":
            email = identifier.strip().lower()
            expiry = int(settings.IAM_SETTINGS["OTP_EXPIRY_MINUTES"])
            content = build_login_otp_email(email=email, code=code, expiry_minutes=expiry)
            try:
                send_mail(
                    subject=content.subject,
                    message=content.plain_text,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[email],
                    html_message=content.html,
                    fail_silently=False,
                )
            except Exception:
                logger.exception("Failed to send login OTP to %s", email)
                raise exceptions.ValidationError(
                    {"identifier": "Unable to send sign-in code. Try again shortly."}
                ) from None
        elif channel == "whatsapp":
            business = self.resolve_business(tenant_slug=tenant_slug, business_code=business_code)
            if business is None and client == "ops":
                business = self._resolve_ops_whatsapp_sender_business()
            if business is None:
                raise exceptions.ValidationError(
                    {"channel": "Mobile OTP via WhatsApp is not available for this workspace."}
                )
            entry = catalog_by_code().get(AUTH_OTP_TEMPLATE_CODE)
            if entry is None:
                raise exceptions.ValidationError({"channel": "Auth OTP template is not configured."})
            wa = WhatsAppIntegrationService()
            settings_row = wa.ensure_settings(tenant=business.tenant, business=business)
            raw = wa._raw(settings_row)
            creds = wa.decrypted_credentials(raw)
            phone = format_contact_phone(identifier, e164=True)
            expiry = str(settings.IAM_SETTINGS["OTP_EXPIRY_MINUTES"])
            try:
                send_template_message(
                    phone_number_id=creds["phone_number_id"],
                    token=creds["access_token"],
                    to=phone,
                    template_name=entry.meta_name,
                    language=entry.language,
                    body_values=[code, expiry],
                )
            except WhatsAppGraphError as exc:
                raise exceptions.ValidationError({"identifier": str(exc)}) from exc

        if settings.DEBUG:
            debug["debug_code"] = code

        return {"sent": True, "channel": channel, **debug}

    def verify_and_login(
        self,
        *,
        client: str,
        channel: str,
        identifier: str,
        code: str,
        remember_me: bool,
        tenant_slug: str | None = None,
        business_code: str | None = None,
        create_if_missing: bool = False,
        first_name: str = "",
        last_name: str = "",
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> LoginResult:
        otp_id = _otp_identifier(channel=channel, value=identifier)
        if not self.otp_service.validate(identifier=otp_id, purpose=OtpPurpose.LOGIN, code=code.strip()):
            raise exceptions.ValidationError({"code": "That code is invalid or expired."})

        tenant: Tenant | None = None
        business: Business | None = None
        if client == "customer":
            if not tenant_slug or not business_code:
                raise exceptions.ValidationError(
                    {"tenant_slug": "tenant_slug and business_code are required."}
                )
            from apps.api.mobile_helpers import resolve_tenant_business

            tenant, business = resolve_tenant_business(
                tenant_slug=tenant_slug,
                business_code=business_code,
            )

        user = self._resolve_user(channel=channel, identifier=identifier)
        if user is None:
            if not create_if_missing:
                raise exceptions.ValidationError(
                    {"identifier": "No account found. Create an account or use a different email."}
                )
            if channel != "email":
                raise exceptions.ValidationError(
                    {"identifier": "Sign up with email OTP first, then add your phone in profile."}
                )
            email = identifier.strip().lower()
            role_code = DEFAULT_CUSTOMER_ROLE_CODE if client == "customer" else DEFAULT_OWNER_ROLE_CODE
            user = self.auth_service.register_passwordless(
                email=email,
                first_name=first_name,
                last_name=last_name,
                role_code=role_code,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        elif user.status in {UserStatus.SUSPENDED, UserStatus.ARCHIVED}:
            raise exceptions.AuthenticationFailed(
                "This account is disabled. Contact support if you need access."
            )

        if client == "ops" and not self.auth_service._user_has_ops_workspace(user):
            raise exceptions.ValidationError(
                {"identifier": "This account is not set up for OPS. Accept your invitation or create a business."}
            )

        if channel == "email" and not user.email_verified_at:
            user.mark_email_verified()

        result = self.auth_service.issue_session(
            user=user,
            remember_me=remember_me,
            ip_address=ip_address,
            user_agent=user_agent,
            event_type="otp_login_succeeded",
            tenant=tenant,
            business=business,
        )

        if tenant is not None and business is not None:
            from apps.api.mobile_helpers import ensure_customer_for_user

            ensure_customer_for_user(tenant=tenant, business=business, user=user)

        result_user = RoleService().ensure_superuser_platform_role(user=result.user)
        return LoginResult(user=result_user, tokens=result.tokens, session=result.session)

    def _resolve_user(self, *, channel: str, identifier: str) -> User | None:
        if channel == "email":
            return self.user_repository.get_by_email(identifier.strip().lower())
        phone = format_contact_phone(identifier, e164=True)
        if not phone:
            return None
        return (
            User.objects.filter(deleted_at__isnull=True)
            .filter(Q(phone_number=phone) | Q(phone_number=identifier.strip()))
            .first()
        )
