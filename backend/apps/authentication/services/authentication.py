from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import exceptions
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.constants import (
    DEFAULT_CUSTOMER_ROLE_CODE,
    DEFAULT_OWNER_ROLE_CODE,
    GOOGLE_SOCIAL_PROVIDER,
)
from apps.authentication.models import (
    RefreshTokenRecord,
    SocialAccount,
    User,
    UserSession,
    UserStatus,
)
from apps.authentication.repositories.users import UserRepository
from apps.authentication.services.audit import SecurityAuditService
from apps.authentication.services.google import (
    GoogleAccountNotRegistered,
    GoogleIdentity,
    verify_google_id_token,
)
from apps.authentication.services.roles import RoleService
from apps.authentication.services.verification import EmailVerificationService


@dataclass(frozen=True)
class TokenPair:
    access: str
    refresh: str
    token_type: str
    expires_in: int


@dataclass(frozen=True)
class LoginResult:
    user: User
    tokens: TokenPair
    session: UserSession


class AuthenticationService:
    def __init__(
        self,
        user_repository: UserRepository | None = None,
        audit_service: SecurityAuditService | None = None,
    ) -> None:
        self.user_repository = user_repository or UserRepository()
        self.audit_service = audit_service or SecurityAuditService()

    def login(
        self,
        *,
        email: str,
        password: str,
        remember_me: bool,
        ip_address: str | None,
        user_agent: str,
    ) -> LoginResult:
        user = self.user_repository.get_active_by_email(email)
        if not user or user.is_locked:
            self.audit_service.record(
                event_type="login_failed",
                ip_address=ip_address,
                user_agent=user_agent,
                metadata={"email": email, "reason": "not_found_or_locked"},
            )
            raise exceptions.AuthenticationFailed(
                "That email or password doesn't look right. Please try again."
            )

        authenticated_user = authenticate(username=user.email, password=password)
        if not authenticated_user:
            self._record_failed_login(user=user, ip_address=ip_address, user_agent=user_agent)
            raise exceptions.AuthenticationFailed(
                "That email or password doesn't look right. Please try again."
            )

        return self.issue_session(
            user=user,
            remember_me=remember_me,
            ip_address=ip_address,
            user_agent=user_agent,
            event_type="login_succeeded",
        )

    def issue_session(
        self,
        *,
        user: User,
        remember_me: bool,
        ip_address: str | None,
        user_agent: str,
        event_type: str = "login_succeeded",
    ) -> LoginResult:
        if user.status in {UserStatus.SUSPENDED, UserStatus.ARCHIVED}:
            raise exceptions.AuthenticationFailed(
                "This account is disabled. Contact support if you need access."
            )
        if user.is_locked:
            raise exceptions.AuthenticationFailed(
                "This account is temporarily locked. Try again in a few minutes."
            )
        if user.status == UserStatus.LOCKED:
            user.status = UserStatus.ACTIVE
        if user.status not in {UserStatus.ACTIVE, UserStatus.PENDING_VERIFICATION}:
            raise exceptions.AuthenticationFailed("This account is not active.")

        user.failed_login_count = 0
        user.locked_until = None
        user.last_login = timezone.now()
        user.last_login_ip = ip_address
        user.last_login_user_agent = user_agent
        user.save(
            update_fields=[
                "status",
                "failed_login_count",
                "locked_until",
                "last_login",
                "last_login_ip",
                "last_login_user_agent",
                "updated_at",
            ]
        )

        refresh = RefreshToken.for_user(user)
        if remember_me:
            refresh.set_exp(lifetime=timedelta(days=30))
        access = refresh.access_token
        session = UserSession.objects.create(
            user=user,
            refresh_jti=str(refresh["jti"]),
            ip_address=ip_address,
            user_agent=user_agent,
            remember_me=remember_me,
            expires_at=datetime.fromtimestamp(refresh["exp"], tz=timezone.get_current_timezone()),
        )
        RefreshTokenRecord.objects.create(
            user=user,
            session=session,
            jti=str(refresh["jti"]),
            expires_at=session.expires_at,
        )
        self.audit_service.record(
            event_type=event_type,
            user=user,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return LoginResult(
            user=user,
            session=session,
            tokens=TokenPair(
                access=str(access),
                refresh=str(refresh),
                token_type="Bearer",
                expires_in=int(access["exp"] - timezone.now().timestamp()),
            ),
        )

    def login_with_google(
        self,
        *,
        id_token: str,
        client: str,
        remember_me: bool,
        ip_address: str | None,
        user_agent: str,
    ) -> LoginResult:
        identity = verify_google_id_token(id_token)
        user = self._resolve_google_user(identity)
        if user is None:
            if client != "customer":
                raise GoogleAccountNotRegistered()
            user = self._create_google_user(
                identity=identity,
                role_code=DEFAULT_CUSTOMER_ROLE_CODE,
                first_name=identity.given_name,
                last_name=identity.family_name,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        else:
            self._link_google_account(user=user, identity=identity)
            self._activate_verified_google_user(user=user, identity=identity)
            if client == "ops" and not self._user_has_ops_workspace(user):
                raise GoogleAccountNotRegistered()
        return self.issue_session(
            user=user,
            remember_me=remember_me,
            ip_address=ip_address,
            user_agent=user_agent,
            event_type="google_login_succeeded",
        )

    def register_from_google(
        self,
        *,
        identity: GoogleIdentity,
        role_code: str = DEFAULT_OWNER_ROLE_CODE,
        first_name: str | None = None,
        last_name: str | None = None,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> User:
        existing_social = SocialAccount.objects.filter(
            provider=GOOGLE_SOCIAL_PROVIDER, subject=identity.subject
        ).first()
        if existing_social:
            if self._user_has_ops_workspace(existing_social.user):
                raise exceptions.ValidationError(
                    {"google_id_token": "This Google account is already registered."}
                )
            return existing_social.user
        existing_user = self.user_repository.get_by_email(identity.email)
        if existing_user:
            if self._user_has_ops_workspace(existing_user):
                raise exceptions.ValidationError({"email": "A user with this email already exists."})
            self._link_google_account(user=existing_user, identity=identity)
            self._activate_verified_google_user(user=existing_user, identity=identity)
            return existing_user
        return self._create_google_user(
            identity=identity,
            role_code=role_code,
            first_name=first_name or identity.given_name,
            last_name=last_name or identity.family_name,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    def register(
        self,
        *,
        email: str,
        password: str,
        first_name: str | None = None,
        last_name: str | None = None,
        role_code: str = DEFAULT_OWNER_ROLE_CODE,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> User:
        existing_user = self.user_repository.get_by_email(email)
        if existing_user:
            raise exceptions.ValidationError({"email": "A user with this email already exists."})

        user = User.objects.create_user(
            email=email,
            password=password,
            first_name=first_name or "",
            last_name=last_name or "",
            status=UserStatus.PENDING_VERIFICATION,
        )

        RoleService().assign_role(user=user, role_code=role_code)

        EmailVerificationService().send_verification(user=user)
        self.audit_service.record(
            event_type="user_registered",
            user=user,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return user

    def logout(
        self,
        *,
        refresh_token: str,
        user: User | None,
        ip_address: str | None,
        user_agent: str,
    ) -> None:
        try:
            token = RefreshToken(refresh_token)
        except TokenError as exc:
            raise exceptions.ValidationError({"refresh": "Refresh token is invalid."}) from exc
        jti = str(token["jti"])
        token.blacklist()
        session = UserSession.all_objects.filter(refresh_jti=jti).first()
        if session:
            session.revoke(reason="logout")
        RefreshTokenRecord.all_objects.filter(jti=jti, revoked_at__isnull=True).update(
            revoked_at=timezone.now()
        )
        self.audit_service.record(
            event_type="logout",
            user=user,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    def logout_all(self, *, user: User, ip_address: str | None, user_agent: str) -> None:
        now = timezone.now()
        UserSession.objects.filter(user=user, revoked_at__isnull=True).update(
            revoked_at=now,
            revoked_reason="logout_all",
            updated_at=now,
        )
        RefreshTokenRecord.objects.filter(user=user, revoked_at__isnull=True).update(
            revoked_at=now,
            updated_at=now,
        )
        self.audit_service.record(
            event_type="logout_all",
            user=user,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    def _user_has_ops_workspace(self, user: User) -> bool:
        if getattr(user, "is_superuser", False):
            return True
        role_codes = set(
            user.user_roles.filter(role__is_active=True).values_list("role__code", flat=True)
        )
        if role_codes & {"platform_admin", "super_admin"}:
            return True
        from apps.tenancy.repositories.tenancy import TenantRepository

        return TenantRepository().list_for_user(user).exists()

    def _resolve_google_user(self, identity: GoogleIdentity) -> User | None:
        social = (
            SocialAccount.objects.filter(provider=GOOGLE_SOCIAL_PROVIDER, subject=identity.subject)
            .select_related("user")
            .first()
        )
        if social and social.user and social.user.deleted_at is None:
            return social.user
        return self.user_repository.get_active_by_email(identity.email)

    def _link_google_account(self, *, user: User, identity: GoogleIdentity) -> SocialAccount:
        existing = (
            SocialAccount.objects.filter(provider=GOOGLE_SOCIAL_PROVIDER, subject=identity.subject)
            .select_related("user")
            .first()
        )
        if existing and existing.user_id != user.id:
            raise exceptions.AuthenticationFailed(
                "This Google account is already linked to another user."
            )
        linked = SocialAccount.objects.filter(user=user, provider=GOOGLE_SOCIAL_PROVIDER).first()
        if linked and linked.subject != identity.subject:
            raise exceptions.AuthenticationFailed(
                "This email is already linked to a different Google account."
            )
        social, _created = SocialAccount.objects.get_or_create(
            provider=GOOGLE_SOCIAL_PROVIDER,
            subject=identity.subject,
            defaults={"user": user, "email": identity.email},
        )
        if social.email != identity.email:
            social.email = identity.email
            social.save(update_fields=["email", "updated_at"])
        return social

    def _activate_verified_google_user(self, *, user: User, identity: GoogleIdentity) -> None:
        update_fields: list[str] = []
        if identity.picture and not user.profile_photo:
            user.profile_photo = identity.picture
            update_fields.append("profile_photo")
        if not user.first_name and identity.given_name:
            user.first_name = identity.given_name
            update_fields.append("first_name")
        if not user.last_name and identity.family_name:
            user.last_name = identity.family_name
            update_fields.append("last_name")
        if not user.email_verified_at:
            user.email_verified_at = timezone.now()
            update_fields.append("email_verified_at")
        if user.status in {UserStatus.PENDING_VERIFICATION, UserStatus.LOCKED}:
            user.status = UserStatus.ACTIVE
            update_fields.append("status")
        if user.locked_until:
            user.locked_until = None
            update_fields.append("locked_until")
        if user.failed_login_count:
            user.failed_login_count = 0
            update_fields.append("failed_login_count")
        if update_fields:
            update_fields.append("updated_at")
            user.save(update_fields=update_fields)

    def _create_google_user(
        self,
        *,
        identity: GoogleIdentity,
        role_code: str,
        first_name: str | None,
        last_name: str | None,
        ip_address: str | None,
        user_agent: str,
    ) -> User:
        user = User.objects.create_user(
            email=identity.email,
            password=None,
            first_name=first_name or "",
            last_name=last_name or "",
            profile_photo=identity.picture,
            status=UserStatus.ACTIVE,
            email_verified_at=timezone.now(),
        )
        RoleService().assign_role(user=user, role_code=role_code)
        SocialAccount.objects.create(
            user=user,
            provider=GOOGLE_SOCIAL_PROVIDER,
            subject=identity.subject,
            email=identity.email,
        )
        self.audit_service.record(
            event_type="google_user_registered",
            user=user,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={"provider": GOOGLE_SOCIAL_PROVIDER, "role": role_code},
        )
        return user

    def _record_failed_login(self, *, user: User, ip_address: str | None, user_agent: str) -> None:
        user.failed_login_count += 1
        update_fields = ["failed_login_count", "updated_at"]
        if user.failed_login_count >= settings.IAM_SETTINGS["FAILED_LOGIN_LIMIT"]:
            user.locked_until = timezone.now() + timedelta(
                minutes=settings.IAM_SETTINGS["ACCOUNT_LOCKOUT_MINUTES"]
            )
            user.status = UserStatus.LOCKED
            update_fields.extend(["locked_until", "status"])
        user.save(update_fields=update_fields)
        self.audit_service.record(
            event_type="login_failed",
            user=user,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={"failed_login_count": user.failed_login_count},
        )
