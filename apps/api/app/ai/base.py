"""Provider port. Everything outside app/ai talks to the Router, never to an SDK."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol


class Capability(StrEnum):
    TEXT = "text.reasoning"
    FAST = "text.fast"
    STRUCTURED = "structured.json"
    EMBED = "embedding.text"
    VISION = "vision.image"  # structured output from text + one screenshot


class ProviderError(Exception):
    """Classified provider failure. ``retryable`` drives retry and fallback; others fail closed."""

    def __init__(self, kind: str, message: str, retryable: bool) -> None:
        super().__init__(message)
        self.kind = kind
        self.retryable = retryable


@dataclass
class GenResult:
    text: str
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    parsed: dict[str, Any] | None = None


@dataclass
class EmbedResult:
    vectors: list[list[float]]
    model: str
    input_tokens: int | None = None


class Provider(Protocol):
    name: str
    capabilities: set[Capability]

    async def generate_text(self, prompt: str, system: str, fast: bool = False) -> GenResult: ...

    async def generate_structured(self, prompt: str, system: str, schema: dict[str, Any], fast: bool = False) -> GenResult: ...

    async def embed(self, texts: list[str], task: str) -> EmbedResult: ...

    # Optional; only called when Capability.VISION is advertised. image is a data: URL (png/jpeg/webp).
    async def generate_vision(self, prompt: str, system: str, image: str, schema: dict[str, Any]) -> GenResult: ...


_JSON_BLOCK = re.compile(r"\{.*\}", re.S)


def extract_json(text: str) -> dict[str, Any]:
    """Parse model output as a JSON object; tolerate code fences and surrounding prose."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?|```$", "", cleaned, flags=re.M).strip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        m = _JSON_BLOCK.search(cleaned)
        if not m:
            raise ProviderError("malformed_output", "No JSON object in model output", False) from None
        try:
            value = json.loads(m.group(0))
        except json.JSONDecodeError as e:
            raise ProviderError("malformed_output", f"Invalid JSON: {e}", False) from e
    if not isinstance(value, dict):
        raise ProviderError("malformed_output", "Model output is not a JSON object", False)
    return value


@dataclass
class CallTrace:
    provider: str
    model: str
    capability: str
    status: str
    latency_ms: int
    attempt: int
    error_class: str | None = None
    fallback_used: bool = False


@dataclass
class RouterResult:
    text: str
    parsed: dict[str, Any] | None
    provider: str
    model: str
    fallback_used: bool
    traces: list[CallTrace] = field(default_factory=list)
