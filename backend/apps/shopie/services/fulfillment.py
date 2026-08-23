from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from apps.businesses.models import Branch, Business
from apps.shopie.models import ShopGodown, ShopGodownStock
from apps.shopie.services.godowns import GodownsService
from apps.tenancy.models import Tenant

# Offices that cannot be measured against the drop point sort last on distance
# without disturbing the coverage ranking that comes first.
_UNKNOWN_DISTANCE = 10**6


def _q3(value: Any) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.001"))


def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


@dataclass(frozen=True)
class SourceOffice:
    branch: Branch | None
    godown: ShopGodown
    location: dict[str, Any]
    covered_total: Decimal
    shortfall: list[dict[str, Any]]
    distance_km: float | None

    @property
    def is_complete(self) -> bool:
        return not self.shortfall

    def as_metadata(self) -> dict[str, Any]:
        return {
            "source_type": self.location["source_type"],
            "branch_id": str(self.branch.id) if self.branch else "",
            "branch_name": (
                self.branch.display_name or self.branch.branch_name
                if self.branch
                else self.godown.name
            ),
            "godown_id": str(self.godown.id),
            "pickup": {
                key: str(value) if isinstance(value, Decimal) else value
                for key, value in self.location.items()
            },
            "covered_total": str(self.covered_total),
            "distance_km": (
                round(self.distance_km, 2) if self.distance_km is not None else None
            ),
            "shortfall": self.shortfall,
        }


class FulfillmentService:
    """Chooses which office ships an order.

    Ranking is by the order value an office can actually cover, then by
    proximity to the customer, then by primary flag. Offices short on stock stay
    eligible so a partly-stocked order still ships, with the gap recorded as a
    backorder on the order metadata.
    """

    godowns = GodownsService()

    def select_source_office(
        self,
        *,
        tenant: Tenant,
        business: Business,
        lines: list[Any],
        drop_latitude: Any = None,
        drop_longitude: Any = None,
    ) -> SourceOffice | None:
        self.godowns.sync_office_godowns(tenant=tenant, business=business)
        godowns = list(
            ShopGodown.objects.select_related("branch")
            .filter(tenant=tenant, business=business, is_active=True)
            .order_by("created_at")
        )
        candidates_with_location = [
            (godown, self.godowns.effective_location(godown, business))
            for godown in godowns
        ]
        candidates_with_location = [
            (godown, location)
            for godown, location in candidates_with_location
            if location is not None
        ]
        if not candidates_with_location:
            return None

        product_ids = [line.product_id for line in lines]
        stock: dict[str, dict[str, Decimal]] = {}
        for row in ShopGodownStock.objects.filter(
            tenant=tenant,
            business=business,
            godown_id__in=[godown.id for godown, _location in candidates_with_location],
            product_id__in=product_ids,
        ):
            stock.setdefault(str(row.godown_id), {})[str(row.product_id)] = _q3(row.quantity)

        drop: tuple[float, float] | None = None
        if drop_latitude not in (None, "") and drop_longitude not in (None, ""):
            drop = (float(drop_latitude), float(drop_longitude))

        candidates: list[SourceOffice] = []
        for godown, location in candidates_with_location:
            branch = godown.branch
            available = stock.get(str(godown.id), {})
            covered = Decimal("0.00")
            shortfall: list[dict[str, Any]] = []
            for line in lines:
                needed = _q3(line.quantity)
                on_hand = available.get(str(line.product_id), Decimal("0.000"))
                fillable = min(needed, on_hand)
                if needed > 0:
                    covered += (
                        Decimal(str(line.line_total)) * fillable / needed
                    ).quantize(Decimal("0.01"))
                if fillable < needed:
                    shortfall.append(
                        {
                            "product_id": str(line.product_id),
                            "product_name": line.product_name,
                            "needed": str(needed),
                            "available": str(on_hand),
                        }
                    )
            distance = None
            if drop:
                distance = _distance_km(
                    float(location["latitude"]),
                    float(location["longitude"]),
                    drop[0],
                    drop[1],
                )
            candidates.append(
                SourceOffice(
                    branch=branch,
                    godown=godown,
                    location=location,
                    covered_total=covered,
                    shortfall=shortfall,
                    distance_km=distance,
                )
            )

        candidates.sort(
            key=lambda office: (
                -office.covered_total,
                office.distance_km if office.distance_km is not None else _UNKNOWN_DISTANCE,
                not office.branch.is_primary if office.branch else True,
                office.godown.created_at,
            )
        )
        return candidates[0]

    def office_availability(
        self,
        *,
        tenant: Tenant,
        business: Business,
        product_ids: list[Any],
    ) -> list[dict[str, Any]]:
        """Per-office quantity for the given products, for merchant-facing views."""
        offices = self.godowns.sync_office_godowns(tenant=tenant, business=business)
        stock = self.godowns.office_stock(
            tenant=tenant, business=business, product_ids=product_ids
        )
        return [
            {
                "branch_id": str(branch.id),
                "branch_name": branch.display_name or branch.branch_name,
                "is_primary": branch.is_primary,
                "godown_id": str(godown.id),
                "quantities": {
                    product_id: str(quantity)
                    for product_id, quantity in stock.get(str(branch.id), {}).items()
                },
            }
            for branch, godown in offices
        ]
