"""Capability router: retry x2 with jitter, circuit breaker, capability-gated fallback, usage recording."""
from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text

from app.ai.base import CallTrace, Capability, EmbedResult, GenResult, Provider, ProviderError, RouterResult
from app.ai.fake import FakeProvider
from app.core.config import Settings, get_settings
from app.core.db import tenant_conn
from app.core.errors import capability_unavailable, provider_config_error, provider_unavailable

log = logging.getLogger("vistra.ai")

RETRIES = 2
BREAKER_THRESHOLD = 5
BREAKER_OPEN_S = 30.0


@dataclass
class UsageCtx:
    organization_id: str
    run_id: str | None = None
    force_primary_failure: bool = False  # fault injection for demo beat 5 (needs AI_ALLOW_FAULT_INJECTION)


class Breaker:
    def __init__(self) -> None:
        self.failures = 0
        self.opened_at: float | None = None

    def allow(self) -> bool:
        if self.opened_at is None:
            return True
        if time.monotonic() - self.opened_at >= BREAKER_OPEN_S:
            self.opened_at = None  # half-open: let one attempt through
            self.failures = BREAKER_THRESHOLD - 1
            return True
        return False

    def success(self) -> None:
        self.failures = 0
        self.opened_at = None

    def failure(self) -> None:
        self.failures += 1
        if self.failures >= BREAKER_THRESHOLD:
            self.opened_at = time.monotonic()


