# NVIDIA NIM Fallback Provider

**Doc ID:** 30 · **Status:** Approved · **Area:** AI
**Depends on:** [28](28-AI-PROVIDER-ABSTRACTION.md) · **Related:** [31](31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md), [27](../04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md), [34](34-AI-EVALUATION-AND-COST-MANAGEMENT.md)

---

## 1. Purpose

Specify the NVIDIA NIM adapter: endpoint, auth, model discovery, capability probing, request mapping, tool
calling, structured output limitations, error mapping, and what must **not** be routed here.

## 2. Facts this document relies on (verified)

- Base URL: `https://integrate.api.nvidia.com/v1`
- Auth: `Authorization: Bearer $NVIDIA_API_KEY` (key from build.nvidia.com).
- Chat: `POST /v1/chat/completions` (OpenAI-compatible), streaming via SSE with `stream: true`.
- Model catalogue: `GET /v1/models` (lists many models, not all callable with a given key; availability varies
  by tier).
- Also exposes `/v1/embeddings` and `/v1/reranking` for supported models.
- Tool calling and JSON mode are **per-model** capabilities; some models ignore `tools` and answer in prose —
  detected by inspecting `finish_reason`/response shape, not by assuming success.
- Hosted free tier has aggressive rate limits (order of tens of requests/minute) and does not return
  consistent rate-limit headers; plan for 429s.

## 3. Role in VISTRA

| Allowed | Not allowed |
|---|---|
| `text.fast` for classification/rewriting fallback | `vision.image` unless the specific model advertises vision **and** passes the vision contract suite |
| `text.reasoning` for planning fallback with a capable model | `realtime.voice` (no equivalent integration) |
| `structured.json` with `structured_support = "validated"` | Being used as the default for embeddings (separate index required) |
| `tools.function_calling` for models that pass the tool suite | Tool execution authority (policy engine is provider-independent) |
| `rerank` where a rerank model is configured | Silent substitution for a primary response without a `fallback_used` flag |

## 4. Configuration

```env
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL_DEFAULT=
NVIDIA_MODEL_REASONING=
NVIDIA_MODEL_VISION=
NVIDIA_MODEL_RERANK=
NVIDIA_REQUEST_TIMEOUT_MS=45000
NVIDIA_MAX_CONCURRENCY=16
NVIDIA_RPM_LIMIT=40               # defensive client-side budget
```

`NVIDIA_API_KEY` absent ⇒ fallback disabled (logged once at boot). Primary-only operation remains valid.

## 5. Adapter structure

```
providers/nvidia/
  client.py        # httpx.AsyncClient, base_url, auth, timeout, semaphore
  chat.py          # messages mapping, streaming parser
  structured.py    # JSON mode + validation + repair
  tools.py         # tool schema mapping, finish_reason detection
  capabilities.py  # probe results per model, cached in DB/registry
  mapping.py       # errors, usage, finish reasons
```

The adapter uses `httpx` directly rather than the OpenAI SDK: one dependency less, and the mapping is explicit
(ADR-006).

## 6. Request mapping

```python
payload = {
  "model": spec.model_id,
  "messages": [
     {"role": "system", "content": system},
     *[{"role": m.role, "content": flatten_text_parts(m)} for m in messages],
  ],
  "temperature": req.temperature,
  "max_tokens": req.max_output_tokens,
  "stream": True,
  "top_p": req.top_p,
}
```

- Images are **rejected** unless the model declares vision and the message shape uses the OpenAI
  `content: [{type:"text"},{type:"image_url"}]` form; the adapter converts `file_id` to a data URL or signed
  URL only if the model accepts URLs (otherwise base64 within limits).
- `tool_result` parts map to `role:"tool"` messages with `tool_call_id`.
- Streaming parser handles `data: {json}` chunks and `data: [DONE]`; usage may arrive only in the final chunk or
  only when `stream_options.include_usage` is supported — the adapter falls back to local token estimation and
  marks `usage_estimated=true`.

## 7. Structured output

NVIDIA models vary. The adapter supports three modes, chosen per model in the registry:

| Mode | Mechanism | Guarantee |
|---|---|---|
| `json_schema` (rare) | `response_format: {type:"json_schema", json_schema:{...}}` | provider-enforced |
| `json_object` | `response_format: {type:"json_object"}` + schema in the prompt | validated locally |
| `prompt_only` | schema instructions + parsing | validated locally, lowest reliability |

All modes validate with Pydantic and apply the same repair policy as Gemini (one attempt with the validation
error). A model with `structured_support = "none"` is never selected for `STRUCTURED_JSON`.

## 8. Tool calling

