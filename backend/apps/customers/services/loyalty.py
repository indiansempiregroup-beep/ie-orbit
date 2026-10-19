from __future__ import annotations

from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal
from typing import Any

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import transaction
from django.db.models import F

from apps.businesses.constants import DEFAULT_LOYALTY_PREFERENCES, FEATURE_REWARD_POINTS
from apps.businesses.services.entitlements import EntitlementService
from apps.customers.models import Customer, CustomerLoyaltyAccount, CustomerLoyaltyLedger
from apps.services.models import Service, ServicePricing


class LoyaltyService:
    def __init__(self, *, entitlements: EntitlementService | None = None) -> None:
        self.entitlements = entitlements or EntitlementService()

    def get_loyalty_preferences(self, *, business: Any) -> dict[str, Any]:
        try:
            settings = business.settings
        except ObjectDoesNotExist:
            settings = None
        raw = getattr(settings, "loyalty_preferences", None) or {}
        if not isinstance(raw, dict):
            raw = {}
        merged = dict(DEFAULT_LOYALTY_PREFERENCES)
        merged.update({k: v for k, v in raw.items() if k in DEFAULT_LOYALTY_PREFERENCES})
        try:
            merged["points_per_currency_unit"] = max(
                1, int(merged.get("points_per_currency_unit") or 10)
            )
        except (TypeError, ValueError):
            merged["points_per_currency_unit"] = 10
        try:
            merged["max_redeem_percent"] = min(
                100, max(0, int(merged.get("max_redeem_percent") or 50))
            )
        except (TypeError, ValueError):
            merged["max_redeem_percent"] = 50
        try:
            merged["min_redeem_points"] = max(0, int(merged.get("min_redeem_points") or 10))
        except (TypeError, ValueError):
            merged["min_redeem_points"] = 10
        try:
            merged["earn_points_per_100"] = max(0, int(merged.get("earn_points_per_100") or 0))
        except (TypeError, ValueError):
            merged["earn_points_per_100"] = 1
        merged["enabled"] = bool(merged.get("enabled"))
        self._overlay_legacy_shop_loyalty(business=business, stored=raw, merged=merged)
        return merged

    def _overlay_legacy_shop_loyalty(
        self, *, business: Any, stored: dict[str, Any], merged: dict[str, Any]
    ) -> None:
        if "earn_points_per_100" in stored and stored.get("earn_points_per_100") is not None:
            return
        legacy = self._legacy_shop_loyalty(business=business)
        if not legacy:
            if "earn_points_per_100" not in stored:
                merged["earn_points_per_100"] = int(
                    DEFAULT_LOYALTY_PREFERENCES.get("earn_points_per_100") or 1
                )
            return
        try:
            merged["earn_points_per_100"] = max(0, int(legacy.get("points_per_100") or 1))
        except (TypeError, ValueError):
            merged["earn_points_per_100"] = 1
        if "enabled" not in stored and legacy.get("enabled"):
            merged["enabled"] = True
        if "points_per_currency_unit" not in stored:
            try:
                redeem_value = Decimal(str(legacy.get("redeem_value") or "0"))
            except (TypeError, ValueError, ArithmeticError):
                redeem_value = Decimal("0")
            if redeem_value > 0:
                merged["points_per_currency_unit"] = max(
                    1, int((Decimal("1") / redeem_value).to_integral_value(rounding=ROUND_HALF_UP))
                )

    def _legacy_shop_loyalty(self, *, business: Any) -> dict[str, Any]:
        try:
            shop_settings = business.shop_settings
        except Exception:
            return {}
        metadata = getattr(shop_settings, "metadata", None) or {}
        if not isinstance(metadata, dict):
            return {}
        grow = metadata.get("grow")
        if not isinstance(grow, dict):
            return {}
        loyalty = grow.get("loyalty")
        return loyalty if isinstance(loyalty, dict) else {}

    def has_plan_entitlement(self, *, business: Any) -> bool:
        entitled, _locked = self.entitlements.loyalty_program_access(business=business)
        return entitled

    def is_program_active(self, *, business: Any) -> bool:
        if not self.has_plan_entitlement(business=business):
            return False
        prefs = self.get_loyalty_preferences(business=business)
        return bool(prefs.get("enabled"))

    def get_program_summary(self, *, business: Any) -> dict[str, Any]:
        prefs = self.get_loyalty_preferences(business=business)
        plan_ok = self.has_plan_entitlement(business=business)
        enabled = bool(prefs.get("enabled")) and plan_ok
        return {
            "enabled": enabled,
            "plan_entitled": plan_ok,
            "points_per_currency_unit": prefs["points_per_currency_unit"],
            "max_redeem_percent": prefs["max_redeem_percent"],
            "min_redeem_points": prefs["min_redeem_points"],
            "earn_points_per_100": prefs["earn_points_per_100"],
            "currency": getattr(business, "currency", None) or "INR",
        }

    def normalize_loyalty_preferences(self, *, business: Any, data: dict[str, Any]) -> dict[str, Any]:
        current = self.get_loyalty_preferences(business=business)
        next_prefs = dict(current)
        if "enabled" in data:
            next_prefs["enabled"] = bool(data["enabled"])
        if "points_per_currency_unit" in data:
            try:
                next_prefs["points_per_currency_unit"] = max(
                    1, int(data["points_per_currency_unit"])
                )
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    {"loyalty_preferences": "points_per_currency_unit must be a positive integer."}
                ) from exc
        if "max_redeem_percent" in data:
            try:
                next_prefs["max_redeem_percent"] = min(100, max(0, int(data["max_redeem_percent"])))
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    {"loyalty_preferences": "max_redeem_percent must be between 0 and 100."}
                ) from exc
        if "min_redeem_points" in data:
            try:
                next_prefs["min_redeem_points"] = max(0, int(data["min_redeem_points"]))
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    {"loyalty_preferences": "min_redeem_points must be a non-negative integer."}
                ) from exc
        if "earn_points_per_100" in data:
            try:
                next_prefs["earn_points_per_100"] = max(0, int(data["earn_points_per_100"]))
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    {"loyalty_preferences": "earn_points_per_100 must be a non-negative integer."}
                ) from exc
        if next_prefs["enabled"]:
            self.entitlements.ensure_loyalty_program(business=business)
        return next_prefs

    @transaction.atomic
    def ensure_account(self, *, tenant: Any, business: Any, customer: Customer) -> CustomerLoyaltyAccount:
        account, _ = CustomerLoyaltyAccount.objects.get_or_create(
            tenant=tenant,
            business=business,
            customer=customer,
            defaults={"points_balance": 0},
        )
        return account

    def get_balance(self, *, tenant: Any, business: Any, customer: Customer) -> dict[str, Any]:
        program = self.get_program_summary(business=business)
        if not program["enabled"]:
            return {
                "enabled": False,
                "points_balance": 0,
                "program": program,
                "ledger": [],
            }
        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        ledger = (
            CustomerLoyaltyLedger.objects.require_tenant(tenant)
            .filter(account=account)
            .order_by("-created_at")[:20]
        )
        return {
            "enabled": True,
            "points_balance": account.points_balance,
            "program": program,
            "ledger": [
                {
                    "id": str(entry.id),
                    "points_delta": entry.points_delta,
                    "reason": entry.reason,
                    "booking_id": str(entry.booking_id) if entry.booking_id else None,
                    "order_id": str(entry.order_id) if entry.order_id else None,
                    "voucher_id": str(entry.voucher_id) if entry.voucher_id else None,
                    "created_at": entry.created_at,
                }
                for entry in ledger
            ],
        }

    def _serialize_ledger_entry(self, entry: CustomerLoyaltyLedger) -> dict[str, Any]:
        customer = getattr(entry, "customer", None)
        display_name = ""
        if customer is not None:
            display_name = (
                getattr(customer, "display_name", None)
                or " ".join(
                    part
                    for part in [
                        getattr(customer, "first_name", "") or "",
                        getattr(customer, "last_name", "") or "",
                    ]
                    if part
                ).strip()
                or getattr(customer, "phone_number", "")
                or ""
            )
        meta = entry.metadata if isinstance(entry.metadata, dict) else {}
        entry_type = str(meta.get("type") or "")
        direction = "given" if int(entry.points_delta or 0) > 0 else "used" if int(entry.points_delta or 0) < 0 else "other"
        return {
            "id": str(entry.id),
            "customer_id": str(entry.customer_id) if entry.customer_id else None,
            "customer_name": display_name,
            "points_delta": int(entry.points_delta or 0),
            "reason": entry.reason or "",
            "entry_type": entry_type,
            "direction": direction,
            "booking_id": str(entry.booking_id) if entry.booking_id else None,
            "order_id": str(entry.order_id) if entry.order_id else None,
            "voucher_id": str(entry.voucher_id) if entry.voucher_id else None,
            "order_number": "",
            "booking_number": "",
            "voucher_number": "",
            "voucher_type": "",
            "source_label": "",
            "invoice_voucher_id": "",
            "linked_order_id": "",
            "gross_profit": None,
            "redeem_discount_amount": None,
            "record_points_earned": 0,
            "record_points_redeemed": 0,
            "record_label": "",
            "record_kind": "",
            "created_at": entry.created_at,
        }

    def _enrich_ledger_links(
        self, *, tenant: Any, business: Any, entries: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        if not entries:
            return entries
        order_ids = [row["order_id"] for row in entries if row.get("order_id")]
        booking_ids = [row["booking_id"] for row in entries if row.get("booking_id")]
        voucher_ids = [row["voucher_id"] for row in entries if row.get("voucher_id")]

        order_map: dict[str, dict[str, str]] = {}
        booking_map: dict[str, str] = {}
        voucher_map: dict[str, dict[str, str]] = {}

        def _source_from_fulfillment(mode: str) -> str:
            key = (mode or "").strip().lower()
            if key == "pos":
                return "POS"
            if key in {"pickup", "online_pickup"}:
                return "Online order"
            if key in {"delivery", "online_delivery"}:
                return "Online order"
            return ""

        order_voucher_map: dict[str, str] = {}
        booking_voucher_map: dict[str, str] = {}

        if order_ids:
            from apps.shopie.models import ShopOrder, ShopBooksVoucher

            for row in (
                ShopOrder.objects.require_tenant(tenant)
                .filter(business=business, id__in=order_ids)
                .values("id", "order_number", "fulfillment_mode")
            ):
                order_map[str(row["id"])] = {
                    "order_number": str(row["order_number"] or ""),
                    "fulfillment_mode": str(row["fulfillment_mode"] or ""),
                }
            for row in (
                ShopBooksVoucher.objects.require_tenant(tenant)
                .filter(business=business, voucher_type="sale", linked_order_id__in=order_ids)
                .order_by("-created_at")
                .values("id", "linked_order_id")
            ):
                linked = str(row["linked_order_id"] or "")
                if linked and linked not in order_voucher_map:
                    order_voucher_map[linked] = str(row["id"])

        if booking_ids:
            from apps.bookings.models import Booking
            from apps.shopie.models import ShopBooksVoucher

            for row in (
                Booking.objects.require_tenant(tenant)
                .filter(business=business, id__in=booking_ids)
                .values("id", "booking_number")
            ):
                booking_map[str(row["id"])] = str(row["booking_number"] or "")
            booking_id_strs = [str(value) for value in booking_ids]
            for row in (
                ShopBooksVoucher.objects.require_tenant(tenant)
                .filter(
                    business=business,
                    voucher_type="sale",
                    metadata__source_booking_id__in=booking_id_strs,
                )
                .order_by("-created_at")
                .values("id", "metadata")
            ):
                meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
                booking_key = str(meta.get("source_booking_id") or "")
                if booking_key and booking_key not in booking_voucher_map:
                    booking_voucher_map[booking_key] = str(row["id"])

        if voucher_ids:
            from apps.shopie.models import ShopBooksVoucher, ShopOrder

            voucher_rows = list(
                ShopBooksVoucher.objects.require_tenant(tenant)
                .filter(business=business, id__in=voucher_ids)
                .values("id", "voucher_number", "voucher_type", "linked_order_id", "metadata")
            )
            linked_order_ids = [
                row["linked_order_id"] for row in voucher_rows if row.get("linked_order_id")
            ]
            linked_mode_map: dict[str, str] = {}
            if linked_order_ids:
                for row in (
                    ShopOrder.objects.require_tenant(tenant)
                    .filter(business=business, id__in=linked_order_ids)
                    .values("id", "fulfillment_mode")
                ):
                    linked_mode_map[str(row["id"])] = str(row["fulfillment_mode"] or "")

            for row in voucher_rows:
                meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
                linked_id = str(row["linked_order_id"] or "")
                mode = str(
                    meta.get("fulfillment_mode")
                    or linked_mode_map.get(linked_id)
                    or meta.get("channel")
                    or ""
                )
                source = str(meta.get("source") or "").strip().lower()
                if source == "booking" or meta.get("source_booking_id"):
                    source_label = "Booking"
                else:
                    source_label = _source_from_fulfillment(mode) or (
                        "Online order" if linked_id else "Books sale"
                    )
                voucher_map[str(row["id"])] = {
                    "voucher_number": str(row["voucher_number"] or ""),
                    "voucher_type": str(row["voucher_type"] or ""),
                    "source_label": source_label,
                    "linked_order_id": linked_id,
                }

        for row in entries:
            order_info = order_map.get(str(row.get("order_id") or ""), {})
            order_number = order_info.get("order_number", "")
            booking_number = booking_map.get(str(row.get("booking_id") or ""), "")
            voucher_info = voucher_map.get(str(row.get("voucher_id") or ""), {})
            voucher_number = voucher_info.get("voucher_number", "")
            voucher_type = voucher_info.get("voucher_type", "")
            row["order_number"] = order_number
            row["booking_number"] = booking_number
            row["voucher_number"] = voucher_number
            row["voucher_type"] = voucher_type
            row["invoice_voucher_id"] = ""
            row["linked_order_id"] = ""
            if order_number or row.get("order_id"):
                order_id = str(row.get("order_id") or "")
                row["record_kind"] = "order"
                row["record_label"] = order_number or "Order"
                row["source_label"] = _source_from_fulfillment(
                    order_info.get("fulfillment_mode", "")
                ) or "Online order"
                row["linked_order_id"] = order_id
                row["invoice_voucher_id"] = order_voucher_map.get(order_id, "")
            elif booking_number or row.get("booking_id"):
                booking_id = str(row.get("booking_id") or "")
                row["record_kind"] = "booking"
                row["record_label"] = booking_number or "Booking"
                row["source_label"] = "Booking"
                row["invoice_voucher_id"] = booking_voucher_map.get(booking_id, "")
            elif voucher_number or row.get("voucher_id"):
                # Shop Books accounting document (GST sale / purchase invoice, etc.)
                voucher_id = str(row.get("voucher_id") or "")
                row["record_kind"] = "voucher"
                row["source_label"] = voucher_info.get("source_label", "") or "Books sale"
                row["invoice_voucher_id"] = voucher_id
                row["linked_order_id"] = voucher_info.get("linked_order_id", "")
                if voucher_type == "sale":
                    row["record_label"] = voucher_number or "Books sale"
                elif voucher_type == "purchase":
                    row["record_label"] = voucher_number or "Books purchase"
                    row["source_label"] = "Books purchase"
                else:
                    row["record_label"] = voucher_number or "Books entry"
            else:
                row["record_kind"] = ""
                row["record_label"] = ""
                row["source_label"] = ""

        # Sold profit for shop orders only (never for bookings).
        profit_order_ids: set[str] = set()
        for row in entries:
            if row.get("record_kind") == "booking" or row.get("source_label") == "Booking":
                row["gross_profit"] = None
                continue
            order_for_profit = str(row.get("linked_order_id") or row.get("order_id") or "").strip()
            if order_for_profit:
                profit_order_ids.add(order_for_profit)
            else:
                row["gross_profit"] = None

        profit_map: dict[str, str] = {}
        if profit_order_ids:
            from decimal import Decimal

            from django.db.models import Sum

            from apps.shopie.models import ShopSaleProfitFact

            for agg in (
                ShopSaleProfitFact.objects.require_tenant(tenant)
                .filter(business=business, order_id__in=list(profit_order_ids))
                .values("order_id")
                .annotate(total=Sum("gross_profit"))
            ):
                total = Decimal(str(agg.get("total") or "0")).quantize(Decimal("0.01"))
                profit_map[str(agg["order_id"])] = f"{total:.2f}"

        for row in entries:
            if row.get("record_kind") == "booking" or row.get("source_label") == "Booking":
                row["gross_profit"] = None
                continue
            order_for_profit = str(row.get("linked_order_id") or row.get("order_id") or "").strip()
            row["gross_profit"] = profit_map.get(order_for_profit) if order_for_profit else None

        entries = self._enrich_record_point_activity(
            tenant=tenant, business=business, entries=entries
        )
        return self._collapse_linked_ledger_rows(entries)

    @staticmethod
    def _ledger_link_key(row: dict[str, Any]) -> str:
        if row.get("order_id"):
            return f"o:{row['order_id']}"
        if row.get("voucher_id"):
            return f"v:{row['voucher_id']}"
        if row.get("booking_id"):
            return f"b:{row['booking_id']}"
        return f"id:{row.get('id') or ''}"

    def _enrich_record_point_activity(
        self, *, tenant: Any, business: Any, entries: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Attach earn + redeem totals (and redeem money given) for the linked sale/booking."""
        if not entries:
            return entries
        from decimal import Decimal

        from django.db.models import Q

        order_ids = [row["order_id"] for row in entries if row.get("order_id")]
        voucher_ids = [row["voucher_id"] for row in entries if row.get("voucher_id")]
        booking_ids = [row["booking_id"] for row in entries if row.get("booking_id")]

        activity: dict[str, dict[str, Any]] = {}

        def _ensure(key: str) -> dict[str, Any]:
            if key not in activity:
                activity[key] = {
                    "earned": 0,
                    "redeemed": 0,
                    "discount": Decimal("0.00"),
                }
            return activity[key]

        related = CustomerLoyaltyLedger.objects.require_tenant(tenant).filter(business=business)
        filters = Q()
        if order_ids:
            filters |= Q(order_id__in=order_ids)
        if voucher_ids:
            filters |= Q(voucher_id__in=voucher_ids)
        if booking_ids:
            filters |= Q(booking_id__in=booking_ids)
        if not filters:
            for row in entries:
                delta = int(row.get("points_delta") or 0)
                row["record_points_earned"] = delta if delta > 0 else 0
                row["record_points_redeemed"] = abs(delta) if delta < 0 else 0
                row["redeem_discount_amount"] = None
            return entries

        for entry in related.filter(filters).only(
            "order_id", "voucher_id", "booking_id", "points_delta", "metadata"
        ):
            key = self._ledger_link_key(
                {
                    "order_id": str(entry.order_id) if entry.order_id else None,
                    "voucher_id": str(entry.voucher_id) if entry.voucher_id else None,
                    "booking_id": str(entry.booking_id) if entry.booking_id else None,
                    "id": str(entry.id),
                }
            )
            bucket = _ensure(key)
            delta = int(entry.points_delta or 0)
            meta = entry.metadata if isinstance(entry.metadata, dict) else {}
            meta_type = str(meta.get("type") or "").strip().lower()
            # Return clawbacks are earn reversals — not customer redemptions.
            if delta > 0:
                bucket["earned"] += delta
            elif meta_type == "earn_reversal":
                bucket["earned"] -= abs(delta)
            elif delta < 0:
                bucket["redeemed"] += abs(delta)
            if meta_type == "redeem":
                try:
                    bucket["discount"] += Decimal(str(meta.get("discount_amount") or "0"))
                except Exception:
                    pass

        for row in entries:
            key = self._ledger_link_key(row)
            bucket = activity.get(key)
            if bucket is None:
                delta = int(row.get("points_delta") or 0)
                meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
                meta_type = str(meta.get("type") or "").strip().lower()
                if delta > 0:
                    row["record_points_earned"] = delta
                    row["record_points_redeemed"] = 0
                elif meta_type == "earn_reversal":
                    row["record_points_earned"] = 0
                    row["record_points_redeemed"] = 0
                    row["points_delta"] = delta
                    row["direction"] = "given"
                    row["redeem_discount_amount"] = None
                    continue
                else:
                    row["record_points_earned"] = 0
                    row["record_points_redeemed"] = abs(delta) if delta < 0 else 0
                row["redeem_discount_amount"] = None
                continue
            row["record_points_earned"] = max(0, int(bucket["earned"]))
            row["record_points_redeemed"] = max(0, int(bucket["redeemed"]))
            discount = Decimal(str(bucket["discount"] or 0)).quantize(Decimal("0.01"))
            row["redeem_discount_amount"] = f"{discount:.2f}" if discount > 0 else None

            # Shop profit facts already reduce revenue for reward discounts. Still expose the
            # gift amount; for bookings leave profit empty.
            if row.get("record_kind") == "booking" or row.get("source_label") == "Booking":
                row["gross_profit"] = None
            elif row.get("gross_profit") is None and discount > 0:
                # No sale-profit facts (e.g. pure books without order): show the money given as loss.
                row["gross_profit"] = f"{(-discount):.2f}"

            earned = int(row["record_points_earned"])
            redeemed = int(row["record_points_redeemed"])
            if earned and redeemed:
                row["direction"] = "both"
                row["points_delta"] = earned - redeemed
                if not (row.get("reason") or "").strip():
                    row["reason"] = "Points given and used"
                elif "given and used" not in (row.get("reason") or "").lower():
                    # Keep original reason; UI shows both point totals.
                    pass
            elif earned:
                row["direction"] = "given"
                row["points_delta"] = earned
            elif redeemed:
                row["direction"] = "used"
                row["points_delta"] = -redeemed
            else:
                # Fully clawed-back earn (e.g. full return) — keep a quiet given row at 0.
                row["direction"] = "given"
                row["points_delta"] = 0

        return entries

    def _collapse_linked_ledger_rows(self, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """One row per linked sale/booking when earn + redeem both appear on the page."""
        if len(entries) < 2:
            return entries
        grouped: dict[str, dict[str, Any]] = {}
        order_keys: list[str] = []
        for row in entries:
            key = self._ledger_link_key(row)
            if key.startswith("id:"):
                grouped[f"solo:{row.get('id')}"] = row
                order_keys.append(f"solo:{row.get('id')}")
                continue
            existing = grouped.get(key)
            if existing is None:
                grouped[key] = row
                order_keys.append(key)
                continue
            # Prefer the newer entry's timestamp label stack; keep combined point fields.
            existing_created = existing.get("created_at")
            row_created = row.get("created_at")
            keep = existing
            other = row
            if row_created and existing_created and row_created > existing_created:
                keep = row
                other = existing
            keep["record_points_earned"] = max(
                int(keep.get("record_points_earned") or 0),
                int(other.get("record_points_earned") or 0),
                int(keep.get("points_delta") or 0) if int(keep.get("points_delta") or 0) > 0 else 0,
                int(other.get("points_delta") or 0) if int(other.get("points_delta") or 0) > 0 else 0,
            )
            keep["record_points_redeemed"] = max(
                int(keep.get("record_points_redeemed") or 0),
                int(other.get("record_points_redeemed") or 0),
                abs(int(keep.get("points_delta") or 0))
                if int(keep.get("points_delta") or 0) < 0
                else 0,
                abs(int(other.get("points_delta") or 0))
                if int(other.get("points_delta") or 0) < 0
                else 0,
            )
            if keep.get("redeem_discount_amount") in (None, "", "0", "0.00") and other.get(
                "redeem_discount_amount"
            ):
                keep["redeem_discount_amount"] = other.get("redeem_discount_amount")
            if keep.get("gross_profit") is None and other.get("gross_profit") is not None:
                keep["gross_profit"] = other.get("gross_profit")
            earned = int(keep.get("record_points_earned") or 0)
            redeemed = int(keep.get("record_points_redeemed") or 0)
            if earned and redeemed:
                keep["direction"] = "both"
                keep["points_delta"] = earned - redeemed
                keep["reason"] = "Points given and used"
            elif earned:
                keep["direction"] = "given"
                keep["points_delta"] = earned
            elif redeemed:
                keep["direction"] = "used"
                keep["points_delta"] = -redeemed
            grouped[key] = keep
        return [grouped[key] for key in order_keys if key in grouped]

    def business_ledger_report(
        self,
        *,
        tenant: Any,
        business: Any,
        date_from: str | None = None,
        date_to: str | None = None,
        customer_id: str | None = None,
        direction: str | None = None,
        entry_type: str | None = None,
        q: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> dict[str, Any]:
        from django.db.models import Q, Sum
        from django.db.models.functions import Coalesce
        from django.utils.dateparse import parse_date

        program = self.get_program_summary(business=business)
        qs = (
            CustomerLoyaltyLedger.objects.require_tenant(tenant)
            .filter(business=business)
            .select_related("customer")
            .order_by("-created_at")
        )
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if date_from:
            parsed = parse_date(date_from)
            if parsed:
                qs = qs.filter(created_at__date__gte=parsed)
        if date_to:
            parsed = parse_date(date_to)
            if parsed:
                qs = qs.filter(created_at__date__lte=parsed)

        direction_key = (direction or "all").strip().lower()
        if direction_key in {"given", "earn", "earned"}:
            qs = qs.filter(Q(points_delta__gt=0) | Q(metadata__type="earn_reversal"))
        elif direction_key in {"used", "redeem", "redeemed"}:
            # Real redemptions only — return clawbacks are earn reversals.
            qs = qs.filter(points_delta__lt=0).exclude(metadata__type="earn_reversal")

        type_key = (entry_type or "").strip().lower()
        if type_key:
            qs = qs.filter(metadata__type=type_key)

        search = (q or "").strip()
        if search:
            qs = qs.filter(
                Q(reason__icontains=search)
                | Q(customer__first_name__icontains=search)
                | Q(customer__last_name__icontains=search)
                | Q(customer__phone_number__icontains=search)
                | Q(customer__display_name__icontains=search)
            )

        from decimal import Decimal

        gross_earned = int(
            qs.filter(points_delta__gt=0).aggregate(total=Coalesce(Sum("points_delta"), 0))["total"]
            or 0
        )
        reversal_raw = int(
            qs.filter(points_delta__lt=0, metadata__type="earn_reversal").aggregate(
                total=Coalesce(Sum("points_delta"), 0)
            )["total"]
            or 0
        )
        earned = max(0, gross_earned - abs(reversal_raw))
        redeemed_raw = int(
            qs.filter(points_delta__lt=0)
            .exclude(metadata__type="earn_reversal")
            .aggregate(total=Coalesce(Sum("points_delta"), 0))["total"]
            or 0
        )
        redeemed = abs(redeemed_raw)
        # Money given to customers via point redemptions in this filter window.
        redeem_discount_total = Decimal("0.00")
        for meta in (
            qs.filter(points_delta__lt=0, metadata__type="redeem")
            .exclude(metadata={})
            .values_list("metadata", flat=True)[:5000]
        ):
            if not isinstance(meta, dict):
                continue
            try:
                redeem_discount_total += Decimal(str(meta.get("discount_amount") or "0"))
            except Exception:
                continue
        redeem_discount_total = redeem_discount_total.quantize(Decimal("0.01"))
        total_count = qs.count()
        cap = max(1, min(int(limit or 200), 500))
        start = max(0, int(offset or 0))
        if start >= total_count and total_count > 0:
            start = (max(0, (total_count - 1) // cap)) * cap
        entries = [self._serialize_ledger_entry(row) for row in qs[start : start + cap]]
        entries = self._enrich_ledger_links(tenant=tenant, business=business, entries=entries)
        total_pages = max(1, (total_count + cap - 1) // cap) if total_count else 1
        page = (start // cap) + 1 if total_count else 1
        return {
            "enabled": bool(program.get("enabled")),
            "program": program,
            "date_from": date_from or "",
            "date_to": date_to or "",
            "direction": direction_key if direction_key else "all",
            "entry_type": type_key,
            "q": search,
            "limit": cap,
            "offset": start,
            "page": page,
            "page_size": cap,
            "total_pages": total_pages,
            "summary": {
                "points_earned": earned,
                "points_redeemed": redeemed,
                "net_points": earned - redeemed,
                "entry_count": total_count,
                "redeem_discount_total": f"{redeem_discount_total:.2f}",
            },
            "ledger_total": total_count,
            "has_next": start + cap < total_count,
            "has_previous": start > 0,
            "ledger": entries,
        }

    def resolve_service_price(self, *, tenant: Any, service_id: Any) -> Decimal:
        pricing = (
            ServicePricing.objects.require_tenant(tenant)
            .filter(service_id=service_id, is_default=True)
            .order_by("id")
            .first()
        )
        if pricing is None:
            pricing = (
                ServicePricing.objects.require_tenant(tenant)
                .filter(service_id=service_id)
                .order_by("id")
                .first()
            )
        if pricing is None:
            return Decimal("0.00")
        if pricing.sale_price is not None:
            return Decimal(pricing.sale_price)
        return Decimal(pricing.base_price or 0)

    def quote_redemption(
        self,
        *,
        business: Any,
        points_to_redeem: int,
        service_id: Any | None = None,
        amount: Decimal | str | int | float | None = None,
        points_balance: int | None = None,
    ) -> dict[str, Any]:
        if not self.is_program_active(business=business):
            raise ValidationError({"points_to_redeem": "Reward points are not enabled for this business."})
        prefs = self.get_loyalty_preferences(business=business)
        points = int(points_to_redeem or 0)
        if points <= 0:
            raise ValidationError({"points_to_redeem": "Select a positive number of points to redeem."})
        min_points = int(prefs["min_redeem_points"])
        if points < min_points:
            raise ValidationError(
                {"points_to_redeem": f"Minimum redeem is {min_points} points."}
            )
        if points_balance is not None and points > int(points_balance):
            raise ValidationError({"points_to_redeem": "Insufficient reward points balance."})

        if amount is None:
            if service_id is None:
                raise ValidationError({"points_to_redeem": "A price is required to quote redemption."})
            eligible = self.resolve_service_price(tenant=business.tenant, service_id=service_id)
        else:
            eligible = Decimal(str(amount or "0")).quantize(Decimal("0.01"))
        if eligible < 0:
            eligible = Decimal("0.00")

        rate = int(prefs["points_per_currency_unit"])
        discount = (Decimal(points) / Decimal(rate)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        max_percent = int(prefs["max_redeem_percent"])
        max_discount = (eligible * Decimal(max_percent) / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        if discount > max_discount:
            raise ValidationError(
                {
                    "points_to_redeem": (
                        f"Redeem is capped at {max_percent}% of the price "
                        f"(max {max_discount} off)."
                    )
                }
            )
        currency = getattr(business, "currency", None) or "INR"
        return {
            "points_redeemed": points,
            "discount_amount": str(discount),
            "currency": currency,
            "rate": rate,
            "service_price": str(eligible),
            "max_discount_amount": str(max_discount),
        }

    def earn_points_for_spend(self, *, business: Any, amount: Decimal | str | int | float) -> int:
        if not self.is_program_active(business=business):
            return 0
        prefs = self.get_loyalty_preferences(business=business)
        rate = int(prefs["earn_points_per_100"] or 0)
        if rate <= 0:
            return 0
        spent = Decimal(str(amount or "0"))
        if spent <= 0:
            return 0
        return int((spent * Decimal(rate) / Decimal("100")).to_integral_value(rounding=ROUND_DOWN))

    def _lock_account(
        self, *, tenant: Any, business: Any, customer: Customer
    ) -> CustomerLoyaltyAccount:
        account = (
            CustomerLoyaltyAccount.objects.select_for_update()
            .filter(tenant=tenant, business=business, customer=customer)
            .first()
        )
        if account is None:
            self.ensure_account(tenant=tenant, business=business, customer=customer)
            account = (
                CustomerLoyaltyAccount.objects.select_for_update()
                .filter(tenant=tenant, business=business, customer=customer)
                .first()
            )
        assert account is not None
        return account

    def _ledger_qs(
        self,
        *,
        tenant: Any,
        booking_id: Any = None,
        order_id: Any = None,
        voucher_id: Any = None,
    ):
        qs = CustomerLoyaltyLedger.objects.require_tenant(tenant)
        if booking_id is not None:
            qs = qs.filter(booking_id=booking_id)
        if order_id is not None:
            qs = qs.filter(order_id=order_id)
        if voucher_id is not None:
            qs = qs.filter(voucher_id=voucher_id)
        return qs

    def expected_earn_for_booking_services(
        self,
        *,
        tenant: Any,
        business: Any,
        service_ids: list[Any],
    ) -> int:
        """Sum of per-service loyalty_points_earn (booking earn model, not shop spend)."""
        if not self.is_program_active(business=business):
            return 0
        ids = [sid for sid in service_ids if sid]
        if not ids:
            return 0
        total = 0
        for service in Service.objects.require_tenant(tenant).filter(
            id__in=ids, business=business
        ):
            total += max(0, int(service.loyalty_points_earn or 0))
        return int(total)

    def expected_earn_for_booking(self, *, tenant: Any, business: Any, booking: Any) -> int:
        line_manager = getattr(booking, "line_items", None)
        if line_manager is not None and hasattr(line_manager, "all"):
            line_items = list(line_manager.all())
        else:
            line_items = list(line_manager or [])
        if line_items:
            return self.expected_earn_for_booking_services(
                tenant=tenant,
                business=business,
                service_ids=[item.service_id for item in line_items],
            )
        service_id = getattr(booking, "service_id", None)
        if service_id:
            return self.expected_earn_for_booking_services(
                tenant=tenant, business=business, service_ids=[service_id]
            )
        return 0

    def credited_earn_for_booking(self, *, tenant: Any, booking_id: Any) -> int:
        row = (
            self._ledger_qs(tenant=tenant, booking_id=booking_id)
            .filter(points_delta__gt=0, metadata__type="earn")
            .order_by("-created_at")
            .first()
        )
        return int(row.points_delta) if row is not None else 0

    @transaction.atomic
    def award_for_completed_booking(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        booking_id: Any,
        service_id: Any | None = None,
    ) -> CustomerLoyaltyAccount | None:
        if not self.is_program_active(business=business):
            return None
        points = self.expected_earn_for_booking_services(
            tenant=tenant,
            business=business,
            service_ids=[service_id] if service_id else [],
        )
        service_name = ""
        if service_id:
            service = (
                Service.objects.require_tenant(tenant)
                .filter(id=service_id, business=business)
                .first()
            )
            if service is not None:
                service_name = service.display_name or service.name
        if points <= 0:
            return None
        already = (
            self._ledger_qs(tenant=tenant, booking_id=booking_id)
            .filter(points_delta__gt=0, metadata__type="earn")
            .exists()
        )
        if already:
            return None
        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        account.points_balance = int(account.points_balance) + points
        account.save(update_fields=["points_balance", "updated_at"])
        reason = f"Completed booking — {service_name}" if service_name else "Completed booking"
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=points,
            reason=reason[:160],
            booking_id=booking_id,
            metadata={"type": "earn", "feature": FEATURE_REWARD_POINTS},
        )
        return account

    @transaction.atomic
    def award_for_completed_booking_items(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        booking_id: Any,
        line_items: list[Any],
    ) -> CustomerLoyaltyAccount | None:
        if not self.is_program_active(business=business):
            return None
        already = (
            self._ledger_qs(tenant=tenant, booking_id=booking_id)
            .filter(points_delta__gt=0, metadata__type="earn")
            .exists()
        )
        if already:
            return None

        service_ids = [item.service_id for item in line_items]
        total_points = self.expected_earn_for_booking_services(
            tenant=tenant, business=business, service_ids=service_ids
        )
        if total_points <= 0:
            return None
        services = {
            str(service.id): service
            for service in Service.objects.require_tenant(tenant).filter(
                id__in=service_ids, business=business
            )
        }
        service_names: list[str] = []
        for item in line_items:
            service = services.get(str(item.service_id))
            if service is None:
                continue
            if int(service.loyalty_points_earn or 0) > 0:
                service_names.append(service.display_name or service.name)

        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        account.points_balance = int(account.points_balance) + total_points
        account.save(update_fields=["points_balance", "updated_at"])
        if len(service_names) == 1:
            reason = f"Completed booking — {service_names[0]}"
        else:
            reason = f"Completed booking — {', '.join(service_names)}"
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=total_points,
            reason=reason[:160],
            booking_id=booking_id,
            metadata={"type": "earn", "feature": FEATURE_REWARD_POINTS},
        )
        return account

    @transaction.atomic
    def redeem_for_booking(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        booking_id: Any,
        service_id: Any,
        points_to_redeem: int,
        amount: Decimal | str | int | float | None = None,
    ) -> dict[str, Any]:
        account = self._lock_account(tenant=tenant, business=business, customer=customer)
        quote = self.quote_redemption(
            business=business,
            service_id=service_id if amount is None else None,
            amount=amount,
            points_to_redeem=points_to_redeem,
            points_balance=account.points_balance,
        )
        already = (
            self._ledger_qs(tenant=tenant, booking_id=booking_id)
            .filter(points_delta__lt=0, metadata__type="redeem")
            .exists()
        )
        if already:
            raise ValidationError({"points_to_redeem": "Points were already redeemed on this booking."})

        points = int(quote["points_redeemed"])
        CustomerLoyaltyAccount.objects.filter(id=account.id).update(
            points_balance=F("points_balance") - points
        )
        account.refresh_from_db(fields=["points_balance"])
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=-points,
            reason="Redeemed on booking",
            booking_id=booking_id,
            metadata={
                "type": "redeem",
                "feature": FEATURE_REWARD_POINTS,
                "discount_amount": quote["discount_amount"],
                "currency": quote["currency"],
                "rate": quote["rate"],
            },
        )
        return {
            "points_redeemed": points,
            "discount_amount": quote["discount_amount"],
            "currency": quote["currency"],
            "rate": quote["rate"],
        }

    @transaction.atomic
    def refund_redemption(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        booking_id: Any,
        points_redeemed: int,
    ) -> CustomerLoyaltyAccount | None:
        return self._refund_redemption(
            tenant=tenant,
            business=business,
            customer=customer,
            points_redeemed=points_redeemed,
            booking_id=booking_id,
            reason="Refunded cancelled booking redemption",
        )

    def _refund_redemption(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        points_redeemed: int,
        reason: str,
        booking_id: Any = None,
        order_id: Any = None,
        voucher_id: Any = None,
    ) -> CustomerLoyaltyAccount | None:
        points = int(points_redeemed or 0)
        if points <= 0:
            return None
        qs = self._ledger_qs(
            tenant=tenant, booking_id=booking_id, order_id=order_id, voucher_id=voucher_id
        )
        if qs.filter(points_delta__gt=0, metadata__type="redeem_refund").exists():
            return None
        if not qs.filter(points_delta__lt=0, metadata__type="redeem").exists():
            return None
        account = self._lock_account(tenant=tenant, business=business, customer=customer)
        CustomerLoyaltyAccount.objects.filter(id=account.id).update(
            points_balance=F("points_balance") + points
        )
        account.refresh_from_db(fields=["points_balance"])
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=points,
            reason=reason[:160],
            booking_id=booking_id,
            order_id=order_id,
            voucher_id=voucher_id,
            metadata={"type": "redeem_refund", "feature": FEATURE_REWARD_POINTS},
        )
        return account

    def remaining_earned_points(
        self,
        *,
        tenant: Any,
        booking_id: Any = None,
        order_id: Any = None,
        voucher_id: Any = None,
    ) -> int:
        """Earn points still on the ledger after prior reversals for this document."""
        qs = self._ledger_qs(
            tenant=tenant, booking_id=booking_id, order_id=order_id, voucher_id=voucher_id
        )
        earned = sum(
            int(row.points_delta)
            for row in qs.filter(points_delta__gt=0, metadata__type="earn")
        )
        reversed_pts = sum(
            abs(int(row.points_delta))
            for row in qs.filter(points_delta__lt=0, metadata__type="earn_reversal")
        )
        return max(0, int(earned) - int(reversed_pts))

    def _reverse_earn(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        reason: str,
        booking_id: Any = None,
        order_id: Any = None,
        voucher_id: Any = None,
        points: int | None = None,
    ) -> int:
        """
        Reverse earned points for a document.

        ``points=None`` reverses all remaining earn. Partial returns pass a positive
        ``points`` amount (capped at remaining earn and current balance).
        Returns the points actually deducted.
        """
        remaining = self.remaining_earned_points(
            tenant=tenant,
            booking_id=booking_id,
            order_id=order_id,
            voucher_id=voucher_id,
        )
        if remaining <= 0:
            return 0
        target = remaining if points is None else min(remaining, max(0, int(points)))
        if target <= 0:
            return 0
        account = self._lock_account(tenant=tenant, business=business, customer=customer)
        current = int(account.points_balance)
        deduct = min(current, target)
        if deduct <= 0:
            return 0
        CustomerLoyaltyAccount.objects.filter(id=account.id).update(
            points_balance=F("points_balance") - deduct
        )
        account.refresh_from_db(fields=["points_balance"])
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=-deduct,
            reason=reason[:160],
            booking_id=booking_id,
            order_id=order_id,
            voucher_id=voucher_id,
            metadata={"type": "earn_reversal", "feature": FEATURE_REWARD_POINTS},
        )
        return int(deduct)

    def clawback_earn_for_spend(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        amount: Decimal | str | int | float,
        reason: str,
        booking_id: Any = None,
        order_id: Any = None,
        voucher_id: Any = None,
        reverse_all_remaining: bool = False,
    ) -> int:
        """Revoke earn points for a refunded spend amount (or all remaining if full return)."""
        if reverse_all_remaining:
            return self._reverse_earn(
                tenant=tenant,
                business=business,
                customer=customer,
                reason=reason,
                booking_id=booking_id,
                order_id=order_id,
                voucher_id=voucher_id,
            )
        points = self.earn_points_for_spend(business=business, amount=amount)
        if points <= 0:
            return 0
        return self._reverse_earn(
            tenant=tenant,
            business=business,
            customer=customer,
            reason=reason,
            booking_id=booking_id,
            order_id=order_id,
            voucher_id=voucher_id,
            points=points,
        )

    @transaction.atomic
    def redeem_for_order(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        order_id: Any,
        amount: Decimal | str | int | float,
        points_to_redeem: int,
    ) -> dict[str, Any]:
        account = self._lock_account(tenant=tenant, business=business, customer=customer)
        quote = self.quote_redemption(
            business=business,
            amount=amount,
            points_to_redeem=points_to_redeem,
            points_balance=account.points_balance,
        )
        already = (
            self._ledger_qs(tenant=tenant, order_id=order_id)
            .filter(points_delta__lt=0, metadata__type="redeem")
            .exists()
        )
        if already:
            raise ValidationError(
                {"points_to_redeem": "Points were already redeemed on this order."}
            )
        points = int(quote["points_redeemed"])
        CustomerLoyaltyAccount.objects.filter(id=account.id).update(
            points_balance=F("points_balance") - points
        )
        account.refresh_from_db(fields=["points_balance"])
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=-points,
            reason="Redeemed on order",
            order_id=order_id,
            metadata={
                "type": "redeem",
                "feature": FEATURE_REWARD_POINTS,
                "discount_amount": quote["discount_amount"],
                "currency": quote["currency"],
                "rate": quote["rate"],
            },
        )
        return {
            "points_redeemed": points,
            "discount_amount": quote["discount_amount"],
            "currency": quote["currency"],
            "rate": quote["rate"],
        }

    @transaction.atomic
    def award_for_paid_order(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        order_id: Any,
        amount: Decimal | str | int | float,
        order_number: str = "",
    ) -> int:
        """Credit earn points for a paid order. Returns points awarded (0 if none/already)."""
        points = self.earn_points_for_spend(business=business, amount=amount)
        if points <= 0:
            return 0
        already = (
            self._ledger_qs(tenant=tenant, order_id=order_id)
            .filter(points_delta__gt=0, metadata__type="earn")
            .exists()
        )
        if already:
            return 0
        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        account.points_balance = int(account.points_balance) + points
        account.save(update_fields=["points_balance", "updated_at"])
        label = f"Paid order — {order_number}" if order_number else "Paid order"
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=points,
            reason=label[:160],
            order_id=order_id,
            metadata={"type": "earn", "feature": FEATURE_REWARD_POINTS},
        )
        return int(points)

    @transaction.atomic
    def refund_for_order(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        order_id: Any,
        points_redeemed: int = 0,
    ) -> None:
        self._refund_redemption(
            tenant=tenant,
            business=business,
            customer=customer,
            points_redeemed=points_redeemed,
            order_id=order_id,
            reason="Refunded cancelled order redemption",
        )
        self._reverse_earn(
            tenant=tenant,
            business=business,
            customer=customer,
            order_id=order_id,
            reason="Reversed cancelled order earn",
        )

    @transaction.atomic
    def redeem_for_voucher(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        voucher_id: Any,
        amount: Decimal | str | int | float,
        points_to_redeem: int,
    ) -> dict[str, Any]:
        account = self._lock_account(tenant=tenant, business=business, customer=customer)
        quote = self.quote_redemption(
            business=business,
            amount=amount,
            points_to_redeem=points_to_redeem,
            points_balance=account.points_balance,
        )
        already = (
            self._ledger_qs(tenant=tenant, voucher_id=voucher_id)
            .filter(points_delta__lt=0, metadata__type="redeem")
            .exists()
        )
        if already:
            raise ValidationError(
                {"points_to_redeem": "Points were already redeemed on this sale."}
            )
        points = int(quote["points_redeemed"])
        CustomerLoyaltyAccount.objects.filter(id=account.id).update(
            points_balance=F("points_balance") - points
        )
        account.refresh_from_db(fields=["points_balance"])
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=-points,
            reason="Redeemed on sale",
            voucher_id=voucher_id,
            metadata={
                "type": "redeem",
                "feature": FEATURE_REWARD_POINTS,
                "discount_amount": quote["discount_amount"],
                "currency": quote["currency"],
                "rate": quote["rate"],
            },
        )
        return {
            "points_redeemed": points,
            "discount_amount": quote["discount_amount"],
            "currency": quote["currency"],
            "rate": quote["rate"],
        }

    @transaction.atomic
    def award_for_voucher(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        voucher_id: Any,
        amount: Decimal | str | int | float,
        voucher_number: str = "",
    ) -> int:
        """Credit earn points for a confirmed sale voucher. Returns points awarded."""
        points = self.earn_points_for_spend(business=business, amount=amount)
        if points <= 0:
            return 0
        already = (
            self._ledger_qs(tenant=tenant, voucher_id=voucher_id)
            .filter(points_delta__gt=0, metadata__type="earn")
            .exists()
        )
        if already:
            return 0
        account = self.ensure_account(tenant=tenant, business=business, customer=customer)
        account.points_balance = int(account.points_balance) + points
        account.save(update_fields=["points_balance", "updated_at"])
        label = f"Books sale — {voucher_number}" if voucher_number else "Books sale"
        CustomerLoyaltyLedger.objects.create(
            tenant=tenant,
            business=business,
            account=account,
            customer=customer,
            points_delta=points,
            reason=label[:160],
            voucher_id=voucher_id,
            metadata={"type": "earn", "feature": FEATURE_REWARD_POINTS},
        )
        return int(points)

    @transaction.atomic
    def refund_for_voucher(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        voucher_id: Any,
        points_redeemed: int = 0,
    ) -> None:
        self._refund_redemption(
            tenant=tenant,
            business=business,
            customer=customer,
            points_redeemed=points_redeemed,
            voucher_id=voucher_id,
            reason="Refunded voided sale redemption",
        )
        self._reverse_earn(
            tenant=tenant,
            business=business,
            customer=customer,
            voucher_id=voucher_id,
            reason="Reversed voided sale earn",
        )

    @transaction.atomic
    def refund_for_booking(
        self,
        *,
        tenant: Any,
        business: Any,
        customer: Customer,
        booking_id: Any,
        points_redeemed: int = 0,
    ) -> None:
        """Restore redeemed points and reverse any earn for a cancelled/no-show booking."""
        self._refund_redemption(
            tenant=tenant,
            business=business,
            customer=customer,
            points_redeemed=points_redeemed,
            booking_id=booking_id,
            reason="Refunded cancelled booking redemption",
        )
        self._reverse_earn(
            tenant=tenant,
            business=business,
            customer=customer,
            booking_id=booking_id,
            reason="Reversed cancelled booking earn",
        )
