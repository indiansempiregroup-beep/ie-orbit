from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class BrainResult:
    reply: str
    suggestions: list[str] = field(default_factory=list)
    proposal: dict[str, Any] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class AssistantBrain:
    """Pluggable message handler. v1 = RulesBrain; later = OllamaBrain."""

    name = "base"

    def handle(self, *, text: str, context: dict[str, Any]) -> BrainResult:
        raise NotImplementedError
