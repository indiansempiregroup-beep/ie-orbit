from django.urls import path

from apps.authentication.api.iam_views import (
    MemberRoleAssignView,
    MemberRoleRemoveView,
    PermissionListView,
    RoleListView,
    TenantMemberListView,
)
from apps.authentication.api.views import (
    ChangePasswordView,
    ForgotPasswordView,
    LoginView,
    LogoutView,
    MeProfilePhotoView,
    MeView,
    RefreshView,
    RegisterBusinessView,
    RegisterView,
    ResendVerificationView,
    ResetPasswordView,
    VerifyEmailView,
)

from apps.staff.api.invitation_views import AcceptInvitationView

urlpatterns = [
    path("login", LoginView.as_view(), name="auth-login"),
    path("refresh", RefreshView.as_view(), name="auth-refresh"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    path("register", RegisterView.as_view(), name="auth-register"),
    path("register-business", RegisterBusinessView.as_view(), name="auth-register-business"),
    path("forgot-password", ForgotPasswordView.as_view(), name="auth-forgot-password"),
    path("reset-password", ResetPasswordView.as_view(), name="auth-reset-password"),
    path("change-password", ChangePasswordView.as_view(), name="auth-change-password"),
    path("verify-email", VerifyEmailView.as_view(), name="auth-verify-email"),
    path("resend-verification", ResendVerificationView.as_view(), name="auth-resend-verification"),
    path("me", MeView.as_view(), name="auth-me"),
    path("me/photo", MeProfilePhotoView.as_view(), name="auth-me-photo"),
    path("accept-invitation", AcceptInvitationView.as_view(), name="auth-accept-invitation"),
    path("iam/roles", RoleListView.as_view(), name="iam-role-list"),
    path("iam/permissions", PermissionListView.as_view(), name="iam-permission-list"),
    path("iam/members", TenantMemberListView.as_view(), name="iam-member-list"),
    path("iam/members/<uuid:user_id>/roles", MemberRoleAssignView.as_view(), name="iam-member-role-assign"),
    path(
        "iam/members/<uuid:user_id>/roles/<slug:role_code>",
        MemberRoleRemoveView.as_view(),
        name="iam-member-role-remove",
    ),
]
