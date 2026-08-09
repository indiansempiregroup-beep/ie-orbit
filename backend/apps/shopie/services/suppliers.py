from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q, QuerySet

from apps.businesses.models import Business
from apps.shopie.models import ShopSupplier
from apps.tenancy.models import Tenant


class SupplierService:
    def list_suppliers(
        self,
        *,
        tenant: Tenant,
        business: Business,
        search: str | None = None,
    ) -> QuerySet[ShopSupplier]:
        qs = ShopSupplier.objects.filter(tenant=tenant, business=business).order_by("name")
        if search:
            term = search.strip()
            qs = qs.filter(
                Q(name__icontains=term)
                | Q(phone__icontains=term)
                | Q(email__icontains=term)
                | Q(gstin__icontains=term)
            )
        return qs

    def get_supplier(
        self, *, tenant: Tenant, business: Business, supplier_id: UUID
    ) -> ShopSupplier:
        return ShopSupplier.objects.get(tenant=tenant, business=business, id=supplier_id)

    @transaction.atomic
    def create_supplier(
        self,
        *,
        tenant: Tenant,
        business: Business,
        data: dict[str, Any],
    ) -> ShopSupplier:
        name = str(data.get("name") or "").strip()
        if not name:
            raise ValidationError({"name": "Supplier name is required."})
        return ShopSupplier.objects.create(
            tenant=tenant,
            business=business,
            name=name,
            phone=str(data.get("phone") or "").strip(),
            email=str(data.get("email") or "").strip(),
            gstin=str(data.get("gstin") or "").strip().upper(),
            billing_state=str(data.get("billing_state") or "").strip(),
            billing_address=str(data.get("billing_address") or "").strip(),
            credit_limit=Decimal(str(data.get("credit_limit") or "0")),
            opening_balance=Decimal(str(data.get("opening_balance") or "0")),
            metadata=data.get("metadata") or {},
        )

    @transaction.atomic
    def update_supplier(
        self,
        *,
        supplier: ShopSupplier,
        data: dict[str, Any],
    ) -> ShopSupplier:
        for field in ("name", "phone", "email", "billing_state", "billing_address"):
            if field in data and data[field] is not None:
                setattr(supplier, field, str(data[field]).strip())
        if "gstin" in data and data["gstin"] is not None:
            supplier.gstin = str(data["gstin"]).strip().upper()
        for field in ("credit_limit", "opening_balance"):
            if field in data and data[field] is not None:
                setattr(supplier, field, Decimal(str(data[field])))
        if "metadata" in data and data["metadata"] is not None:
            current = supplier.metadata if isinstance(supplier.metadata, dict) else {}
            supplier.metadata = {**current, **data["metadata"]}
        supplier.save()
        return supplier

    def delete_supplier(self, *, supplier: ShopSupplier) -> None:
        supplier.delete()
