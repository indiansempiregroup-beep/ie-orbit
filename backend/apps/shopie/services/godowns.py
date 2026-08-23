from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.businesses.constants import FEATURE_SHOPIE_BOOKS_GODOWNS, PRODUCT_SHOPIE
from apps.businesses.models import Branch, BranchStatus, Business
from apps.businesses.services.entitlements import EntitlementService
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
    entitlements = EntitlementService()

    def list_godowns(self, *, tenant: Tenant, business: Business):
        self.sync_office_godowns(tenant=tenant, business=business)
        return (
            ShopGodown.objects.filter(tenant=tenant, business=business, is_active=True)
            .select_related("branch")
            .prefetch_related("stocks__product")
        )

    def get_default_godown(self, *, tenant: Tenant, business: Business) -> ShopGodown | None:
        qs = ShopGodown.objects.filter(tenant=tenant, business=business, is_active=True)
        return qs.filter(is_default=True).first() or qs.order_by("created_at").first()

    def ensure_default_godown(self, *, tenant: Tenant, business: Business) -> ShopGodown:
        existing = self.get_default_godown(tenant=tenant, business=business)
        if existing:
            return existing
        return self.create_godown(tenant=tenant, business=business, name="Main", is_default=True)

    def resolve_catalog_godown(
        self,
        *,
        tenant: Tenant,
        business: Business,
        godown_id=None,
    ) -> ShopGodown | None:
        if godown_id:
            try:
                return ShopGodown.objects.get(
                    tenant=tenant, business=business, id=godown_id, is_active=True
                )
            except ShopGodown.DoesNotExist as exc:
                raise ValidationError({"godown_id": "Godown not found."}) from exc
        existing = self.get_default_godown(tenant=tenant, business=business)
        if existing:
            return existing
        if self.entitlements.has_feature(
            business=business,
            feature=FEATURE_SHOPIE_BOOKS_GODOWNS,
            product_code=PRODUCT_SHOPIE,
        ):
            return self.ensure_default_godown(tenant=tenant, business=business)
        # Multi-office shops track quantities per office regardless of the godowns
        # feature, because order routing chooses the source office from them.
        primary = (
            Branch.objects.filter(business=business, status=BranchStatus.ACTIVE)
            .order_by("-is_primary", "created_at")
            .first()
        )
        if primary and Branch.objects.filter(
            business=business, status=BranchStatus.ACTIVE
        ).count() > 1:
            return self.ensure_office_godown(tenant=tenant, business=business, branch=primary)
        return None

    def apply_catalog_delta(
        self,
        *,
        tenant: Tenant,
        business: Business,
        product: ShopProduct,
        delta: Decimal,
        godown_id=None,
        quantity_after: Decimal | None = None,
        allow_backorder: bool = False,
    ) -> ShopGodownStock | None:
        """Keep location stock in sync with product-level stock movements."""
        qty_delta = _q3(delta)
        if qty_delta == 0:
            return None
        godown = self.resolve_catalog_godown(tenant=tenant, business=business, godown_id=godown_id)
        if godown is None:
            return None
        after = _q3(quantity_after if quantity_after is not None else product.stock_on_hand)
        return self._adjust_godown_stock(
            tenant=tenant,
            business=business,
            godown=godown,
            product=product,
            delta=qty_delta,
            seed_quantity=_q3(after - qty_delta),
            allow_negative=allow_backorder,
        )

    @transaction.atomic
    def create_godown(
        self,
        *,
        tenant: Tenant,
        business: Business,
        name: str,
        code: str = "",
        is_default: bool = False,
        branch: Branch | None = None,
        phone_number: str = "",
        address_line1: str = "",
        address_line2: str = "",
        city: str = "",
        state: str = "",
        country: str = "",
        postal_code: str = "",
        latitude: Any = None,
        longitude: Any = None,
        require_address: bool = False,
    ) -> ShopGodown:
        name = (name or "").strip()
        if not name:
            raise ValidationError({"name": "Name is required."})
        if require_address and branch is None:
            if not address_line1.strip() or not city.strip() or not country.strip():
                raise ValidationError(
                    {"address": "Standalone godowns need a full address, city, and country."}
                )
            if latitude in (None, "") or longitude in (None, ""):
                raise ValidationError({"location": "Select a mapped address for this godown."})
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
            branch=branch,
            phone_number=(phone_number or "").strip(),
            address_line1=(address_line1 or "").strip(),
            address_line2=(address_line2 or "").strip(),
            city=(city or "").strip(),
            state=(state or "").strip(),
            country=(country or "").strip(),
            postal_code=(postal_code or "").strip(),
            latitude=latitude,
            longitude=longitude,
        )

    @staticmethod
    def effective_location(godown: ShopGodown, business: Business) -> dict[str, Any] | None:
        branch = godown.branch
        source = branch if branch is not None else godown
        if source.latitude is None or source.longitude is None:
            return None
        return {
            "latitude": source.latitude,
            "longitude": source.longitude,
            "address_line1": source.address_line1,
            "address_line2": source.address_line2,
            "city": source.city,
            "state": source.state,
            "country": source.country,
            "postal_code": source.postal_code,
            "contact_name": (
                branch.display_name if branch is not None else godown.name
            )
            or business.display_name,
            "contact_phone": (
                branch.phone_number if branch is not None else godown.phone_number
            )
            or business.primary_contact,
            "branch_id": str(branch.id) if branch is not None else "",
            "godown_id": str(godown.id),
            "source_type": "office" if branch is not None else "godown",
        }

    @transaction.atomic
    def ensure_office_godown(
        self,
        *,
        tenant: Tenant,
        business: Business,
        branch: Branch,
    ) -> ShopGodown:
        """Every office owns exactly one stock location, so availability is per office.

        Runs regardless of the Books godowns feature: order routing needs the
        per-office quantities even when the merchant never opens the godowns UI.
        """
        existing = ShopGodown.objects.filter(
            tenant=tenant, business=business, branch=branch, is_active=True
        ).first()
        if existing:
            return existing
        # Legacy shops keep all stock in one unlinked godown. Adopt it for the
        # primary office instead of stranding that quantity in a dead location.
        if branch.is_primary:
            orphan = (
                ShopGodown.objects.filter(
                    tenant=tenant,
                    business=business,
                    branch__isnull=True,
                    is_active=True,
                    address_line1="",
                    latitude__isnull=True,
                    longitude__isnull=True,
                )
                .order_by("-is_default", "created_at")
                .first()
            )
            if orphan:
                orphan.branch = branch
                orphan.save(update_fields=["branch", "updated_at", "version"])
                return orphan
        return self.create_godown(
            tenant=tenant,
            business=business,
            name=branch.display_name or branch.branch_name,
            code=branch.branch_code[:32],
            is_default=branch.is_primary,
            branch=branch,
        )

    def sync_office_godowns(
        self,
        *,
        tenant: Tenant,
        business: Business,
    ) -> list[tuple[Branch, ShopGodown]]:
        branches = Branch.objects.filter(
            tenant=tenant, business=business, status=BranchStatus.ACTIVE
        ).order_by("-is_primary", "created_at")
        return [
            (branch, self.ensure_office_godown(tenant=tenant, business=business, branch=branch))
            for branch in branches
        ]

    def office_stock(
        self,
        *,
        tenant: Tenant,
        business: Business,
        product_ids: list[Any],
    ) -> dict[str, dict[str, Decimal]]:
        """Quantity on hand per office, keyed by branch id then product id."""
        rows = ShopGodownStock.objects.filter(
            tenant=tenant,
            business=business,
            product_id__in=product_ids,
            godown__branch__isnull=False,
            godown__is_active=True,
        ).values_list("godown__branch_id", "product_id", "quantity")
        stock: dict[str, dict[str, Decimal]] = {}
        for branch_id, product_id, quantity in rows:
            stock.setdefault(str(branch_id), {})[str(product_id)] = _q3(quantity)
        return stock

    def _adjust_godown_stock(
        self,
        *,
        tenant: Tenant,
        business: Business,
        godown: ShopGodown,
        product: ShopProduct,
        delta: Decimal,
        seed_quantity: Decimal | None = None,
        allow_negative: bool = False,
    ) -> ShopGodownStock:
        row, created = ShopGodownStock.objects.select_for_update().get_or_create(
            tenant=tenant,
            business=business,
            godown=godown,
            product=product,
            defaults={"quantity": Decimal("0.000")},
        )
        if created and seed_quantity is not None:
            other_exists = (
                ShopGodownStock.objects.filter(tenant=tenant, business=business, product=product)
                .exclude(id=row.id)
                .exists()
            )
            if not other_exists and _q3(seed_quantity) > 0:
                row.quantity = _q3(seed_quantity)
        new_qty = _q3(row.quantity) + _q3(delta)
        if new_qty < 0 and not allow_negative:
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
