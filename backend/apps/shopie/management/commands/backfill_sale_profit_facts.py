from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.shopie.models import (
    OrderStatus,
    ReturnStatus,
    ShopOrder,
    ShopReturn,
    ShopSaleProfitFact,
    ShopStockMovement,
    StockMovementType,
)
from apps.shopie.services.profit_facts import ShopProfitFactService


class Command(BaseCommand):
    help = (
        "Backfill ShopSaleProfitFact rows from historical confirmed orders and completed returns. "
        "Deletes existing facts in scope first so shelf-profit / GST fields are rewritten."
    )

    def add_arguments(self, parser):
        parser.add_argument("--business-id", type=str, default="", help="Limit to one business UUID")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        business_id = str(options.get("business_id") or "").strip()
        dry_run = bool(options.get("dry_run"))
        svc = ShopProfitFactService()

        confirmed_statuses = {
            OrderStatus.CONFIRMED,
            OrderStatus.READY,
            OrderStatus.OUT_FOR_DELIVERY,
            OrderStatus.DELIVERY_FAILED,
            OrderStatus.COMPLETED,
            OrderStatus.CANCELLED,
        }
        orders = ShopOrder.objects.filter(status__in=confirmed_statuses)
        if business_id:
            orders = orders.filter(business_id=business_id)

        sale_count = 0
        cancel_count = 0
        return_count = 0
        skipped_pending_cancels = 0
        deleted = 0

        if not dry_run:
            facts_qs = ShopSaleProfitFact.objects.all()
            if business_id:
                facts_qs = facts_qs.filter(business_id=business_id)
            deleted, _ = facts_qs.delete()

        for order in orders.iterator(chunk_size=200):
            had_sale_stock = ShopStockMovement.objects.filter(
                tenant_id=order.tenant_id,
                business_id=order.business_id,
                order_id=order.id,
                movement_type=StockMovementType.SALE,
            ).exists()
            if order.status == OrderStatus.CANCELLED and not had_sale_stock:
                skipped_pending_cancels += 1
                continue
            if order.status != OrderStatus.CANCELLED and not had_sale_stock:
                # Confirmed path always writes SALE movement; if missing, still try facts for legacy.
                pass
            if dry_run:
                sale_count += order.lines.count()
                if order.status == OrderStatus.CANCELLED:
                    cancel_count += order.lines.count()
                continue
            sale_count += svc.record_sale_facts(order=order)
            if order.status == OrderStatus.CANCELLED:
                cancel_count += svc.record_cancel_facts(order=order)

        returns = ShopReturn.objects.filter(status=ReturnStatus.COMPLETED)
        if business_id:
            returns = returns.filter(business_id=business_id)
        for shop_return in returns.select_related("order").iterator(chunk_size=200):
            if dry_run:
                return_count += len(shop_return.line_items or [])
                continue
            return_count += svc.record_return_facts(shop_return=shop_return)

        self.stdout.write(
            self.style.SUCCESS(
                "Backfill complete "
                f"(dry_run={dry_run}): deleted={deleted} sales={sale_count} cancels={cancel_count} "
                f"returns={return_count} skipped_pending_cancels={skipped_pending_cancels}"
            )
        )
