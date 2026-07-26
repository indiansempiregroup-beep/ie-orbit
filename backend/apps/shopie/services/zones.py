from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError

from apps.businesses.models import Business
from apps.shopie.models import ShopDeliveryZone
from apps.tenancy.models import Tenant


class DeliveryZoneService:
    def list_zones(self, *, tenant: Tenant, business: Business):
        return ShopDeliveryZone.objects.filter(tenant=tenant, business=business).order_by("name")

    def create_zone(self, *, tenant: Tenant, business: Business, data: dict[str, Any]) -> ShopDeliveryZone:
        name = str(data.get("name") or "").strip()
        if not name:
            raise ValidationError({"name": "Zone name is required."})
        return ShopDeliveryZone.objects.create(
            tenant=tenant,
            business=business,
            name=name,
            enabled=bool(data.get("enabled", True)),
            cities=list(data.get("cities") or []),
            postal_prefixes=list(data.get("postal_prefixes") or []),
            same_day=bool(data.get("same_day", True)),
            fee=data.get("fee") or 0,
            min_order_total=data.get("min_order_total") or 0,
            notes=str(data.get("notes") or ""),
            metadata=data.get("metadata") or {},
        )

    def update_zone(self, *, zone: ShopDeliveryZone, data: dict[str, Any]) -> ShopDeliveryZone:
        for field in ("name", "notes"):
            if field in data and data[field] is not None:
                setattr(zone, field, str(data[field]).strip())
        for field in ("enabled", "same_day"):
            if field in data and data[field] is not None:
                setattr(zone, field, bool(data[field]))
        for field in ("cities", "postal_prefixes", "metadata"):
            if field in data and data[field] is not None:
                setattr(zone, field, data[field])
        for field in ("fee", "min_order_total"):
            if field in data and data[field] is not None:
                setattr(zone, field, data[field])
        zone.save()
        return zone

    def match_zone(
        self,
        *,
        tenant: Tenant,
        business: Business,
        city: str = "",
        postal_code: str = "",
    ) -> ShopDeliveryZone | None:
        city_norm = (city or "").strip().lower()
        postal = (postal_code or "").strip()
        zones = self.list_zones(tenant=tenant, business=business).filter(enabled=True)
        for zone in zones:
            cities = [str(c).strip().lower() for c in (zone.cities or []) if str(c).strip()]
            prefixes = [str(p).strip() for p in (zone.postal_prefixes or []) if str(p).strip()]
            city_ok = not cities or any(c in city_norm or city_norm in c for c in cities)
            postal_ok = not prefixes or any(postal.startswith(p) for p in prefixes)
            if city_ok and postal_ok:
                return zone
        return None