class Router:
    def __init__(self, primary: Provider, fallback: Provider | None, settings: Settings | None = None,
                 sleep=asyncio.sleep) -> None:
        self.primary = primary
        self.fallback = fallback
        self.s = settings or get_settings()
        # one breaker per (provider, capability group): a failing text model must not block embeddings
        self.breakers: dict[tuple[str, str], Breaker] = {}
        self._sleep = sleep

    @property
    def simulated(self) -> bool:
        return self.s.ai_provider_mode == "fake"

    def _candidates(self, capability: Capability) -> list[Provider]:
        out = [self.primary] if capability in self.primary.capabilities else []
        # Fallback only if configured AND it advertises the capability. Never a silent downgrade.
        if self.fallback is not None and capability in self.fallback.capabilities:
            out.append(self.fallback)
        if not out:
            raise capability_unavailable(f"No configured provider supports {capability.value}")
        return out

    async def _record(self, ctx: UsageCtx, t: CallTrace, res: GenResult | EmbedResult | None) -> None:
        try:
            async with tenant_conn(ctx.organization_id) as conn:
                await conn.execute(text(
                    "insert into model_usage (organization_id, run_id, provider, model, capability, status, error_class, "
                    "fallback_used, input_tokens, output_tokens, latency_ms, attempt) values "
                    "(:o, cast(:r as uuid), :p, :m, :c, :s, :e, :f, :i, :ou, :l, :a)"),
                    {"o": ctx.organization_id, "r": ctx.run_id, "p": t.provider, "m": t.model, "c": t.capability,
                     "s": t.status, "e": t.error_class, "f": t.fallback_used,
                     "i": getattr(res, "input_tokens", None), "ou": getattr(res, "output_tokens", None),
                     "l": t.latency_ms, "a": t.attempt})
        except Exception:  # noqa: BLE001 - usage recording must never break a request
            log.exception("model_usage insert failed")

    async def _run(self, ctx: UsageCtx, capability: Capability, call) -> tuple[Any, Provider, list[CallTrace]]:
        traces: list[CallTrace] = []
        candidates = self._candidates(capability)
        last: ProviderError | None = None
        for idx, prov in enumerate(candidates):
            fallback_used = idx > 0
            br = self.breakers.setdefault((prov.name, "embed" if capability == Capability.EMBED else "generate"), Breaker())
            model_hint = getattr(prov, "model", "-")
            for attempt in range(1, RETRIES + 2):
                if not br.allow():
                    t = CallTrace(prov.name, model_hint, capability.value, "failed", 0, attempt, "circuit_open", fallback_used)
                    traces.append(t)
                    await self._record(ctx, t, None)
                    last = ProviderError("circuit_open", "circuit open", True)
                    break
                t0 = time.perf_counter()
                try:
                    injected = (ctx.force_primary_failure and self.s.ai_allow_fault_injection and idx == 0
                                and capability != Capability.EMBED)
                    if injected:
                        raise ProviderError("injected_fault", "fault injected for fallback demo", True)
                    res = await call(prov)
                    ms = int((time.perf_counter() - t0) * 1000)
                    br.success()
                    t = CallTrace(prov.name, res.model, capability.value, "ok", ms, attempt, None, fallback_used)
                    traces.append(t)
                    log.info("provider call", extra={"ctx": {"run_id": ctx.run_id, "provider": prov.name, "model": res.model,
                                                             "capability": capability.value, "ms": ms, "attempt": attempt,
                                                             "fallback": fallback_used}})
                    await self._record(ctx, t, res)
                    return res, prov, traces
                except ProviderError as e:
                    ms = int((time.perf_counter() - t0) * 1000)
                    last = e
                    if e.retryable:
                        br.failure()
                    t = CallTrace(prov.name, model_hint, capability.value, "failed", ms, attempt, e.kind, fallback_used)
                    traces.append(t)
                    await self._record(ctx, t, None)
                    log.warning("provider call failed", extra={"ctx": {"provider": prov.name, "kind": e.kind, "attempt": attempt}})
                    if not e.retryable:
                        # invalid credentials / malformed request fail closed: no retry, no fallback
                        if e.kind == "auth":
                            raise provider_config_error(f"{prov.name}: {e}") from e
                        raise provider_unavailable(f"{prov.name}: {e}") from e
                    if attempt <= RETRIES:
                        await self._sleep(min(2.0, 0.25 * 2 ** (attempt - 1)) + random.uniform(0, 0.2))
        raise provider_unavailable(f"All providers failed; last error: {last}")

    async def generate_text(self, ctx: UsageCtx, prompt: str, system: str, fast: bool = False) -> RouterResult:
        cap = Capability.FAST if fast else Capability.TEXT
        res, prov, traces = await self._run(ctx, cap, lambda p: p.generate_text(prompt, system, fast))
        return RouterResult(res.text, None, prov.name, res.model, prov is not self.primary, traces)

    async def generate_structured(self, ctx: UsageCtx, prompt: str, system: str, schema: dict[str, Any],
                                  fast: bool = False) -> RouterResult:
        res, prov, traces = await self._run(ctx, Capability.STRUCTURED, lambda p: p.generate_structured(prompt, system, schema, fast))
        return RouterResult(res.text, res.parsed, prov.name, res.model, prov is not self.primary, traces)

    def supports(self, capability: Capability) -> bool:
        return capability in self.primary.capabilities or (
            self.fallback is not None and capability in self.fallback.capabilities)

    async def generate_vision(self, ctx: UsageCtx, prompt: str, system: str, image: str,
                              schema: dict[str, Any]) -> RouterResult:
        res, prov, traces = await self._run(ctx, Capability.VISION,
                                            lambda p: p.generate_vision(prompt, system, image, schema))
        return RouterResult(res.text, res.parsed, prov.name, res.model, prov is not self.primary, traces)

    async def embed(self, ctx: UsageCtx, texts: list[str], task: str) -> EmbedResult:
        res, _, _ = await self._run(ctx, Capability.EMBED, lambda p: p.embed(texts, task))
        return res


_router: Router | None = None


def build_router(s: Settings) -> Router:
    if s.ai_provider_mode == "fake":
        return Router(FakeProvider("fake"), FakeProvider("fake-secondary"), s)
    if not s.gemini_api_key:
        raise provider_config_error("GEMINI_API_KEY is not set (use AI_PROVIDER_MODE=fake to run simulated)")
    from app.ai.gemini import GeminiProvider
    from app.ai.nvidia import NvidiaProvider

    fallback = NvidiaProvider(s) if (s.ai_fallback_provider == "nvidia" and s.nvidia_api_key) else None
    return Router(GeminiProvider(s), fallback, s)


def get_router() -> Router:
    global _router
    if _router is None:
        _router = build_router(get_settings())
    return _router


def set_router(r: Router | None) -> None:
    global _router
    _router = r
