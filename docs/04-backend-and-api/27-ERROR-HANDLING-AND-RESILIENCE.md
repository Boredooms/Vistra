# Error Handling and Resilience

**Doc ID:** 27 · **Status:** Approved (normative) · **Area:** Backend
**Depends on:** [23](23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) · **Related:** [26](26-BACKGROUND-JOBS-AND-WORKERS.md), [31](../05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md), [64](../11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md)

---

## 1. Purpose

Define one error taxonomy, one wire format, one retry policy, and one degradation strategy across API, workers,
providers, and SDK. Consistent failure behavior is what makes an autonomous platform trustworthy.

## 2. Error taxonomy

Every error has: `code` (stable), `status` (HTTP), `class` (retry semantics), `message` (user-safe),
`details` (optional), `log_level`.

| Class | Meaning | Retry? | Example |
|---|---|---|---|
| `validation` | Caller sent invalid input | no | `TOOL_ARGS_INVALID` |
| `authn` | Identity missing/invalid | no (refresh) | `AUTH_TOKEN_EXPIRED` |
| `authz` | Not permitted | no | `INSUFFICIENT_ROLE` |
| `not_found` | Missing or cross-tenant | no | `NOT_FOUND` |
| `conflict` | State conflict | sometimes | `VERSION_CONFLICT` |
| `rate_limit` | Quota exceeded | yes (after delay) | `RATE_LIMITED` |
| `dependency` | Upstream failed | yes (bounded) | `PROVIDER_UNAVAILABLE` |
| `configuration` | Wrong/missing config | no | `PROVIDER_CONFIGURATION_ERROR` |
| `capability` | Capability unsupported | no | `CAPABILITY_UNAVAILABLE` |
| `internal` | Unexpected | maybe | `INTERNAL_ERROR` |

## 3. Code registry (canonical)

### 3.1 Auth and tenancy
`AUTH_MISSING` 401 · `AUTH_INVALID_TOKEN` 401 · `AUTH_INVALID_SIGNATURE` 401 · `AUTH_TOKEN_EXPIRED` 401 ·
`AUTH_INVALID_ISSUER` 401 · `AUTH_INVALID_AUDIENCE` 401 · `AUTH_UNAVAILABLE` 503 ·
`IDENTITY_NOT_READY` 409 · `ACCOUNT_DISABLED` 403 · `INSUFFICIENT_ROLE` 403 ·
`ORGANIZATION_REQUIRED` 400 · `ORGANIZATION_DELETED` 404 ·
`API_KEY_INVALID` 401 · `API_KEY_REVOKED` 401 · `API_KEY_EXPIRED` 401 · `API_KEY_SCOPE_INSUFFICIENT` 403 ·
`ORIGIN_NOT_ALLOWED` 403 · `SESSION_EXPIRED` 401 · `SESSION_REVOKED` 401

### 3.2 Validation and protocol
`INVALID_JSON` 400 · `VALIDATION_ERROR` 422 · `PAYLOAD_TOO_LARGE` 413 · `PAYLOAD_TOO_DEEP` 422 ·
`UNSUPPORTED_MEDIA_TYPE` 415 · `NOT_FOUND` 404 · `METHOD_NOT_ALLOWED` 405 ·
`VERSION_CONFLICT` 409 · `IDEMPOTENCY_KEY_REUSED` 409 · `RATE_LIMITED` 429 ·
`STORAGE_QUOTA_EXCEEDED` 402 · `PLAN_LIMIT_EXCEEDED` 402

### 3.3 Knowledge and ingestion
`FILE_TYPE_NOT_ALLOWED` 422 · `FILE_CORRUPTED` 422 · `FILE_ENCRYPTED` 422 · `FILE_TOO_LARGE` 413 ·
`DUPLICATE_DOCUMENT` 409 · `PARSE_ERROR` 422 · `PARSE_PARTIAL` 200 (flag) ·
`EGRESS_BLOCKED` 422 · `SOURCE_UNREACHABLE` 422 · `EMBEDDING_FAILED` 502 ·
`INDEX_NOT_READY` 409 · `RETRIEVAL_DEGRADED` 200 (flag) · `INSUFFICIENT_EVIDENCE` 200 (flag)

