from __future__ import annotations

from collections.abc import Iterable

from django.db.models import Q, QuerySet

CUSTOMER_SEARCH_FIELDS = (
    "customer__display_name",
    "customer__first_name",
    "customer__last_name",
    "customer__phone_number",
)

SUPPLIER_SEARCH_FIELDS = ("supplier__name", "supplier__phone")


def apply_text_search(qs: QuerySet, q: str | None, fields: Iterable[str]) -> QuerySet:
    """OR-combine ``icontains`` filters for the given lookup paths when ``q`` is non-empty."""
    term = str(q or "").strip()
    if not term:
        return qs
    query = Q()
    for field in fields:
        query |= Q(**{f"{field}__icontains": term})
    return qs.filter(query).distinct()


def request_search_term(query_params) -> str | None:
    """Shared ``q`` / ``search`` query param reader for list endpoints."""
    return query_params.get("q") or query_params.get("search") or None
