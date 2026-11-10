#!/usr/bin/env python3
"""Merge fragments/features-pricing.<lang>.json into each locale catalog."""

from __future__ import annotations

import json
from pathlib import Path

LOCALES = Path(__file__).resolve().parents[1] / "src" / "locales"
FRAGMENTS = LOCALES / "fragments"
LANGS = ["en", "hi", "de", "fr", "es", "pt", "ar"]


def deep_merge(base: dict, overlay: dict) -> dict:
    out = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def main() -> None:
    for lang in LANGS:
        target = LOCALES / f"{lang}.json"
        fragment = json.loads((FRAGMENTS / f"features-pricing.{lang}.json").read_text(encoding="utf-8"))
        merged = deep_merge(json.loads(target.read_text(encoding="utf-8")), fragment)
        target.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("merged", lang)


if __name__ == "__main__":
    main()
