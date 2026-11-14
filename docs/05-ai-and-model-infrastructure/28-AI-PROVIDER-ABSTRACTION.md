# AI Provider Abstraction

**Doc ID:** 28 · **Status:** Approved (normative) · **Area:** AI
**Depends on:** [09](../02-system-architecture/09-SYSTEM-ARCHITECTURE.md), [27](../04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) · **Related:** [29](29-GEMINI-PRIMARY-INTEGRATION.md), [30](30-NVIDIA-NIM-FALLBACK-INTEGRATION.md), [31](31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md)

---

## 1. Purpose

Define the single internal boundary through which every model call passes: capability vocabulary, request and
response contracts, registry, router, telemetry, and error mapping. Without this, VISTRA becomes a pile of
vendor SDK calls with no fallback and no cost control.

## 2. Capability vocabulary

Capabilities are the only way callers ask for a model. A caller never names a provider.

```python
class Capability(StrEnum):
    TEXT_FAST = "text.fast"                 # classification, rewriting, short answers
    TEXT_REASONING = "text.reasoning"        # planning, multi-step answers
    STRUCTURED_JSON = "structured.json"      # schema-constrained output
    TOOLS_FUNCTION_CALLING = "tools.function_calling"
    VISION_IMAGE = "vision.image"            # screenshot / image understanding
    EMBEDDING_TEXT = "embedding.text"
    RERANK = "rerank"
    REALTIME_VOICE = "realtime.voice"
    LONG_CONTEXT = "long_context"            # > 200k tokens
```

A request may require several capabilities (e.g. `vision.image` + `structured.json`); the router selects a
model satisfying **all** of them or fails with `CAPABILITY_UNAVAILABLE`.

## 3. Ports

```python
class TextProvider(Protocol):
    async def generate(self, req: TextRequest) -> TextResponse: ...
    def stream(self, req: TextRequest) -> AsyncIterator[TextDelta]: ...

class StructuredProvider(Protocol):
    async def generate_structured(self, req: StructuredRequest[T]) -> StructuredResponse[T]: ...

class ToolProvider(Protocol):
    async def generate_with_tools(self, req: ToolRequest) -> ToolTurn: ...

class VisionProvider(Protocol):
    async def analyze_image(self, req: VisionRequest) -> VisionResponse: ...

class EmbeddingProvider(Protocol):
    async def embed(self, req: EmbeddingRequest) -> EmbeddingResponse: ...

class RerankProvider(Protocol):
    async def rerank(self, req: RerankRequest) -> RerankResponse: ...

class LiveProvider(Protocol):
    async def open_session(self, req: LiveRequest) -> LiveSession: ...

class HealthProvider(Protocol):
    async def health(self) -> ProviderHealth: ...
```

Providers implement only the ports they genuinely support. The registry records which ports each model
implements; the router refuses to call an unsupported port.

## 4. Request/response DTOs

```python
@dataclass(frozen=True)
class TextRequest:
    messages: list[Message]              # role + parts (text, image_ref, tool_result)
    capability: Capability
    system: str | None = None
    max_output_tokens: int = 1024
    temperature: float = 0.2
    top_p: float | None = None
    stop: list[str] = field(default_factory=list)
    deadline_ms: int = 30_000
    org_id: str = ""
    run_id: str | None = None
    prompt_version_id: str | None = None
    metadata: dict[str, str] = field(default_factory=dict)

@dataclass(frozen=True)
class TextResponse:
    text: str
    provider: str
    model: str
    finish_reason: Literal["stop","length","tool_call","content_filter","error"]
    usage: Usage                   # input_tokens, output_tokens, cached_tokens
    latency_ms: int
    fallback_used: bool = False
    raw_id: str | None = None      # provider request id for support
```

`Message.parts` is provider-neutral: `{"type":"text","text":...}`, `{"type":"image","file_id":...,
"mime_type":...}`, `{"type":"tool_result","call_id":...,"content":...}`. Each adapter translates.

## 5. Structured output contract

VISTRA schemas are the source of truth, not provider-specific shapes.

```python
class IntentClassification(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intent: Literal["knowledge_query","screen_query","guide_request","action_request",
                    "workflow_request","chitchat","unsupported"]
    confidence: float = Field(ge=0, le=1)
    rationale: str = Field(max_length=400)
    requires_knowledge: bool
```

`generate_structured` returns a validated model instance or raises `ProviderInvalidResponse`. On schema
failure: one repair attempt (re-ask with the validation error, temperature 0), then typed error. Providers that
cannot constrain output natively (some NVIDIA models) use JSON mode + validation + repair; the registry marks
`structured.json` support level as `native` or `validated` so the router can prefer native where quality
matters.

## 6. Module layout

```
app/core/ai/
  capabilities.py      # Capability enum + requirement sets
  ports.py             # Protocols
  dto.py               # request/response dataclasses + usage
  registry.py          # ModelRegistry: provider/model/capabilities/limits/pricing
  router.py            # capability resolution, retry, fallback, breaker
  fallback.py          # eligibility rules + provider selection
  retry.py             # classification + backoff
  circuit_breaker.py
  telemetry.py         # spans, metrics, usage records
  cost.py              # pricing table, estimation
  errors.py            # provider error taxonomy → VistraError
  providers/
    gemini/ client.py reasoning.py vision.py embeddings.py tools.py live.py
    nvidia/ client.py chat.py structured.py tools.py capabilities.py
```

