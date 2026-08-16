from __future__ import annotations

import re
from html import escape, unescape
from html.parser import HTMLParser

ALLOWED_TAGS = frozenset(
    {"p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "a", "span", "div"}
)
VOID_TAGS = frozenset({"br"})
ALLOWED_ATTRS = {
    "a": frozenset({"href", "title"}),
}


def _safe_href(value: str) -> bool:
    href = unescape(value).strip()
    lowered = href.lower()
    if lowered.startswith(("javascript:", "data:", "vbscript:")):
        return False
    return lowered.startswith(("http://", "https://", "mailto:", "/"))


class _Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag not in ALLOWED_TAGS:
            return
        allowed = ALLOWED_ATTRS.get(tag, frozenset())
        clean_attrs: list[str] = []
        for name, value in attrs:
            name = name.lower()
            if name not in allowed or value is None:
                continue
            if name == "href" and not _safe_href(value):
                continue
            clean_attrs.append(f'{name}="{escape(value, quote=True)}"')
        attr_str = f" {' '.join(clean_attrs)}" if clean_attrs else ""
        self.parts.append(f"<{tag}{attr_str}>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in ALLOWED_TAGS and tag not in VOID_TAGS:
            self.parts.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        self.parts.append(escape(data))


def sanitize_product_html(raw: str | None, *, max_length: int = 20000) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    parser = _Sanitizer()
    try:
        parser.feed(text)
        parser.close()
    except Exception:
        return escape(text)[:max_length]
    cleaned = "".join(parser.parts)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned[:max_length]