### 3.4 Agents, tools, approvals
`AGENT_NOT_PUBLISHED` 409 · `AGENT_VERSION_MISMATCH` 409 · `RUN_NOT_FOUND` 404 ·
`RUN_ALREADY_ACTIVE` 409 · `RUN_CANCELLED` 409 · `RUN_TIMEOUT` 504 ·
`TOOL_NOT_FOUND` 404 · `TOOL_ARGS_INVALID` 422 · `TOOL_DENIED_BY_POLICY` 403 ·
`TOOL_UPSTREAM_ERROR` 502 · `TOOL_UPSTREAM_TIMEOUT` 504 · `TOOL_VERIFICATION_FAILED` 502 ·
`APPROVAL_REQUIRED` 409 · `APPROVAL_EXPIRED` 409 · `APPROVAL_REJECTED` 409 ·
`WORKFLOW_STEP_FAILED` 502 · `WORKFLOW_PARTIAL` 200 (flag)

### 3.5 Providers
`PROVIDER_UNAVAILABLE` 503 · `PROVIDER_TIMEOUT` 504 · `PROVIDER_RATE_LIMITED` 429 ·
`PROVIDER_CONFIGURATION_ERROR` 500 · `PROVIDER_INVALID_RESPONSE` 502 ·
`CAPABILITY_UNAVAILABLE` 501 · `FALLBACK_EXHAUSTED` 503 · `CONTEXT_TOO_LARGE` 413

### 3.6 Platform
`DATABASE_UNAVAILABLE` 503 · `STORAGE_UNAVAILABLE` 503 · `CACHE_UNAVAILABLE` 503 (only for sensitive paths) ·
`INTERNAL_ERROR` 500 · `NOT_IMPLEMENTED` 501 · `MAINTENANCE_MODE` 503

Rules: codes are never reused with a different meaning; adding one updates this table and the SDK's error
union; `message` may change, `code` may not.

## 4. Wire format

`application/problem+json` per [23](23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) §6. Guarantees:

- `request_id` always present.
- `detail` never includes SQL, stack traces, tokens, provider payloads, or another tenant's identifiers.
- `errors[]` present for field-level validation, keyed by JSON path.
- `retryable` boolean included for `dependency` and `rate_limit` classes.

## 5. Implementation

```python
class VistraError(Exception):
    code: ClassVar[str] = "INTERNAL_ERROR"
    status: ClassVar[int] = 500
    klass: ClassVar[ErrorClass] = ErrorClass.INTERNAL

class ToolArgsInvalid(VistraError):
    code = "TOOL_ARGS_INVALID"; status = 422; klass = ErrorClass.VALIDATION
    def __init__(self, errors: list[FieldError]):
        self.errors = errors

# global handler
@app.exception_handler(VistraError)
async def handle(request, exc):
    body = problem(exc, request_id=ctx.request_id)
    log.at_level(exc.log_level).warning("error", code=exc.code, **ctx.scope)
    return JSONResponse(body, status_code=exc.status, media_type="application/problem+json")
```

Hard rules:
- Never `except Exception: return 500` in a handler.
- Never leak `str(exc)` from third-party libraries into `detail`.
- Never log a request body on error unless it is redacted and sampled.

## 6. Resilience primitives

### 6.1 Timeouts

| Call | Timeout | Notes |
|---|---|---|
| DB query (OLTP) | 5 s | statements > 1 s logged |
| DB query (retrieval) | 8 s | ANN + FTS + rerank |
| Provider (fast tier) | 20 s | classification |
| Provider (reasoning) | 60 s | streaming idle timeout 30 s |
| Provider (vision) | 45 s | image payloads |
| Storage op | 15 s | uploads use presigned direct path |
| Tool call | per-tool, default 15 s | schema declares override up to 120 s |
| Webhook delivery | 10 s | |
| Whole request | 30 s | streaming routes have explicit budgets |

### 6.2 Retries

- Idempotent reads: ≤ 2 retries, jittered, on 5xx/timeout/429.
- Provider generation: ≤ 2 retries for retryable classes; then capability fallback.
- Tool execution: only if declared idempotent **and** the error is a pre-execution transport failure; never
  after a request reached the host API.
