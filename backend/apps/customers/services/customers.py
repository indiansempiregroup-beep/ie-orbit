from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.customers.models import (
    Customer,
    CustomerAddress,
    CustomerAddressType,
    CustomerExportJob,
    CustomerImportJob,
    CustomerMergeRecord,
    CustomerPreferences,
    CustomerProfile,
    CustomerStatus,
)
from apps.common.utils.business_context import resolve_business_id
from apps.customers.emails.registration_invite import build_customer_registration_invite
from apps.customers.repositories import CustomerRepository

logger = logging.getLogger("ie_orbit.customers")

_COORDINATE_QUANTUM = Decimal("0.000001")


def _as_coordinate(value: Any) -> Decimal | None:
    """Normalize GPS floats to Decimal(9,6) without binary float artifacts."""
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value)).quantize(_COORDINATE_QUANTUM, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValidationError({"coordinates": "Invalid latitude/longitude."}) from exc


class CustomerService:
    def __init__(self, repository: CustomerRepository | None = None) -> None:
        self.repository = repository or CustomerRepository()

    @transaction.atomic
    def create_customer(
        self,
        *,
        data: dict[str, Any],
        tenant: Any,
        actor: Any,
        send_registration_invite: bool = False,
    ) -> Customer:
        profile_data = data.pop("profile", None)
        preferences_data = data.pop("preferences", None)
        address_data = data.pop("default_address", None)
        customer = Customer(tenant=tenant, **data)
        if getattr(actor, "is_authenticated", False):
            customer.mark_created(actor_id=actor.id)
        self._validate_business_tenant(customer)
        self._validate_duplicate(customer)
        customer.full_clean()
        customer.save()
        self.ensure_foundation_records(customer)
        if isinstance(profile_data, dict):
            self.update_profile(customer=customer, data=profile_data)
        if isinstance(preferences_data, dict):
            self.update_preferences(customer=customer, data=preferences_data)
        if isinstance(address_data, dict):
            self.upsert_default_address(customer=customer, data=address_data)
        if send_registration_invite and customer.email:
            self._send_registration_invite(customer=customer)
        logger.info("Customer created", extra={"customer_id": str(customer.id)})
        return customer

    def _send_registration_invite(self, *, customer: Customer) -> None:
        business_name = getattr(customer.business, "display_name", None) or getattr(
            customer.business, "business_name", "AppointIE"
        )
        email_content = build_customer_registration_invite(customer=customer, business_name=business_name)
        send_mail(
            subject=email_content.subject,
            message=email_content.plain_text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[customer.email],
            html_message=email_content.html,
            fail_silently=True,
        )

    @transaction.atomic
    def update_customer(self, *, customer: Customer, data: dict[str, Any], actor: Any) -> Customer:
        profile_data = data.pop("profile", None)
        preferences_data = data.pop("preferences", None)
        address_data = data.pop("default_address", None)
        for field, value in data.items():
            setattr(customer, field, value)
        if getattr(actor, "is_authenticated", False):
            customer.mark_updated(actor_id=actor.id)
        self._validate_business_tenant(customer)
        customer.full_clean()
        customer.save()
        if isinstance(profile_data, dict):
            self.update_profile(customer=customer, data=profile_data)
        if isinstance(preferences_data, dict):
            self.update_preferences(customer=customer, data=preferences_data)
        if isinstance(address_data, dict):
            self.upsert_default_address(customer=customer, data=address_data)
        logger.info("Customer updated", extra={"customer_id": str(customer.id)})
        return customer

    @transaction.atomic
    def archive_customer(self, *, customer: Customer, actor: Any) -> Customer:
        customer.status = CustomerStatus.ARCHIVED
        customer.archived_at = timezone.now()
        if getattr(actor, "is_authenticated", False):
            customer.mark_updated(actor_id=actor.id)
        customer.save(update_fields=["status", "archived_at", "updated_by", "updated_at"])
        customer.soft_delete(deleted_by=getattr(actor, "id", None))
        return customer

    @transaction.atomic
    def restore_customer(self, *, customer: Customer, actor: Any) -> Customer:
        customer.status = CustomerStatus.ACTIVE
        customer.archived_at = None
        customer.is_active = True
        customer.deleted_at = None
        customer.deleted_by = None
        if getattr(actor, "is_authenticated", False):
            customer.mark_updated(actor_id=actor.id)
        customer.save()
        return customer

    @transaction.atomic
    def merge_customers(
        self,
        *,
        source: Customer,
        target: Customer,
        reason: str,
        actor: Any,
    ) -> CustomerMergeRecord:
        if source.tenant_id != target.tenant_id or source.business_id != target.business_id:
            raise ValidationError("Customers must belong to the same tenant and business.")
        source.status = CustomerStatus.MERGED
        source.merged_into = target
        source.soft_delete(deleted_by=getattr(actor, "id", None))
        record = CustomerMergeRecord.objects.create(
            tenant=source.tenant,
            business=source.business,
            source_customer=source,
            target_customer=target,
            merged_by=actor if getattr(actor, "is_authenticated", False) else None,
            reason=reason,
        )
        logger.info(
            "Customers merged", extra={"source_id": str(source.id), "target_id": str(target.id)}
        )
        return record

    def create_import_job(self, *, data: dict[str, Any], tenant: Any) -> CustomerImportJob:
        job = CustomerImportJob(tenant=tenant, **data)
        self._validate_business_tenant(job)
        job.full_clean()
        job.save()
        return job

    def create_export_job(self, *, data: dict[str, Any], tenant: Any) -> CustomerExportJob:
        job = CustomerExportJob(tenant=tenant, **data)
        self._validate_business_tenant(job)
        job.full_clean()
        job.save()
        return job

    def ensure_foundation_records(self, customer: Customer) -> None:
        CustomerProfile.objects.get_or_create(tenant=customer.tenant, customer=customer)
        CustomerPreferences.objects.get_or_create(
            tenant=customer.tenant,
            customer=customer,
            defaults={
                "timezone": customer.business.timezone,
                "currency": customer.business.currency,
                "language": customer.business.language,
            },
        )

    def update_profile(self, *, customer: Customer, data: dict[str, Any]) -> CustomerProfile:
        profile, _ = CustomerProfile.objects.get_or_create(
            tenant=customer.tenant, customer=customer
        )
        for field, value in data.items():
            setattr(profile, field, value)
        profile.full_clean()
        profile.save()
        return profile

    def update_preferences(
        self,
        *,
        customer: Customer,
        data: dict[str, Any],
    ) -> CustomerPreferences:
        preferences, _ = CustomerPreferences.objects.get_or_create(
            tenant=customer.tenant,
            customer=customer,
        )
        for field, value in data.items():
            setattr(preferences, field, value)
        preferences.full_clean()
        preferences.save()
        return preferences

    def upsert_default_address(self, *, customer: Customer, data: dict[str, Any]) -> CustomerAddress | None:
        payload = dict(data)
        full_address = str(payload.pop("full_address", "") or "").strip()
        line1 = str(payload.pop("line1", "") or "").strip()
        if full_address and not line1:
            line1 = full_address
        if not line1 and payload.get("latitude") in (None, "") and payload.get("longitude") in (None, ""):
            return None
        if not line1:
            raise ValidationError({"default_address": "Address text is required."})

        address = (
            customer.addresses.filter(is_default=True).first()
            or customer.addresses.order_by("created_at").first()
        )
        if address is None:
            address = CustomerAddress(tenant=customer.tenant, customer=customer, is_default=True)
        if "latitude" in payload:
            payload["latitude"] = _as_coordinate(payload.get("latitude"))
        if "longitude" in payload:
            payload["longitude"] = _as_coordinate(payload.get("longitude"))
        for field, value in payload.items():
            if hasattr(address, field):
                setattr(address, field, value)
        address.line1 = line1
        address.is_default = True
        try:
            address.full_clean()
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc
        address.save()
        customer.addresses.exclude(id=address.id).update(is_default=False)
        return address

    def list_addresses(self, *, customer: Customer):
        return customer.addresses.order_by("-is_default", "created_at")

    def create_address(self, *, customer: Customer, data: dict[str, Any]) -> CustomerAddress:
        payload = dict(data)
        full_address = str(payload.pop("full_address", "") or "").strip()
        line1 = str(payload.pop("line1", "") or "").strip()
        if full_address and not line1:
            line1 = full_address
        if not line1:
            raise ValidationError({"line1": "Address line is required."})
        if "latitude" in payload:
            payload["latitude"] = _as_coordinate(payload.get("latitude"))
        if "longitude" in payload:
            payload["longitude"] = _as_coordinate(payload.get("longitude"))
        make_default = bool(payload.pop("is_default", False)) or not customer.addresses.exists()
        address = CustomerAddress(
            tenant=customer.tenant,
            customer=customer,
            line1=line1,
            address_type=str(payload.get("address_type") or CustomerAddressType.HOME),
            line2=str(payload.get("line2") or ""),
            city=str(payload.get("city") or ""),
            state=str(payload.get("state") or ""),
            country=str(payload.get("country") or ""),
            postal_code=str(payload.get("postal_code") or ""),
            latitude=payload.get("latitude"),
            longitude=payload.get("longitude"),
            is_default=make_default,
        )
        try:
            address.full_clean()
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc
        address.save()
        if make_default:
            customer.addresses.exclude(id=address.id).update(is_default=False)
        return address

    def update_address(
        self, *, customer: Customer, address_id: Any, data: dict[str, Any]
    ) -> CustomerAddress:
        address = customer.addresses.filter(id=address_id).first()
        if address is None:
            raise ValidationError({"address": "Address not found."})
        payload = dict(data)
        if "full_address" in payload and not payload.get("line1"):
            payload["line1"] = str(payload.pop("full_address") or "").strip()
        else:
            payload.pop("full_address", None)
        if "latitude" in payload:
            payload["latitude"] = _as_coordinate(payload.get("latitude"))
        if "longitude" in payload:
            payload["longitude"] = _as_coordinate(payload.get("longitude"))
        make_default = bool(payload.pop("is_default", False))
        for field in (
            "address_type",
            "line1",
            "line2",
            "city",
            "state",
            "country",
            "postal_code",
            "latitude",
            "longitude",
        ):
            if field in payload and payload[field] is not None:
                setattr(address, field, payload[field])
        if make_default:
            address.is_default = True
        try:
            address.full_clean()
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc
        address.save()
        if address.is_default:
            customer.addresses.exclude(id=address.id).update(is_default=False)
        return address

    def delete_address(self, *, customer: Customer, address_id: Any) -> None:
        address = customer.addresses.filter(id=address_id).first()
        if address is None:
            raise ValidationError({"address": "Address not found."})
        was_default = address.is_default
        address.delete()
        if was_default:
            nxt = customer.addresses.order_by("created_at").first()
            if nxt:
                nxt.is_default = True
                nxt.save(update_fields=["is_default", "updated_at"])

    def _validate_business_tenant(self, obj: Any) -> None:
        if obj.business.tenant_id != obj.tenant_id:
            raise ValidationError("Business does not belong to the current tenant.")

    def _validate_duplicate(self, customer: Customer) -> None:
        if not customer.email and not customer.phone_number:
            return
        duplicate = Customer.objects.require_tenant(customer.tenant).filter(
            business=customer.business,
        )
        query = duplicate.none()
        if customer.email:
            query = duplicate.filter(email__iexact=customer.email)
        if customer.phone_number:
            query = query | duplicate.filter(phone_number=customer.phone_number)
        if query.exists():
            raise ValidationError("A customer with this email or phone already exists.")


class CustomerSearchService:
    def __init__(self, repository: CustomerRepository | None = None) -> None:
        self.repository = repository or CustomerRepository()

    def search(self, *, tenant: Any, user: Any, params: Any, request: Any | None = None):
        tags = [tag.strip().lower() for tag in params.get("tags", "").split(",") if tag.strip()]
        return self.repository.search(
            tenant=tenant,
            user=user,
            query=params.get("q", ""),
            business_id=resolve_business_id(request, params) if request is not None else params.get("business", ""),
            status_value=params.get("status", ""),
            tags=tags,
        )
