"""Gemini adapter built on LangChain (langchain-google-genai). The only module that talks to Gemini.

LangChain's own retries are disabled (max_retries=0): retry, breaker, fallback and usage recording are owned
by app.ai.router so they are applied uniformly to every provider.
"""
from __future__ import annotations

import asyncio
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

from app.ai.base import Capability, EmbedResult, GenResult, ProviderError, extract_json
from app.core.config import Settings

TIMEOUT_S = 45


def classify(e: Exception, who: str) -> ProviderError:
    """Map SDK/LangChain exceptions to retryable vs fail-closed classes."""
    if isinstance(e, ProviderError):
        return e
    if isinstance(e, (asyncio.TimeoutError, TimeoutError)):
        return ProviderError("timeout", f"{who} request timed out", True)
    code = getattr(e, "code", None) or getattr(e, "status_code", None)
    if not isinstance(code, int):
        m = re.search(r"\b(4\d\d|5\d\d)\b", str(e))
        code = int(m.group(1)) if m else 0
    msg = str(e)
    if code == 429 or "RESOURCE_EXHAUSTED" in msg:
        return ProviderError("rate_limited", f"{who} 429", True)
    if code >= 500 or "UNAVAILABLE" in msg or "DEADLINE_EXCEEDED" in msg:
        return ProviderError("upstream_5xx", f"{who} {code or 'unavailable'}", True)
    if code in (401, 403) or "API key" in msg or "PERMISSION_DENIED" in msg:
        return ProviderError("auth", f"{who} credentials rejected", False)
    if code and 400 <= code < 500:
        return ProviderError("bad_request", f"{who} {code}: {msg[:160]}", False)
    return ProviderError("network", f"{who} {type(e).__name__}", True)


def _usage(msg: Any) -> tuple[int | None, int | None]:
    u = getattr(msg, "usage_metadata", None) or {}
    return u.get("input_tokens"), u.get("output_tokens")


class GeminiProvider:
    name = "gemini"
    capabilities = {Capability.TEXT, Capability.FAST, Capability.STRUCTURED, Capability.EMBED, Capability.VISION}

    def __init__(self, s: Settings) -> None:
        self._s = s
        common = {"google_api_key": s.gemini_api_key, "temperature": 0.2, "max_retries": 0, "timeout": TIMEOUT_S}
        self._chat = ChatGoogleGenerativeAI(model=s.gemini_model_default, **common)
        self._fast = ChatGoogleGenerativeAI(model=s.gemini_model_fast, **common)
        self._emb = GoogleGenerativeAIEmbeddings(model=s.gemini_model_embedding, google_api_key=s.gemini_api_key,
                                                 output_dimensionality=s.gemini_embedding_dim)

    @property
    def model(self) -> str:
        return self._s.gemini_model_default

    def _llm(self, fast: bool) -> ChatGoogleGenerativeAI:
        return self._fast if fast else self._chat

    async def generate_text(self, prompt: str, system: str, fast: bool = False) -> GenResult:
        llm = self._llm(fast)
        try:
            msg = await asyncio.wait_for(llm.ainvoke([SystemMessage(system), HumanMessage(prompt)]), TIMEOUT_S)
        except Exception as e:  # noqa: BLE001
            raise classify(e, "Gemini") from e
        text = msg.text or ""
        if not text.strip():
            raise ProviderError("empty_output", "Gemini returned no text", True)
        i, o = _usage(msg)
        return GenResult(text=text, model=llm.model, input_tokens=i, output_tokens=o)

    async def generate_structured(self, prompt: str, system: str, schema: dict[str, Any], fast: bool = False) -> GenResult:
        llm = self._llm(fast)
        runnable = llm.with_structured_output(schema, method="json_schema", include_raw=True)
        try:
            out = await asyncio.wait_for(runnable.ainvoke([SystemMessage(system), HumanMessage(prompt)]), TIMEOUT_S)
        except Exception as e:  # noqa: BLE001
            raise classify(e, "Gemini") from e
        raw = out.get("raw")
        parsed = out.get("parsed")
        if not isinstance(parsed, dict):
            text = getattr(raw, "text", "") or ""
            parsed = extract_json(text)  # raises malformed_output (fail closed)
        i, o = _usage(raw)
        return GenResult(text=getattr(raw, "text", "") or "", model=llm.model, input_tokens=i, output_tokens=o, parsed=parsed)

    async def generate_vision(self, prompt: str, system: str, image: str, schema: dict[str, Any]) -> GenResult:
        llm = self._chat
        runnable = llm.with_structured_output(schema, method="json_schema", include_raw=True)
        human = HumanMessage(content=[{"type": "text", "text": prompt}, {"type": "image_url", "image_url": image}])
        try:
            out = await asyncio.wait_for(runnable.ainvoke([SystemMessage(system), human]), TIMEOUT_S)
        except Exception as e:  # noqa: BLE001
            raise classify(e, "Gemini") from e
        raw = out.get("raw")
        parsed = out.get("parsed")
        if not isinstance(parsed, dict):
            parsed = extract_json(getattr(raw, "text", "") or "")
        i, o = _usage(raw)
        return GenResult(text=getattr(raw, "text", "") or "", model=llm.model, input_tokens=i, output_tokens=o, parsed=parsed)

    async def embed(self, texts: list[str], task: str) -> EmbedResult:
        dim = self._s.gemini_embedding_dim
        try:
            vectors = await asyncio.wait_for(
                self._emb.aembed_documents(texts, task_type=task, output_dimensionality=dim), TIMEOUT_S)
        except Exception as e:  # noqa: BLE001
            raise classify(e, "Gemini") from e
        if len(vectors) != len(texts) or any(len(v) != dim for v in vectors):
            raise ProviderError("malformed_output", "Embedding count or dimension mismatch", False)
        return EmbedResult(vectors=_normalize(vectors), model=self._s.gemini_model_embedding)


def _normalize(vectors: list[list[float]]) -> list[list[float]]:
    # Truncated (MRL) embeddings are not unit length; normalize for cosine search.
    out = []
    for v in vectors:
        n = sum(x * x for x in v) ** 0.5 or 1.0
        out.append([x / n for x in v])
    return out
