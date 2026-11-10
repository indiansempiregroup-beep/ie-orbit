#!/usr/bin/env python3
"""Merge FAQ + Industries fragments into all locale catalogs and verify key parity.

Usage:
  python3 scripts/merge_faq_industries.py --check   # parity only
  python3 scripts/merge_faq_industries.py           # merge fragments into locales/*.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src" / "locales"
FRAGMENTS = ROOT / "fragments"
LOCALES = ["en", "hi", "de", "fr", "es", "pt", "ar"]
AREAS = ["faq", "industries"]
TOKEN_RE = re.compile(r"\{\{\w+\}\}|</?\w+>")


def deep_merge(base: dict, overlay: dict) -> dict:
    out = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def flatten(node, prefix=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from flatten(v, f"{prefix}.{k}" if prefix else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from flatten(v, f"{prefix}[{i}]")
    else:
        yield prefix, node


def load(area: str, lang: str) -> dict:
    return json.loads((FRAGMENTS / f"{area}.{lang}.json").read_text(encoding="utf-8"))


def check() -> int:
    errors = 0
    for area in AREAS:
        en = dict(flatten(load(area, "en")))
        print(f"{area}: en keys = {len(en)}")
        for lang in LOCALES[1:]:
            path = FRAGMENTS / f"{area}.{lang}.json"
            if not path.exists():
                print(f"  MISSING {path.name}")
                errors += 1
                continue
            cur = dict(flatten(load(area, lang)))
            missing = sorted(set(en) - set(cur))
            extra = sorted(set(cur) - set(en))
            for k in missing:
                print(f"  {lang} missing {k}")
            for k in extra:
                print(f"  {lang} extra {k}")
            errors += len(missing) + len(extra)
            for k, v in en.items():
                if k in cur:
                    if sorted(TOKEN_RE.findall(str(v))) != sorted(TOKEN_RE.findall(str(cur[k]))):
                        print(f"  {lang} token mismatch {k}")
                        errors += 1
                    if not str(cur[k]).strip():
                        print(f"  {lang} empty {k}")
                        errors += 1
            print(f"  {lang}: {len(cur)} keys")
    return errors


def merge() -> None:
    for lang in LOCALES:
        path = ROOT / f"{lang}.json"
        catalog = json.loads(path.read_text(encoding="utf-8"))
        for area in AREAS:
            catalog = deep_merge(catalog, load(area, lang))
        path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"merged {lang}")


if __name__ == "__main__":
    errs = check()
    if errs:
        print(f"{errs} problem(s)")
        sys.exit(1)
    if "--check" not in sys.argv:
        merge()
