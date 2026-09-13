from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import urljoin
import hashlib

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.businesses.constants import FEATURE_NOTIFICATIONS_WHATSAPP
from apps.businesses.models import Business, BusinessSettings
from apps.businesses.services.entitlements import EntitlementService
from apps.notifications.models import Notification, NotificationChannel, NotificationLog, NotificationStatus
from apps.notifications.services.whatsapp_catalog import (
    UNMAPPED_EVENTS,
    WHATSAPP_CATALOG,
    catalog_by_code,
)
from apps.notifications.services.whatsapp_graph import (
    WhatsAppGraphError,
    create_message_template,
    get_phone_number,
    list_message_templates,
    send_template_message,
)
from apps.shopie.services.delivery_secrets import decrypt_secret, encrypt_secret, mask_secret
from apps.tenancy.models import Tenant

_STATUS_APPROVED = "approved"
_STATUS_PENDING = "pending"
_STATUS_REJECTED = "rejected"
_STATUS_NOT_SYNCED = "not_synced"
_STATUS_PAUSED = "paused"


def _now_iso() -> str:
    return timezone.now().isoformat()


class WhatsAppIntegrationService:
    def ensure_settings(self, *, tenant: Tenant, business: Business) -> BusinessSettings:
        settings_row, _ = BusinessSettings.objects.get_or_create(tenant=tenant, business=business)
        return settings_row

    def _raw(self, settings_row: BusinessSettings) -> dict[str, Any]:
        raw = settings_row.whatsapp_integration
        return dict(raw) if isinstance(raw, dict) else {}

    def _templates_state(self, raw: dict[str, Any]) -> dict[str, dict[str, Any]]:
        stored = raw.get("templates")
        return dict(stored) if isinstance(stored, dict) else {}

    def _save(self, settings_row: BusinessSettings, payload: dict[str, Any]) -> BusinessSettings:
        settings_row.whatsapp_integration = payload
        settings_row.save(update_fields=["whatsapp_integration", "updated_at"])
        return settings_row

    def _plan_entitled(self, *, business: Business) -> bool:
        return FEATURE_NOTIFICATIONS_WHATSAPP in EntitlementService().entitled_features(business=business)

    def decrypted_credentials(self, raw: dict[str, Any]) -> dict[str, str]:
        return {
            "phone_number_id": str(raw.get("phone_number_id") or "").strip(),
            "waba_id": str(raw.get("waba_id") or "").strip(),
            "access_token": decrypt_secret(str(raw.get("access_token") or "")),
            "display_number": str(raw.get("display_number") or "").strip(),
        }

    def connection_status(self, *, business: Business, raw: dict[str, Any] | None = None) -> str:
        settings_row = self.ensure_settings(tenant=business.tenant, business=business)
        data = raw if raw is not None else self._raw(settings_row)
        if not self._plan_entitled(business=business):
            return "not_in_plan"
        creds = self.decrypted_credentials(data)
        if not creds["phone_number_id"] or not creds["waba_id"] or not creds["access_token"]:
            return "not_configured"
        if data.get("enabled") is False:
            return "paused"
        templates = self._templates_state(data)
        approved = sum(1 for entry in WHATSAPP_CATALOG if str(templates.get(entry.code, {}).get("status") or "") == _STATUS_APPROVED)
        pending = sum(
            1
            for entry in WHATSAPP_CATALOG
            if str(templates.get(entry.code, {}).get("status") or _STATUS_NOT_SYNCED) in {_STATUS_PENDING, _STATUS_NOT_SYNCED}
        )
        if approved == 0:
            return "verification_required"
        if pending:
            return "verification_required"
        return "live"

    def public_settings(self, *, business: Business, webhook_url: str = "") -> dict[str, Any]:
        settings_row = self.ensure_settings(tenant=business.tenant, business=business)
        raw = self._raw(settings_row)
        creds = self.decrypted_credentials(raw)
        templates = self.list_templates(business=business)
        approved = sum(1 for item in templates if item["status"] == _STATUS_APPROVED)
        pending = sum(1 for item in templates if item["status"] in {_STATUS_PENDING, _STATUS_NOT_SYNCED})
        rejected = sum(1 for item in templates if item["status"] == _STATUS_REJECTED)
        plan_entitled = self._plan_entitled(business=business)
        configured = bool(creds["phone_number_id"] and creds["waba_id"] and creds["access_token"])
        enabled = data_enabled(raw)
        status = self.connection_status(business=business, raw=raw)
        return {
            "configured": configured,
            "connected": configured,
            "plan_entitled": plan_entitled,
            "available": plan_entitled,
            "enabled": enabled,
            "status": status,
            "phone_number_id": creds["phone_number_id"],
            "waba_id": creds["waba_id"],
            "access_token_masked": mask_secret(creds["access_token"]),
            "display_number": creds["display_number"],
            "quality_rating": str(raw.get("quality_rating") or ""),
            "last_error": str(raw.get("last_error") or ""),
            "last_tested_at": raw.get("last_tested_at"),
            "webhook_url": webhook_url or webhook_url_for_platform(),
            "webhook_verify_token": webhook_verify_token(),
            "template_counts": {
                "total": len(WHATSAPP_CATALOG),
                "approved": approved,
                "pending": pending,
                "rejected": rejected,
            },
        }

    def update_settings(
        self,
        *,
        business: Business,
        phone_number_id: str = "",
        waba_id: str = "",
        access_token: str = "",
        enabled: bool | None = None,
        test_connection: bool = False,
    ) -> dict[str, Any]:
        if not self._plan_entitled(business=business):
            raise ValidationError({"plan": "WhatsApp notifications are not included in this plan."})
        settings_row = self.ensure_settings(tenant=business.tenant, business=business)
        raw = self._raw(settings_row)
        if phone_number_id:
            raw["phone_number_id"] = phone_number_id.strip()
        if waba_id:
            raw["waba_id"] = waba_id.strip()
        if access_token.strip():
            raw["access_token"] = encrypt_secret(access_token.strip())
        if enabled is not None:
            raw["enabled"] = bool(enabled)
        elif "enabled" not in raw:
            raw["enabled"] = True

        creds = self.decrypted_credentials(raw)
        if not creds["phone_number_id"] or not creds["waba_id"] or not creds["access_token"]:
            raise ValidationError({"credentials": "Phone number ID, WABA ID, and access token are required."})

        if test_connection:
            try:
                info = get_phone_number(phone_number_id=creds["phone_number_id"], token=creds["access_token"])
                raw["display_number"] = str(info.get("display_phone_number") or creds["display_number"])
                raw["quality_rating"] = str(info.get("quality_rating") or "")
                raw["last_error"] = ""
                raw["last_tested_at"] = _now_iso()
            except WhatsAppGraphError as exc:
                raw["last_error"] = str(exc)
                self._save(settings_row, raw)
                raise ValidationError({"credentials": str(exc)}) from exc

        self._save(settings_row, raw)
        return self.public_settings(business=business)

    def set_enabled(self, *, business: Business, enabled: bool) -> dict[str, Any]:
        settings_row = self.ensure_settings(tenant=business.tenant, business=business)
        raw = self._raw(settings_row)
        raw["enabled"] = bool(enabled)
        self._save(settings_row, raw)
        return self.public_settings(business=business)

    def disconnect(self, *, business: Business) -> dict[str, Any]:
        settings_row = self.ensure_settings(tenant=business.tenant, business=business)
        raw = self._raw(settings_row)
        templates = self._templates_state(raw)
        self._save(
            settings_row,
            {
                "enabled": False,
                "templates": templates,
                "phone_number_id": "",
                "waba_id": "",
                "access_token": "",
                "display_number": "",
                "last_error": "",
            },
        )
        return self.public_settings(business=business)

    def list_templates(self, *, business: Business) -> list[dict[str, Any]]:
        settings_row = self.ensure_settings(tenant=business.tenant, business=business)
        stored = self._templates_state(self._raw(settings_row))
        rows: list[dict[str, Any]] = []
        for entry in WHATSAPP_CATALOG:
            state = dict(stored.get(entry.code) or {})
            status = str(state.get("status") or _STATUS_NOT_SYNCED)
            rows.append(
                {
                    "code": entry.code,
                    "title": entry.title,
                    "group": entry.group,
                    "meta_name": entry.meta_name,
                    "language": entry.language,
                    "body": entry.body,
                    "body_params": list(entry.body_params),
                    "sample_values": list(entry.sample_values),
                    "event_type": entry.event_type,
                    "audience": entry.audience,
                    "notification_template_code": entry.notification_template_code,
                    "meta_template_id": str(state.get("meta_template_id") or ""),
                    "status": status,
                    "enabled": bool(state.get("enabled", True)) if status == _STATUS_APPROVED else False,
                    "rejection_reason": str(state.get("rejection_reason") or ""),
                    "last_synced_at": state.get("last_synced_at"),
                }
            )
        return rows

    def list_mappings(self, *, business: Business) -> dict[str, Any]:
        templates = {row["code"]: row for row in self.list_templates(business=business)}
        mapped = [
            {
                "event_type": entry.event_type,
                "audience": entry.audience,
                "notification_template_code": entry.notification_template_code,
                "whatsapp_template_code": entry.code,
                "title": entry.title,
                "status": templates[entry.code]["status"],
                "enabled": templates[entry.code]["enabled"],
            }
            for entry in WHATSAPP_CATALOG
        ]
        return {"mapped": mapped, "unmapped": list(UNMAPPED_EVENTS)}

    def set_template_enabled(self, *, business: Business, code: str, enabled: bool) -> dict[str, Any]:
        entry = catalog_by_code().get(code)
        if entry is None:
            raise ValidationError({"code": "Unknown WhatsApp template."})
        settings_row = self.ensure_settings(tenant=business.tenant, business=business)
        raw = self._raw(settings_row)
        templates = self._templates_state(raw)
        state = dict(templates.get(code) or {})
        if str(state.get("status") or "") != _STATUS_APPROVED:
            raise ValidationError({"enabled": "Only approved templates can be enabled."})
        state["enabled"] = bool(enabled)
        templates[code] = state
        raw["templates"] = templates
        self._save(settings_row, raw)
        return next(row for row in self.list_templates(business=business) if row["code"] == code)

    def refresh_templates(self, *, business: Business) -> list[dict[str, Any]]:
        settings_row = self.ensure_settings(tenant=business.tenant, business=business)
        raw = self._raw(settings_row)
        creds = self.decrypted_credentials(raw)
        if not creds["waba_id"] or not creds["access_token"]:
            raise ValidationError({"credentials": "Connect WhatsApp before refreshing templates."})
        try:
            remote = list_message_templates(waba_id=creds["waba_id"], token=creds["access_token"])
        except WhatsAppGraphError as exc:
            raw["last_error"] = str(exc)
            self._save(settings_row, raw)
            raise ValidationError({"templates": str(exc)}) from exc
        by_name = {str(item.get("name") or ""): item for item in remote}
        templates = self._templates_state(raw)
        for entry in WHATSAPP_CATALOG:
            remote_item = by_name.get(entry.meta_name)
            state = dict(templates.get(entry.code) or {})
            if remote_item:
                status = str(remote_item.get("status") or "").lower() or _STATUS_PENDING
                if status not in {_STATUS_APPROVED, _STATUS_PENDING, _STATUS_REJECTED, "paused"}:
                    status = _STATUS_PENDING
                if status == "paused":
                    status = _STATUS_PAUSED
                state["status"] = status
                state["meta_template_id"] = str(remote_item.get("id") or state.get("meta_template_id") or "")
                rejected = remote_item.get("rejected_reason") or remote_item.get("quality_score")
                if status == _STATUS_REJECTED:
                    state["rejection_reason"] = str(
                        remote_item.get("rejected_reason") or rejected or "Rejected by Meta"
                    )
                else:
                    state["rejection_reason"] = ""
                state["last_synced_at"] = _now_iso()
            elif not state.get("status"):
                state["status"] = _STATUS_NOT_SYNCED
            templates[entry.code] = state
        raw["templates"] = templates
        raw["last_error"] = ""
        self._save(settings_row, raw)
        return self.list_templates(business=business)

    def sync_templates(self, *, business: Business, code: str | None = None) -> list[dict[str, Any]]:
        settings_row = self.ensure_settings(tenant=business.tenant, business=business)
        raw = self._raw(settings_row)
        creds = self.decrypted_credentials(raw)
        if not creds["waba_id"] or not creds["access_token"]:
            raise ValidationError({"credentials": "Connect WhatsApp before syncing templates."})
        catalog = catalog_by_code()
        targets = [catalog[code]] if code else list(WHATSAPP_CATALOG)
        if code and code not in catalog:
            raise ValidationError({"code": "Unknown WhatsApp template."})
        try:
            self.refresh_templates(business=business)
        except ValidationError:
            pass
        settings_row.refresh_from_db()
        raw = self._raw(settings_row)
        templates = self._templates_state(raw)
        errors: list[str] = []
        for entry in targets:
            state = dict(templates.get(entry.code) or {})
            if str(state.get("status") or "") == _STATUS_APPROVED:
                continue
            try:
                result = create_message_template(
                    waba_id=creds["waba_id"],
                    token=creds["access_token"],
                    name=entry.meta_name,
                    language=entry.language,
                    body=entry.body,
                    sample_values=list(entry.sample_values),
                )
                state["meta_template_id"] = str(result.get("id") or state.get("meta_template_id") or "")
                state["status"] = str(result.get("status") or _STATUS_PENDING).lower()
                if state["status"] not in {_STATUS_APPROVED, _STATUS_PENDING, _STATUS_REJECTED}:
                    state["status"] = _STATUS_PENDING
                state["last_synced_at"] = _now_iso()
                state["rejection_reason"] = ""
            except WhatsAppGraphError as exc:
                errors.append(f"{entry.code}: {exc}")
                state["rejection_reason"] = str(exc)
            templates[entry.code] = state
        raw["templates"] = templates
        if errors:
            raw["last_error"] = "; ".join(errors)
        else:
            raw["last_error"] = ""
        self._save(settings_row, raw)
        if errors and code:
            raise ValidationError({"templates": errors[0]})
        try:
            return self.refresh_templates(business=business)
        except ValidationError:
            return self.list_templates(business=business)

    def test_template(self, *, business: Business, code: str, to: str) -> dict[str, Any]:
        from apps.customers.services.contact import format_contact_phone
        from apps.notifications.services.whatsapp_catalog import param_values

        entry = catalog_by_code().get(code)
        if entry is None:
            raise ValidationError({"code": "Unknown WhatsApp template."})
        settings_row = self.ensure_settings(tenant=business.tenant, business=business)
        raw = self._raw(settings_row)
        creds = self.decrypted_credentials(raw)
        if not creds["phone_number_id"] or not creds["access_token"]:
            raise ValidationError({"credentials": "Connect WhatsApp before sending a test."})
        e164 = format_contact_phone(to, e164=True)
        if not e164:
            raise ValidationError({"to": "Enter a valid 10-digit Indian mobile number."})
        context = {key: value for key, value in zip(entry.body_params, entry.sample_values, strict=True)}
        try:
            result = send_template_message(
                phone_number_id=creds["phone_number_id"],
                token=creds["access_token"],
                to=e164,
                template_name=entry.meta_name,
                language=entry.language,
                body_values=param_values(entry, context),
            )
        except WhatsAppGraphError as exc:
            raw["last_error"] = str(exc)
            self._save(settings_row, raw)
            raise ValidationError({"send": str(exc)}) from exc
        messages = result.get("messages") if isinstance(result.get("messages"), list) else []
        wamid = ""
        if messages and isinstance(messages[0], dict):
            wamid = str(messages[0].get("id") or "")
        notification = Notification.objects.create(
            tenant=business.tenant,
            business=business,
            user=None,
            channel=NotificationChannel.WHATSAPP,
            subject=entry.title,
            body=entry.body,
            status=NotificationStatus.SENT,
            external_id=wamid,
            metadata={
                "event_type": "WhatsAppTemplateTest",
                "audience": "ops",
                "whatsapp_template_code": entry.code,
                "to": e164,
            },
        )
        NotificationLog.objects.create(
            tenant=business.tenant,
            notification=notification,
            provider="whatsapp",
            response_code="200",
            response_body=result,
        )
        raw["last_error"] = ""
        self._save(settings_row, raw)
        return {"sent": True, "external_id": wamid, "to": e164}

    def recent_activity(self, *, business: Business, limit: int = 20) -> list[dict[str, Any]]:
        logs = (
            NotificationLog.objects.filter(
                tenant=business.tenant,
                notification__business=business,
                notification__channel=NotificationChannel.WHATSAPP,
            )
            .select_related("notification")
            .order_by("-created_at")[:limit]
        )
        rows: list[dict[str, Any]] = []
        for log in logs:
            meta = log.notification.metadata if isinstance(log.notification.metadata, dict) else {}
            rows.append(
                {
                    "id": str(log.id),
                    "created_at": log.created_at.isoformat() if isinstance(log.created_at, datetime) else str(log.created_at or ""),
                    "status": log.notification.status,
                    "event_type": str(meta.get("event_type") or ""),
                    "whatsapp_template_code": str(meta.get("whatsapp_template_code") or ""),
                    "response_code": log.response_code,
                    "error": str((log.response_body or {}).get("error") or ""),
                    "external_id": log.notification.external_id,
                }
            )
        return rows


def data_enabled(raw: dict[str, Any]) -> bool:
    if "enabled" not in raw:
        return True
    return raw.get("enabled") is not False


def webhook_url_for_platform() -> str:
    origin = str(getattr(settings, "PUBLIC_API_ORIGIN", "") or "").rstrip("/")
    path = "/api/v1/notifications/whatsapp/webhook"
    if origin:
        return urljoin(origin + "/", path.lstrip("/"))
    return path


def webhook_url() -> str:
    return webhook_url_for_platform()


def webhook_verify_token() -> str:
    configured = str(getattr(settings, "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "") or "").strip()
    if configured:
        return configured
    digest = hashlib.sha256(f"whatsapp-webhook:{settings.SECRET_KEY}".encode("utf-8")).hexdigest()
    return digest[:32]
