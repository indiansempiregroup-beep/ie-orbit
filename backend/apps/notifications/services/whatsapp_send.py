from __future__ import annotations

import logging
from typing import Any

from apps.authentication.models import User
from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.customers.services.contact import format_contact_phone, resolve_customer_phone
from apps.notifications.models import (
    Notification,
    NotificationChannel,
    NotificationLog,
    NotificationStatus,
)
from apps.notifications.services.preferences import whatsapp_opted_in
from apps.notifications.services.whatsapp_catalog import mapping_for_event, param_values
from apps.notifications.services.whatsapp_graph import WhatsAppGraphError, send_template_message
from apps.notifications.services.whatsapp_settings import WhatsAppIntegrationService, data_enabled
from apps.tenancy.models import Tenant

logger = logging.getLogger("ie_orbit.notifications")


def send_whatsapp_for_event(
    *,
    tenant: Tenant,
    business: Business,
    event_type: str,
    audience: str = "customer",
    user: User | None = None,
    customer: Customer | None = None,
    context: dict[str, Any] | None = None,
    extra_metadata: dict[str, Any] | None = None,
) -> Notification | None:
    if audience != "customer":
        return None
    entry = mapping_for_event(event_type=event_type, audience=audience)
    if entry is None:
        return None
    if not whatsapp_opted_in(user=user, customer=customer):
        return None

    service = WhatsAppIntegrationService()
    settings_row = service.ensure_settings(tenant=tenant, business=business)
    raw = service._raw(settings_row)
    if not data_enabled(raw):
        return None
    if service.connection_status(business=business, raw=raw) == "not_in_plan":
        return None
    creds = service.decrypted_credentials(raw)
    if not creds["phone_number_id"] or not creds["access_token"]:
        return None
    state = dict(service._templates_state(raw).get(entry.code) or {})
    if str(state.get("status") or "") != "approved":
        return None
    if state.get("enabled") is False:
        return None

    phone = ""
    if customer is not None:
        phone = format_contact_phone(resolve_customer_phone(customer), e164=True)
    if not phone and user is not None:
        phone = format_contact_phone(getattr(user, "phone_number", ""), e164=True)
    if not phone:
        return None

    payload = context or {}
    try:
        result = send_template_message(
            phone_number_id=creds["phone_number_id"],
            token=creds["access_token"],
            to=e164_digits(phone),
            template_name=entry.meta_name,
            language=entry.language,
            body_values=param_values(entry, payload),
        )
    except WhatsAppGraphError as exc:
        logger.warning(
            "WhatsApp send failed",
            extra={"event_type": event_type, "business_id": str(business.id), "error": str(exc)},
        )
        notification = Notification.objects.create(
            tenant=tenant,
            business=business,
            user=user,
            channel=NotificationChannel.WHATSAPP,
            subject=entry.title,
            body=entry.body,
            status=NotificationStatus.FAILED,
            metadata=_meta(event_type, entry.code, extra_metadata),
        )
        NotificationLog.objects.create(
            tenant=tenant,
            notification=notification,
            provider="whatsapp",
            response_code=str(exc.status_code or "500"),
            response_body={"error": str(exc), **(exc.payload or {})},
        )
        return notification
    except Exception:
        logger.exception("WhatsApp send crashed", extra={"event_type": event_type})
        return None

    messages = result.get("messages") if isinstance(result.get("messages"), list) else []
    wamid = ""
    if messages and isinstance(messages[0], dict):
        wamid = str(messages[0].get("id") or "")
    notification = Notification.objects.create(
        tenant=tenant,
        business=business,
        user=user,
        channel=NotificationChannel.WHATSAPP,
        subject=entry.title,
        body=" ".join(param_values(entry, payload)),
        status=NotificationStatus.SENT,
        external_id=wamid,
        metadata=_meta(event_type, entry.code, extra_metadata),
    )
    NotificationLog.objects.create(
        tenant=tenant,
        notification=notification,
        provider="whatsapp",
        response_code="200",
        response_body=result,
    )
    return notification


def e164_digits(value: str) -> str:
    return str(value or "").replace("+", "")


def _meta(event_type: str, code: str, extra: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "event_type": event_type,
        "audience": "customer",
        "whatsapp_template_code": code,
        **(extra or {}),
    }
