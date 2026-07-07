from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import exceptions
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import RefreshTokenRecord, User, UserSession, UserStatus
from apps.authentication.repositories.users import UserRepository
from apps.authentication.services.audit import SecurityAuditService
from apps.authentication.constants import DEFAULT_OWNER_ROLE_CODE
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
            raise exceptions.AuthenticationFailed("Invalid credentials.")

        authenticated_user = authenticate(username=user.email, password=password)
        if not authenticated_user:
            self._record_failed_login(user=user, ip_address=ip_address, user_agent=user_agent)
            raise exceptions.AuthenticationFailed("Invalid credentials.")

        if user.status not in {UserStatus.ACTIVE, UserStatus.PENDING_VERIFICATION}:
            raise exceptions.PermissionDenied("User account is not active.")

        user.failed_login_count = 0
        user.locked_until = None
        user.last_login = timezone.now()
        user.last_login_ip = ip_address
        user.last_login_user_agent = user_agent
        user.save(
            update_fields=[
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
            event_type="login_succeeded",
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

    def register(
        self,
        *,
        email: str,
        password: str,
        first_name: str | None = None,
        last_name: str | None = None,
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

        RoleService().assign_role(user=user, role_code=DEFAULT_OWNER_ROLE_CODE)

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
