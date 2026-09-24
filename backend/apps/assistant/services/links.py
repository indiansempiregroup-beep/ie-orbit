"""Helpers for assistant deep-links into ops screens."""

from __future__ import annotations

from typing import Any

LIST_PAGE_SIZE = 5


def entity_link(
    *,
    kind: str,
    id: str,
    label: str,
    subtitle: str = "",
    order_id: str | None = None,
    action: str = "preview",
    select_text: str | None = None,
    badge: str | None = None,
) -> dict[str, Any]:
    """Build a record chip.

    action:
      - preview: tapping asks Assistant for details in chat (default for lists)
      - open: tapping navigates to the full record screen
      - select: tapping sends select_text (or label) as the next chat message
    """
    link: dict[str, Any] = {
        "kind": kind,
        "id": str(id),
        "label": label,
        "subtitle": subtitle or "",
        "action": action if action in {"preview", "open", "select"} else "preview",
    }
    if order_id:
        link["order_id"] = str(order_id)
    if select_text:
        link["select_text"] = select_text
    if badge:
        link["badge"] = str(badge)
    return link


def pack_reply(
    text: str,
    *,
    links: list[dict[str, Any]] | None = None,
    suggestions: list[str] | None = None,
    page: dict[str, Any] | None = None,
    flow: dict[str, Any] | None = None,
) -> dict[str, Any]:
    link_rows = links or []
    body = text or ""
    # Avoid duplicating the same records as a bullet list + clickable cards.
    if link_rows and body:
        kept = [line for line in body.splitlines() if not line.lstrip().startswith("•")]
        cleaned = "\n".join(kept).strip()
        body = cleaned or body.splitlines()[0]
    chips = list(suggestions) if suggestions is not None else None
    if page and page.get("has_more"):
        more = str(page.get("more_label") or "Show more").strip() or "Show more"
        chips = chips or []
        if more not in chips:
            chips.insert(0, more)
    payload: dict[str, Any] = {"text": body, "links": link_rows}
    if chips is not None:
        payload["suggestions"] = chips
    if page:
        payload["page"] = page
    if flow:
        payload["flow"] = flow
    return payload


def unpack_reply(
    result: str | dict[str, Any],
) -> tuple[str, list[dict[str, Any]], list[str] | None, dict[str, Any] | None, dict[str, Any] | None]:
    if isinstance(result, dict) and "text" in result:
        page = result.get("page")
        flow = result.get("flow")
        return (
            str(result.get("text") or ""),
            list(result.get("links") or []),
            result.get("suggestions"),
            page if isinstance(page, dict) else None,
            flow if isinstance(flow, dict) else None,
        )
    return str(result), [], None, None, None


def page_window(*, offset: int = 0, limit: int = LIST_PAGE_SIZE) -> tuple[int, int]:
    start = max(0, int(offset or 0))
    size = max(1, int(limit or LIST_PAGE_SIZE))
    return start, size


def slice_page(rows: list[Any], *, offset: int = 0, limit: int = LIST_PAGE_SIZE) -> tuple[list[Any], dict[str, Any]]:
    start, size = page_window(offset=offset, limit=limit)
    window = rows[start : start + size + 1]
    has_more = len(window) > size
    page_rows = window[:size]
    page = {
        "offset": start,
        "limit": size,
        "next_offset": start + size,
        "has_more": has_more,
        "shown": len(page_rows),
    }
    return page_rows, page