```python
payload["tools"] = [{"type":"function","function":{
   "name": tool_name, "description": tool.description,
   "parameters": tool.args_schema}}]
payload["tool_choice"] = "auto"    # or "required" for action steps
```

Detection: a model that ignores tools returns `finish_reason="stop"` with prose. The adapter therefore
distinguishes:
- `tool_calls` present → `ToolTurn(calls=[...])`
- `finish_reason="tool_calls"` but empty array → `PROVIDER_INVALID_RESPONSE`
- prose with no calls while `tool_choice="required"` → `PROVIDER_INVALID_RESPONSE` (never treated as success)

Arguments are JSON-parsed and schema-validated; a parse error triggers one repair, not execution.

## 9. Model discovery and capability probing

At implementation/release time (not per request):

1. `GET /v1/models` → candidate ids.
2. Filter to the allowlist of models the team has approved (cost/quality/latency).
3. For each, run the **capability probe suite**: text, JSON, tools, (optionally) vision, with deterministic
   prompts; record pass/fail, p50 latency, and observed failure modes into the registry (`notes`, flags).
4. Only models that pass a capability's suite are registered for it.

Probing is a CI/nightly job (`evaluation-worker`), not a startup routine. A failing model is disabled, not
silently retried.

## 10. Rate limiting and concurrency

- Client-side budget: semaphore `NVIDIA_MAX_CONCURRENCY`, plus a token bucket at `NVIDIA_RPM_LIMIT` to avoid
  429 storms on the free tier.
- On 429: honor `Retry-After` if present, else exponential backoff with jitter; if the request deadline cannot
  accommodate it, fail with `PROVIDER_RATE_LIMITED` (and, for the router, treat as ineligible fallback for this
  call).
- Fallback-of-fallback is not attempted (no third provider); the user sees degraded mode.

## 11. Error mapping

| Signal | VISTRA error | Retry | Notes |
|---|---|---|---|
| 400 invalid request/schema | `PROVIDER_INVALID_REQUEST` | no | often a model incompatibility → disable in registry |
| 401/403 | `PROVIDER_CONFIGURATION_ERROR` | no | alert |
| 404 model | `PROVIDER_CONFIGURATION_ERROR` | no | remove/disable registry row |
| 422 | `PROVIDER_INVALID_REQUEST` | no | |
| 429 | `PROVIDER_RATE_LIMITED` | yes (bounded) | |
| 500/502/503 | `PROVIDER_UNAVAILABLE` | yes | |
| timeout | `PROVIDER_TIMEOUT` | yes | |
| malformed stream | `PROVIDER_INVALID_RESPONSE` | yes (once) | |
| prose instead of required tool call | `PROVIDER_INVALID_RESPONSE` | no | capability failure |

## 12. Quality caveats (must be reflected in product behavior)

- Reasoning quality differs from Gemini; fallback answers are marked `fallback_used` and may show a subtle
  "reduced capability" notice when the policy requires it.
- Tool-arg reliability is lower for some models; the policy engine and schema validation still gate execution,
  so a bad arg is a failed proposal, not a bad action.
- Long-context support varies; the router checks `context_window` before selecting.

## 13. Testing

| Test | Expectation |
|---|---|
| Streaming assembly | deltas concatenate to final text; usage present or estimated |
| Tool call response | normalized call with valid JSON args |
| Tool ignored | `PROVIDER_INVALID_RESPONSE`, no execution |
| JSON mode invalid | repair then typed error |
| 429 with/without header | backoff respects header or defaults |
| Vision request on text model | router refuses before the call |
| Registry disabled model | never selected |
| Cost estimate | matches fixture token counts × prices |

## 14. Acceptance criteria

- [ ] Fallback only occurs for capabilities the selected model advertises **and** has passed the probe suite.
- [ ] No tool execution can result from an unparsable or absent tool call.
- [ ] Every fallback is visible in telemetry and traces.
- [ ] A 401 on NVIDIA never triggers another provider attempt.
- [ ] Rate limits are respected client-side; 429 storms are bounded.

## 15. Related documents

[28](28-AI-PROVIDER-ABSTRACTION.md) · [29](29-GEMINI-PRIMARY-INTEGRATION.md) ·
[31](31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) · [45](../07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md) ·
[34](34-AI-EVALUATION-AND-COST-MANAGEMENT.md)

## 16. References

- NVIDIA NIM LLM APIs — https://docs.api.nvidia.com/nim/reference/llm-apis
- NVIDIA API catalog — https://build.nvidia.com/
- NIM API reference (self-hosted parity) — https://docs.nvidia.com/nim/large-language-models/latest/reference/api-reference.html