No module outside `app/core/ai` imports `google.genai`, `openai`, or `httpx` for model traffic.

## 7. Model registry

Rows (seeded in migration, editable by ops, never by tenants):

```python
@dataclass(frozen=True)
class ModelSpec:
    provider: Literal["gemini","nvidia"]
    model_id: str                       # exact provider identifier
    capabilities: frozenset[Capability]
    context_window: int
    max_output_tokens: int
    supports_streaming: bool
    structured_support: Literal["native","validated","none"]
    tool_support: Literal["native","validated","none"]
    input_price_per_mtok: Decimal
    output_price_per_mtok: Decimal
    tier: Literal["fast","balanced","reasoning"]
    enabled: bool = True
    notes: str = ""
```

Lookups: `registry.resolve(capabilities, tier, constraints) -> list[ModelSpec]` ordered by preference
(primary provider first, then cost, then latency history).

## 8. Router algorithm

```python
async def execute(req, capability, *, tier="balanced", allow_fallback=True):
    candidates = registry.resolve(capability, tier)          # ordered
    if not candidates:
        raise CapabilityUnavailable(capability)

    primary = candidates[0]
    if breaker.is_open(primary, capability):
        return await fallback_path(candidates[1:], req, capability, reason="circuit_open")

    try:
        resp = await call_with_retry(primary, req)            # ≤2 retries, classified
        telemetry.record(resp, capability, fallback_used=False)
        return resp
    except RetryableProviderError as e:
        telemetry.record_failure(primary, capability, e)
        if not allow_fallback or not fallback.eligible(capability, candidates[1:]):
            raise FALLBACK_EXHAUSTED / PROVIDER_UNAVAILABLE from e
        return await fallback_path(candidates[1:], req, capability, reason=e.code)
    except ConfigurationError as e:      # 401/403/bad model id
        raise PROVIDER_CONFIGURATION_ERROR from e         # never fall back
    except CapabilityUnavailable:
        raise
```

Fallback eligibility is **capability-based**, not provider-based: a candidate must advertise every required
capability, and must not be the same model via another route.

## 9. Telemetry (mandatory per call)

```
provider, model, capability, org_id, run_id,
input_tokens, output_tokens, cached_tokens,
latency_ms, time_to_first_token_ms,
status, error_class, error_code,
retry_count, fallback_used, fallback_reason,
estimated_cost_micros, prompt_version_id
```

Written to `model_usage` (aggregated), `usage_records` (billed), and the trace span. Fallback events also
increment a counter used by alerting.

## 10. Cost accounting

- Prices live in the registry, versioned; a price change is a migration row, not a code change.
- Cost is computed at call time and stored; rollups never recompute historical prices.
- Budgets: per org (monthly), per app (daily), per capability (guardrail). Exceeding a soft budget emits
  `usage.threshold.reached`; hard budgets reject with `PLAN_LIMIT_EXCEEDED` (doc 66).

## 11. Security

- Provider keys exist only in server env; never in logs, traces, error details, or responses.
- Prompts and outputs are not logged at INFO; debug capture requires an explicit flag and short retention.
- Provider payloads are treated as untrusted; only parsed, validated fields are used.
- No tenant-controlled value can select a model outside the registry.

## 12. Failure scenarios

| Failure | Result |
|---|---|
| No model supports the capability | `CAPABILITY_UNAVAILABLE` (501), no downgrade |
| Primary 5xx/timeout | Retry, then fallback if eligible |
| Primary 401/403 | `PROVIDER_CONFIGURATION_ERROR`, no fallback |
| Fallback also fails | `FALLBACK_EXHAUSTED` (503) with both provider ids in logs |
| Structured output invalid twice | `PROVIDER_INVALID_RESPONSE` |
| Context exceeds window | `CONTEXT_TOO_LARGE` before the call (token estimate) |
| Deadline exceeded mid-stream | stream ends with `PROVIDER_TIMEOUT`, partial text discarded by orchestrator |

## 13. Testing

- Registry: capability resolution, ordering, disabled models.
- Router: retry, breaker open, eligibility, no-downgrade (vision → text), configuration error.
- Adapters: recorded fixtures per provider for success/error shapes.
- Telemetry: token and cost reconciliation against fixtures.
- Contract: every provider must pass the same behavioral suite for each advertised capability; a model that
  fails the suite is marked disabled in the registry.

## 14. Acceptance criteria

- [ ] One import site for provider SDKs (`app/core/ai/providers/*`).
- [ ] Every call records the telemetry fields in §9.
- [ ] Capability gating prevents any silent multimodal downgrade.
- [ ] Cost is computed and attributable per org and run.
- [ ] A disabled model is never selected.

## 15. Related documents

[29](29-GEMINI-PRIMARY-INTEGRATION.md) · [30](30-NVIDIA-NIM-FALLBACK-INTEGRATION.md) ·
[31](31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) · [32](32-PROMPT-AND-CONTEXT-MANAGEMENT.md) ·
[34](34-AI-EVALUATION-AND-COST-MANAGEMENT.md) · [66](../11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md)
