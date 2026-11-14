"""NVIDIA NIM adapter built on LangChain (langchain-openai against the OpenAI-compatible NIM endpoint).

Text capabilities only. Embeddings are deliberately NOT advertised: vectors from another model must never be
compared with the Gemini index (AGENTS.md section 11). Retries are owned by app.ai.router (max_retries=0).
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import openai
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.ai.base import Capability, EmbedResult, GenResult, ProviderError, extract_json
from app.core.config import Settings

TIMEOUT_S = 60


def _template(schema: dict[str, Any]) -> Any:
    t = schema.get("type")
    if t == "object":
        return {k: _template(v) for k, v in schema.get("properties", {}).items()}
    if t == "array":
        return [_template(schema.get("items", {}))]
    if "enum" in schema:
        return "|".join(str(e) for e in schema["enum"])
    return {"string": "<string>", "boolean": "<true or false>", "integer": "<integer>", "number": "<number>"}.get(t, "<value>")


def _classify(e: Exception) -> ProviderError:
    if isinstance(e, ProviderError):
        return e
    if isinstance(e, (asyncio.TimeoutError, TimeoutError, openai.APITimeoutError)):
        return ProviderError("timeout", "NVIDIA request timed out", True)
    if isinstance(e, openai.APIConnectionError):
        return ProviderError("network", "NVIDIA connection error", True)
    if isinstance(e, openai.APIStatusError):
        c = e.status_code
        if c == 429:
            return ProviderError("rate_limited", "NVIDIA 429", True)
        if c >= 500:
            return ProviderError("upstream_5xx", f"NVIDIA {c}", True)
        if c in (401, 403):
            return ProviderError("auth", f"NVIDIA credentials rejected ({c})", False)
        return ProviderError("bad_request", f"NVIDIA {c}", False)
    return ProviderError("network", f"NVIDIA {type(e).__name__}", True)


class NvidiaProvider:
    name = "nvidia"
    capabilities = {Capability.TEXT, Capability.FAST, Capability.STRUCTURED}

    def __init__(self, s: Settings) -> None:
        self._s = s
        self._llm = ChatOpenAI(
            model=s.nvidia_model_default, api_key=s.nvidia_api_key, base_url=s.nvidia_base_url,
            temperature=0.2, max_retries=0, timeout=TIMEOUT_S, max_tokens=1800,
            # reasoning models otherwise spend the token budget thinking and return empty content
            extra_body={"chat_template_kwargs": {"enable_thinking": False}},
        )

    @property
    def model(self) -> str:
        return self._s.nvidia_model_default

    async def _chat(self, system: str, prompt: str) -> GenResult:
        try:
            msg = await asyncio.wait_for(self._llm.ainvoke([SystemMessage(system), HumanMessage(prompt)]), TIMEOUT_S)
        except Exception as e:  # noqa: BLE001
            raise _classify(e) from e
        text = msg.text or ""
        if not text.strip():
            raise ProviderError("empty_output", "NVIDIA returned no content", True)
        u = msg.usage_metadata or {}
        return GenResult(text=text, model=self.model, input_tokens=u.get("input_tokens"), output_tokens=u.get("output_tokens"))

    async def generate_text(self, prompt: str, system: str, fast: bool = False) -> GenResult:
        return await self._chat(system, prompt)

    async def generate_structured(self, prompt: str, system: str, schema: dict[str, Any], fast: bool = False) -> GenResult:
        sys2 = (system + "\n\nReturn ONE JSON object only (no prose, no code fences). It must be an INSTANCE shaped like this "
                "template, not a schema:\n" + json.dumps(_template(schema)))
        r = await self._chat(sys2, prompt)
        parsed = extract_json(r.text)
        required = schema.get("required", [])
        inner = parsed.get("properties")
        if required and not all(k in parsed for k in required) and isinstance(inner, dict) and all(k in inner for k in required):
            parsed = inner  # model echoed the schema wrapper around its answer
        r.parsed = parsed
        return r

    async def embed(self, texts: list[str], task: str) -> EmbedResult:  # pragma: no cover - guarded by capability map
        raise ProviderError("capability", "NVIDIA embeddings are not part of the index", False)
