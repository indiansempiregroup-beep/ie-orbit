from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from apps.shopie.models import (
    FulfillmentMode,
    ProfitChannel,
    ProfitFactKind,
    ShopOrder,
    ShopOrderLine,
    ShopReturn,
    ShopSaleProfitFact,
)


def money(value: Decimal | str | int | float | None) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.01"))


def dec_qty(value: Decimal | str | int | float | None) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.001"))


class ShopProfitFactService:
    """Append-only sold-profit ledger writes (sale / cancel / return)."""

    @staticmethod
    def channel_for_order(order: ShopOrder) -> str:
        mode = str(order.fulfillment_mode or "")
        if mode == FulfillmentMode.POS:
            return ProfitChannel.POS
        if mode == FulfillmentMode.DELIVERY:
            return ProfitChannel.ONLINE_DELIVERY
        return ProfitChannel.ONLINE_PICKUP

    @staticmethod
    def unit_cost_for_product(*, avg_cost, purchase_price) -> Decimal:
        avg = money(avg_cost)
        if avg > 0:
            return avg
        return money(purchase_price)

    @staticmethod
    def _line_tax_inclusive(line: ShopOrderLine) -> bool:
        product = getattr(line, "product", None)
        meta = getattr(product, "metadata", None) if product is not None else None
        if isinstance(meta, dict) and "tax_inclusive" in meta:
            return bool(meta.get("tax_inclusive"))
        # Fallback when metadata omitted: payable above shelf-after-line-discount
        # means GST was added on top (exclusive). Otherwise assume MRP-style inclusive
        # (matches product-create defaults in ops-mobile).
        gross = money(Decimal(str(line.unit_price)) * Decimal(str(line.quantity)))
        after_line = money(gross - money(line.discount_amount))
        if money(line.line_total) > after_line:
            return False
        return True

    def record_sale_facts(self, *, order: ShopOrder) -> int:
        lines = list(order.lines.select_related("product").all())
        if not lines:
            return 0
        channel = self.channel_for_order(order)
        sold_at = order.created_at or timezone.now()
        currency = order.currency or getattr(order.business, "currency", None) or "INR"
        created = 0
        for line in lines:
            qty = dec_qty(line.quantity)
            unit_sell = money(line.unit_price)
            unit_cost = money(line.purchase_price_snapshot)
            gross_sell = money(unit_sell * qty)
            line_disc = money(line.discount_amount)
            bill_share = self._bill_discount_share(line)
            net_revenue = money(gross_sell - line_disc - bill_share)
            if net_revenue < 0:
                net_revenue = Decimal("0.00")
            tax_collected = money(line.line_tax)
            amount_paid = money(line.line_total)
            cogs = money(qty * unit_cost)
            created += self._create_row(
                tenant_id=order.tenant_id,
                business_id=order.business_id,
                order_id=order.id,
                order_line_id=line.id,
                product_id=line.product_id,
                fact_kind=ProfitFactKind.SALE,
                source_id=order.id,
                sold_at=sold_at,
                channel=channel,
                order_number=order.order_number,
                product_name=line.product_name,
                sku=getattr(line.product, "sku", "") or "",
                quantity=qty,
                unit_sell_price=unit_sell,
                unit_purchase_cost=unit_cost,
                line_discount_amount=line_disc,
                bill_discount_share=bill_share,
                gross_sell=gross_sell,
                net_revenue=net_revenue,
                tax_collected=tax_collected,
                amount_paid=amount_paid,
                cogs=cogs,
                gross_profit=money(net_revenue - cogs),
                currency=currency,
            )
        return created

    def record_cancel_facts(self, *, order: ShopOrder) -> int:
        sales = list(
            ShopSaleProfitFact.objects.filter(
                tenant_id=order.tenant_id,
                business_id=order.business_id,
                order_id=order.id,
                fact_kind=ProfitFactKind.SALE,
            )
        )
        created = 0
        for sale in sales:
            created += self._create_reverse_from_sale(
                sale=sale,
                fact_kind=ProfitFactKind.CANCEL,
                source_id=order.id,
            )
        return created

    def record_return_facts(self, *, shop_return: ShopReturn) -> int:
        order = shop_return.order
        if order is None:
            return 0
        sales_by_line = {
            str(row.order_line_id): row
            for row in ShopSaleProfitFact.objects.filter(
                tenant_id=shop_return.tenant_id,
                business_id=shop_return.business_id,
                order_id=order.id,
                fact_kind=ProfitFactKind.SALE,
            )
        }
        created = 0
        for raw in shop_return.line_items or []:
            line_id = str(raw.get("order_line_id") or "")
            sale = sales_by_line.get(line_id)
            if sale is None:
                continue
            return_qty = dec_qty(raw.get("quantity"))
            if return_qty <= 0:
                continue
            sale_qty = abs(dec_qty(sale.quantity))
            if sale_qty <= 0:
                continue
            remaining = self._net_qty_for_line(
                tenant_id=shop_return.tenant_id,
                business_id=shop_return.business_id,
                order_line_id=sale.order_line_id,
            )
            qty = min(return_qty, remaining)
            if qty <= 0:
                continue
            fraction = qty / sale_qty
            # Keep RETURN on the original sale day so period profit, product history,
            # and daily series stay netted with the SALE (not orphaned on return day).
            created += self._create_reverse_from_sale(
                sale=sale,
                fact_kind=ProfitFactKind.RETURN,
                source_id=shop_return.id,
                quantity=qty,
                fraction=fraction,
            )
        return created

    def _net_qty_for_line(
        self,
        *,
        tenant_id: UUID,
        business_id: UUID,
        order_line_id: UUID,
    ) -> Decimal:
        agg = ShopSaleProfitFact.objects.filter(
            tenant_id=tenant_id,
            business_id=business_id,
            order_line_id=order_line_id,
        ).aggregate(total=Sum("quantity"))
        return dec_qty(agg.get("total") or 0)

    @classmethod
    def _bill_discount_share(cls, line: ShopOrderLine) -> Decimal:
        """Bill/loyalty discount allocated against shelf (price-field) amount."""
        gross = money(Decimal(str(line.unit_price)) * Decimal(str(line.quantity)))
        line_disc = money(line.discount_amount)
        after_line = money(gross - line_disc)
        if cls._line_tax_inclusive(line):
            # Inclusive: customer payable is the shelf amount.
            shelf_after = money(line.line_total)
        else:
            # Exclusive: shelf is ex-GST (line_subtotal, including after bill re-split).
            shelf_after = money(line.line_subtotal)
        share = money(after_line - shelf_after)
        return share if share > 0 else Decimal("0.00")

    def _create_reverse_from_sale(
        self,
        *,
        sale: ShopSaleProfitFact,
        fact_kind: str,
        source_id: UUID,
        quantity: Decimal | None = None,
        fraction: Decimal | None = None,
        sold_at=None,
    ) -> int:
        frac = fraction if fraction is not None else Decimal("1")
        qty_abs = quantity if quantity is not None else abs(dec_qty(sale.quantity))
        qty = dec_qty(qty_abs) * Decimal("-1")
        line_disc = money(money(sale.line_discount_amount) * frac) * Decimal("-1")
        bill_share = money(money(sale.bill_discount_share) * frac) * Decimal("-1")
        gross_sell = money(money(sale.gross_sell) * frac) * Decimal("-1")
        net_revenue = money(money(sale.net_revenue) * frac) * Decimal("-1")
        tax_collected = money(money(sale.tax_collected) * frac) * Decimal("-1")
        amount_paid = money(money(sale.amount_paid) * frac) * Decimal("-1")
        cogs = money(abs(qty_abs) * money(sale.unit_purchase_cost)) * Decimal("-1")
        return self._create_row(
            tenant_id=sale.tenant_id,
            business_id=sale.business_id,
            order_id=sale.order_id,
            order_line_id=sale.order_line_id,
            product_id=sale.product_id,
            fact_kind=fact_kind,
            source_id=source_id,
            sold_at=sold_at or sale.sold_at,
            channel=sale.channel,
            order_number=sale.order_number,
            product_name=sale.product_name,
            sku=sale.sku,
            quantity=qty,
            unit_sell_price=money(sale.unit_sell_price),
            unit_purchase_cost=money(sale.unit_purchase_cost),
            line_discount_amount=line_disc,
            bill_discount_share=bill_share,
            gross_sell=gross_sell,
            net_revenue=net_revenue,
            tax_collected=tax_collected,
            amount_paid=amount_paid,
            cogs=cogs,
            gross_profit=money(net_revenue - cogs),
            currency=sale.currency,
        )

    def _create_row(
        self,
        *,
        tenant_id: UUID,
        business_id: UUID,
        order_id: UUID,
        order_line_id: UUID,
        product_id: UUID,
        fact_kind: str,
        source_id: UUID,
        sold_at,
        channel: str,
        order_number: str,
        product_name: str,
        sku: str,
        quantity: Decimal,
        unit_sell_price: Decimal,
        unit_purchase_cost: Decimal,
        line_discount_amount: Decimal,
        bill_discount_share: Decimal,
        gross_sell: Decimal,
        net_revenue: Decimal,
        tax_collected: Decimal,
        amount_paid: Decimal,
        cogs: Decimal,
        gross_profit: Decimal,
        currency: str,
    ) -> int:
        try:
            with transaction.atomic():
                ShopSaleProfitFact.objects.create(
                    tenant_id=tenant_id,
                    business_id=business_id,
                    order_id=order_id,
                    order_line_id=order_line_id,
                    product_id=product_id,
                    fact_kind=fact_kind,
                    source_id=source_id,
                    sold_at=sold_at,
                    channel=channel,
                    order_number=order_number or "",
                    product_name=product_name or "",
                    sku=sku or "",
                    quantity=quantity,
                    unit_sell_price=unit_sell_price,
                    unit_purchase_cost=unit_purchase_cost,
                    line_discount_amount=line_discount_amount,
                    bill_discount_share=bill_discount_share,
                    gross_sell=gross_sell,
                    net_revenue=net_revenue,
                    tax_collected=tax_collected,
                    amount_paid=amount_paid,
                    cogs=cogs,
                    gross_profit=gross_profit,
                    currency=currency or "",
                )
            return 1
        except IntegrityError:
            return 0
