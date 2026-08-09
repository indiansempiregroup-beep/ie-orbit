from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.businesses.models import Business
from apps.shopie.models import (
    ShopGodown,
    ShopGodownStock,
    ShopProduct,
    ShopStockTransfer,
)
from apps.tenancy.models import Tenant


def _q3(value: Any) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.001"))


class GodownsService:
    def list_godowns(self, *, tenant: Tenant, business: Business):
        return ShopGodown.objects.filter(tenant=tenant, business=business, is_active=True)

    @transaction.atomic
    def create_godown(
        self,
        *,
        tenant: Tenant,
        business: Business,
        name: str,
        code: str = "",
        is_default: bool = False,
    ) -> ShopGodown:
        name = (name or "").strip()
        if not name:
            raise ValidationError({"name": "Name is required."})
        if is_default:
            ShopGodown.objects.filter(tenant=tenant, business=business, is_default=True).update(
                is_default=False
            )
        elif not ShopGodown.objects.filter(tenant=tenant, business=business).exists():
            is_default = True
        return ShopGodown.objects.create(
            tenant=tenant,
            business=business,
            name=name,
            code=(code or "").strip(),
            is_default=is_default,
        )

    def _adjust_godown_stock(
        self,
        *,
        tenant: Tenant,
        business: Business,
        godown: ShopGodown,
        product: ShopProduct,
        delta: Decimal,
    ) -> ShopGodownStock:
        row, _ = ShopGodownStock.objects.select_for_update().get_or_create(
            tenant=tenant,
            business=business,
            godown=godown,
            product=product,
            defaults={"quantity": Decimal("0.000")},
        )
        new_qty = _q3(row.quantity) + _q3(delta)
        if new_qty < 0:
            raise ValidationError(
                {"quantity": f"Insufficient stock in godown '{godown.name}' for {product.name}."}
            )
        row.quantity = new_qty
        row.save(update_fields=["quantity", "updated_at", "version"])
        return row

    @transaction.atomic
    def transfer_stock(
        self,
        *,
        tenant: Tenant,
        business: Business,
        from_godown_id,
        to_godown_id,
        lines: list[dict[str, Any]],
        notes: str = "",
        transfer_date=None,
    ) -> ShopStockTransfer:
        if from_godown_id == to_godown_id:
            raise ValidationError({"to_godown_id": "Source and destination must differ."})
        if not lines:
            raise ValidationError({"lines": "At least one line is required."})
        from_godown = ShopGodown.objects.get(tenant=tenant, business=business, id=from_godown_id)
        to_godown = ShopGodown.objects.get(tenant=tenant, business=business, id=to_godown_id)

        serialized: list[dict[str, Any]] = []
        for raw in lines:
            product = ShopProduct.objects.select_for_update().get(
                tenant=tenant, business=business, id=raw["product_id"]
            )
            qty = _q3(raw.get("quantity") or raw.get("qty"))
            if qty <= 0:
                raise ValidationError({"quantity": "Quantity must be greater than zero."})
            self._adjust_godown_stock(
                tenant=tenant, business=business, godown=from_godown, product=product, delta=-qty
            )
            self._adjust_godown_stock(
                tenant=tenant, business=business, godown=to_godown, product=product, delta=qty
            )
            # Keep product-level stock unchanged overall (location move only).
            serialized.append(
                {
                    "product_id": str(product.id),
                    "name": product.name,
                    "quantity": str(qty),
                }
            )

        stamp = timezone.now().strftime("%Y%m%d%H%M%S")
        return ShopStockTransfer.objects.create(
            tenant=tenant,
            business=business,
            from_godown=from_godown,
            to_godown=to_godown,
            transfer_number=f"TR-{business.business_code[:8].upper()}-{stamp}",
            transfer_date=transfer_date or timezone.localdate(),
            status="completed",
            notes=notes or "",
            line_items=serialized,
        )

    def list_transfers(self, *, tenant: Tenant, business: Business):
        return ShopStockTransfer.objects.filter(tenant=tenant, business=business)
