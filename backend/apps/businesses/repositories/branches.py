from __future__ import annotations

from typing import Any

from django.db.models import QuerySet

from apps.businesses.models import Branch


class BranchRepository:
    def list_for_business(self, *, tenant: Any, business_id: str) -> QuerySet[Branch]:
        return Branch.objects.require_tenant(tenant).filter(business_id=business_id).order_by("display_name")

    def get_for_business(self, *, tenant: Any, business_id: str, branch_id: str) -> Branch:
        return Branch.objects.require_tenant(tenant).get(business_id=business_id, id=branch_id)
