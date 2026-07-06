from django.urls import path

from apps.authentication.api.views import (
    ChangePasswordView,
    ForgotPasswordView,
    LoginView,
    LogoutView,
    MeView,
    RefreshView,
    ResendVerificationView,
    ResetPasswordView,
    VerifyEmailView,
)

urlpatterns = [
    path("login", LoginView.as_view(), name="auth-login"),
    path("refresh", RefreshView.as_view(), name="auth-refresh"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    path("forgot-password", ForgotPasswordView.as_view(), name="auth-forgot-password"),
    path("reset-password", ResetPasswordView.as_view(), name="auth-reset-password"),
    path("change-password", ChangePasswordView.as_view(), name="auth-change-password"),
    path("verify-email", VerifyEmailView.as_view(), name="auth-verify-email"),
    path("resend-verification", ResendVerificationView.as_view(), name="auth-resend-verification"),
    path("me", MeView.as_view(), name="auth-me"),
]
