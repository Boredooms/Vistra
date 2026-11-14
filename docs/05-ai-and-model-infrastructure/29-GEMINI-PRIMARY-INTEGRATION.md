# Gemini Primary Provider

**Doc ID:** 29 · **Status:** Approved · **Area:** AI
**Depends on:** [28](28-AI-PROVIDER-ABSTRACTION.md) · **Related:** [31](31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md), [33](33-EMBEDDING-AND-MULTIMODAL-MODELS.md), [32](32-PROMPT-AND-CONTEXT-MANAGEMENT.md)

---

## 1. Purpose

Specify the Gemini adapter: SDK, call surface, model selection, structured output, tool calling, vision,
embeddings, live sessions, quotas, error mapping, and cost accounting.

## 2. Facts this document relies on (verified against official docs)

- Official SDK: **Google Gen AI SDK** — Python `google-genai`, JS `@google/genai`. Install
  `pip install -U google-genai`; client is `genai.Client()`, reads `GEMINI_API_KEY`/`GOOGLE_API_KEY`.
- The **Interactions API** (`client.interactions.create(...)`) is GA and recommended for new projects; the
  earlier `generateContent` API remains supported. VISTRA targets the Interactions API behind its port
  (ADR-007) so the surface can change without touching callers.
- Structured output supports JSON Schema, Pydantic (Python) and Zod (JS) via `response_format`.
- Embeddings: `gemini-embedding-001` / `gemini-embedding-2` (MRL-trained), default **3072** dims, truncatable
  to 768/1536/3072 via `output_dimensionality`.
- Live/realtime voice and long-running interactions exist but are capability-gated; do not assume parity with
  every model.

Model identifiers are **not** hardcoded in application logic. They live in the model registry
(`config/models.yaml` + seeded rows) with the exact IDs verified against the current model catalog at
implementation time.

## 3. Configuration

```env
GEMINI_API_KEY=                       # server only
GEMINI_MODEL_DEFAULT=                 # registry key, e.g. balanced text model id
GEMINI_MODEL_FAST=
GEMINI_MODEL_REASONING=
GEMINI_MODEL_VISION=
GEMINI_MODEL_EMBEDDING=
GEMINI_EMBEDDING_DIM=768              # 768 | 1536 | 3072
GEMINI_REQUEST_TIMEOUT_MS=60000
GEMINI_MAX_RETRIES=2
```

`GEMINI_API_KEY` is required when `AI_PRIMARY_PROVIDER=gemini`. Missing key → `PROVIDER_CONFIGURATION_ERROR`
at boot for provider-dependent routes; knowledge-only deployments can disable the provider explicitly.

## 4. Adapter structure

```
providers/gemini/
  client.py       # genai.Client construction, timeouts, headers, retry hooks
  reasoning.py    # text + structured generation via interactions
  vision.py       # image parts (inline < 4 MB, file upload for larger)
  tools.py        # function declarations + tool turn handling
  embeddings.py   # batched embeddings with dimension control
  live.py         # realtime session (capability-gated)
  mapping.py      # DTO ↔ SDK types; error mapping
  capabilities.py # declared capability set per registry model
```

## 5. Text and structured generation

```python
from google import genai

client = genai.Client(api_key=settings.gemini_api_key)

async def generate_structured(req: StructuredRequest[T]) -> StructuredResponse[T]:
    interaction = await asyncio.to_thread(
        client.interactions.create,
        model=req.model_id,
        input=req.messages_as_input(),          # system + user turns
        response_format={
            "type": "text",
            "mime_type": "application/json",
            "schema": req.schema.model_json_schema(),
        },
        generation_config={"temperature": req.temperature,
                           "max_output_tokens": req.max_output_tokens},
    )
    payload = json.loads(interaction.output_text)
    return StructuredResponse(value=req.schema.model_validate(payload), ...)
```

Notes:
- The SDK is synchronous; wrap calls in `asyncio.to_thread` (bounded thread pool) or use its async client
  where available. Streaming tokens are consumed by the adapter and re-emitted as `TextDelta`.
- Interaction objects are normalized: `output_text` plus usage metadata, provider id, and finish reason.
  Nothing vendor-specific escapes the adapter.
- `extra="forbid"` on VISTRA schemas; a response with extra fields fails validation and triggers one repair.

## 6. Tool calling

```python
tools = [{
  "function_declarations": [
     {"name": "projects_create",
      "description": "Create a project in the host application.",
      "parameters_json_schema": tool_version.args_schema}
  ]
}]
```

Rules:
- Tool names presented to the model are prefixed and deterministic
  (`<tool_slug>`), mapped back to `tool_version_id` by the registry — never by trusting model text.
- The adapter returns `ToolTurn(calls=[ToolCallProposal(name, args_json, call_id)])`; the orchestrator
  validates args against the schema **before** policy.
- `tool_config.mode = "ANY"` only when the orchestrator requires a call (e.g. action step); otherwise `AUTO`.
- Parallel calls are allowed only for `read` tools; write/external tools are serialized.

## 7. Vision

- Screenshot crops and images are sent as image parts; inline up to ~4 MB, otherwise the Files API.
- Prompts must state what to look for and demand structured output when used in a step
  (`VisionObservation` schema), e.g. `{"elements":[{"role","name","description"}],"confidence":0..1}`.
