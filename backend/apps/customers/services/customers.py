from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.customers.models import (
    Customer,
    CustomerExportJob,
    CustomerImportJob,
    CustomerMergeRecord,
    CustomerPreferences,
    CustomerProfile,
    CustomerStatus,
)
from apps.customers.repositories import CustomerRepository

logger = logging.getLogger("ie_platform.customers")


class CustomerService:
    def __init__(self, repository: CustomerRepository | None = None) -> None:
        self.repository = repository or CustomerRepository()

    @transaction.atomic
    def create_customer(self, *, data: dict[str, Any], tenant: Any, actor: Any) -> Customer:
        profile_data = data.pop("profile", None)
        preferences_data = data.pop("preferences", None)
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
        logger.info("Customer created", extra={"customer_id": str(customer.id)})
        return customer

    @transaction.atomic
    def update_customer(self, *, customer: Customer, data: dict[str, Any], actor: Any) -> Customer:
        profile_data = data.pop("profile", None)
        preferences_data = data.pop("preferences", None)
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

    def search(self, *, tenant: Any, user: Any, params: Any):
        tags = [tag.strip().lower() for tag in params.get("tags", "").split(",") if tag.strip()]
        return self.repository.search(
            tenant=tenant,
            user=user,
            query=params.get("q", ""),
            business_id=params.get("business", ""),
            status_value=params.get("status", ""),
            tags=tags,
        )