- Webhooks: 8 attempts with exponential backoff up to 24 h.

### 6.3 Circuit breakers

Per `(provider, capability)` and per `(tool, application)`:

```
closed ──(5 failures / 60s)──▶ open ──(30s)──▶ half_open ──(1 success)──▶ closed
                                                        └─(failure)──▶ open
```

While open: fallback provider is used (if capability-compatible), or the call fails fast with
`PROVIDER_UNAVAILABLE`/`FALLBACK_EXHAUSTED`. Breaker state is per-instance and exported as a metric.

### 6.4 Bulkheads

Separate concurrency pools for interactive agent runs, ingestion, webhooks, and evaluation so one workload
cannot exhaust connections or CPU for another.

### 6.5 Graceful degradation

| Degraded component | Behavior |
|---|---|
| Reranker | use fused vector+lexical order, set `rerank_degraded` |
| Embedding provider | lexical-only retrieval with `RETRIEVAL_DEGRADED` warning; no fabricated citations |
| Vision provider | answer without visual claims; explicitly say the screen could not be read |
| Redis | DB polling for streams; rate limits fail closed only for auth-sensitive routes |
| Primary provider | fallback if capability-compatible; else explicit 503 |
| Storage | reads from cached parsed text; uploads rejected with retry guidance |

**Never degrade into a lie.** Missing evidence, missing vision, or missing execution must be stated.

## 7. Idempotency and duplicate prevention

| Operation | Key | Storage |
|---|---|---|
| HTTP mutations | `Idempotency-Key` | Redis + `idempotency` table |
| Tool call | `(run_id, step_id, tool_id)` | unique on `tool_invocations` |
| Job dispatch | `dedupe_key` | unique on `jobs` |
| Webhook delivery | `(endpoint_id, event_id)` | unique on `webhook_deliveries` |
| Message send | `(session_id, client_message_id)` | unique on `session_messages` |

## 8. Failure scenarios and expected behavior

| Scenario | Expected |
|---|---|
| Provider returns 500 twice | Retry with backoff, then fallback, then `PROVIDER_UNAVAILABLE` |
| Provider returns 401 | `PROVIDER_CONFIGURATION_ERROR`, no retry, alert |
| Provider returns 429 with `Retry-After` | honor it; if beyond request budget, fallback |
| Model returns invalid JSON | one repair attempt, then `PROVIDER_INVALID_RESPONSE` |
| Tool host returns 500 | no retry for `external`; `TOOL_UPSTREAM_ERROR`; run failed |
| Approval expires | `APPROVAL_EXPIRED`; re-propose |
| DB deadlock | retry transaction ≤ 2 |
| Bulk partial failure | 207-style `{data, errors[]}` only where documented; otherwise fail whole request |

## 9. Client behavior (SDK/Studio)

- Retry `GET` on network error and 5xx (≤ 2, exponential).
- Retry `POST` only with an idempotency key.
- On `AUTH_TOKEN_EXPIRED`: refresh once, replay the request.
- On `CAPABILITY_UNAVAILABLE` / `PROVIDER_UNAVAILABLE`: show a degraded-mode message, not a generic error.
- Surface `request_id` in error UI for support.

## 10. Observability

- Error counter by `code`, route, org tier.
- Retry/fallback counters; breaker state gauge.
- Alert on: `INTERNAL_ERROR` rate > 0.5%, any `PROVIDER_CONFIGURATION_ERROR`, dead jobs > 0,
  `TOOL_VERIFICATION_FAILED` > 0 (indicates a real correctness issue).

## 11. Acceptance criteria

- [ ] Every thrown error maps to a registered code (test enumerates codes).
- [ ] No 500 response contains internal detail.
- [ ] Retry counts and fallbacks are observable per request.
- [ ] Side-effecting operations are never retried after reaching the host.
- [ ] Degraded responses are explicitly flagged, never silently substituted.

## 12. Related documents

[23](23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) · [26](26-BACKGROUND-JOBS-AND-WORKERS.md) ·
[31](../05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) ·
[47](../07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) ·
[64](../11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md)
