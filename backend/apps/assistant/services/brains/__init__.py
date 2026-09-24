from __future__ import annotations

from apps.assistant.services.access import assistant_brain_name
from apps.assistant.services.brains.base import AssistantBrain
from apps.assistant.services.brains.rules import RulesBrain


def get_brain() -> AssistantBrain:
    name = assistant_brain_name()
    if name == "rules":
        return RulesBrain()
    # Future: ollama → OllamaBrain(). For now fall back to rules.
    return RulesBrain()
