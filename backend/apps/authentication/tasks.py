from __future__ import annotations

from celery import shared_task


@shared_task(
    name="authentication.send_login_otp_email",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def send_login_otp_email_task(email: str, code: str, expiry_minutes: int) -> str:
    from django.conf import settings
    from django.core.mail import send_mail

    from apps.authentication.emails.otp_email import build_login_otp_email

    content = build_login_otp_email(email=email, code=code, expiry_minutes=expiry_minutes)
    send_mail(
        subject=content.subject,
        message=content.plain_text,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        html_message=content.html,
        fail_silently=False,
    )
    return email