- The adapter records image dimensions and bytes for cost estimation; images are downscaled client-side
  (max 1568 px long edge) before upload.
- Vision is never invoked for a text-only model: the router checks `VISION_IMAGE` first.

## 8. Embeddings

```python
result = client.models.embed_content(
    model=settings.gemini_model_embedding,
    contents=[chunk_text],
    config={"output_dimensionality": 768, "task_type": "RETRIEVAL_DOCUMENT"},
)
```

| Decision | Value |
|---|---|
| Document task type | `RETRIEVAL_DOCUMENT` |
| Query task type | `RETRIEVAL_QUERY` |
| Default dimension | 768 (chosen for storage/perf; validated in doc 42) |
| Allowed dimensions | 768, 1536, 3072 |
| Batching | ≤ 100 inputs or ≤ 20k tokens per call |
| Storage | `embeddings.embedding vector(768)` + `model` + `index_version` |
| Query caching | embedding cached by `(hash(query), model, dim)` for 10 min |

**Never mix** embeddings from different models or dimensions in one index; a model change requires a new
`index_version` (doc 38 §9).

## 9. Live / realtime voice

- Uses Gemini live sessions through the adapter's `LiveProvider`; audio in/out over WebSocket to VISTRA,
  which proxies to the provider.
- Capability `REALTIME_VOICE`; if the configured model does not advertise it, the feature is disabled and the
  UI states "voice unavailable" rather than silently using text.
- Session limits: 15 min, single active turn, transcript persisted per retention policy.
- Fallback: none in v1 (no equivalent NVIDIA integration); explicit error.

## 10. Long-running interactions

Long interactions (deep research-style, multi-minute) are supported only where the model advertises
background execution. VISTRA models these as worker jobs with persisted state, not as open HTTP requests.
Output is streamed through `session_events`.

## 11. Quotas and rate limits

- Provider quotas are per project/key; the adapter surfaces 429 with provider retry hints.
- VISTRA enforces its own per-org/plan limits before calling (doc 66).
- On 429: honor `Retry-After` when present; retry within the request deadline; otherwise fallback (eligible
  capability) or `PROVIDER_RATE_LIMITED`.
- Concurrency is bounded by a per-provider semaphore (default 40 in-flight per instance) to avoid thundering
  herd after failures.

## 12. Error mapping

| Provider signal | VISTRA error | Fallback? |
|---|---|---|
| 400 invalid argument / bad schema | `PROVIDER_INVALID_REQUEST` (500-class config) | no |
| 401/403 invalid key, permission | `PROVIDER_CONFIGURATION_ERROR` | no |
| 404 model not found | `PROVIDER_CONFIGURATION_ERROR` | no |
| 429 quota | `PROVIDER_RATE_LIMITED` | yes if within policy |
| 500/502/503 | `PROVIDER_UNAVAILABLE` | yes |
| Deadline/timeout | `PROVIDER_TIMEOUT` | yes |
| Safety block | `CONTENT_BLOCKED` (200-class refusal) | no |
| Invalid JSON / schema mismatch | `PROVIDER_INVALID_RESPONSE` | after 1 repair |
| Context too long | `CONTEXT_TOO_LARGE` (pre-check) | no (trim first) |

Error bodies are logged with provider request id only; never echoed to clients.

## 13. Cost

Prices per 1M input/output tokens live in the registry (`input_price_per_mtok`,
`output_price_per_mtok`), plus image and audio units. Cost is computed per call:

```
cost_micros = round((in_tokens * in_price + out_tokens * out_price) / 1_000_000 * 1_000_000)
```

Values are seeded from the provider's published pricing at implementation time and updated by migration.
Historical costs are never recomputed.

## 14. Testing

| Test | Method |
|---|---|
| Text generation | recorded fixture + live smoke (opt-in) |
| Structured output valid | fixture; schema mismatch fixture → repair path |
| Tool call normalization | fixture with parallel calls |
| Vision | fixture with a labeled screenshot set |
| Embedding dimensions | assert vector length == configured dim |
| 429 / 500 / timeout | fault-injected httpx transport |
| Auth failure | no retry, no fallback, alert |
| Cost math | unit test against fixture usage |

## 15. Acceptance criteria

- [ ] No model id literal outside the registry/config.
- [ ] All four required capabilities verified by contract tests for the configured models.
- [ ] Vision requests cannot be routed to a non-vision model.
- [ ] Embedding dimension always matches the schema column and index version.
- [ ] 401 never triggers fallback.

## 16. Related documents

[28](28-AI-PROVIDER-ABSTRACTION.md) · [30](30-NVIDIA-NIM-FALLBACK-INTEGRATION.md) ·
[31](31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) · [33](33-EMBEDDING-AND-MULTIMODAL-MODELS.md) ·
[34](34-AI-EVALUATION-AND-COST-MANAGEMENT.md)

## 17. References

- Google Gen AI SDK — https://ai.google.dev/gemini-api/docs/libraries
- Interactions API — https://ai.google.dev/gemini-api/docs/interactions-overview
- Structured outputs — https://ai.google.dev/gemini-api/docs/interactions/structured-output
- Function calling — https://ai.google.dev/gemini-api/docs/function-calling
- Embeddings — https://ai.google.dev/gemini-api/docs/embeddings
