# API Design and OpenAPI Contracts

**Doc ID:** 23 · **Status:** Approved (normative) · **Area:** API
**Depends on:** [22](22-BACKEND-ARCHITECTURE.md) · **Related:** [27](27-ERROR-HANDLING-AND-RESILIENCE.md), [54](../09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md), [56](../09-sdk-and-integrations/56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md)

---

## 1. Purpose

Define the public HTTP contract: URL structure, resource model, authentication, errors, pagination, filtering,
idempotency, rate limits, versioning, and the OpenAPI workflow. The generated client and SDK derive from this.

## 2. Conventions

- Base: `https://api.vistra.dev` (prod), `https://api.staging.vistra.dev`, `http://localhost:8000` (dev).
- Prefix: `/v1`. Versioning is URI-based; breaking changes require `/v2` + 90-day overlap.
- JSON only (`application/json`), UTF-8, `snake_case` fields; SDK maps to camelCase.
- IDs are strings; timestamps ISO-8601 UTC with `Z`; money is never in responses (usage is in micros).
- Unknown fields in requests are rejected (`extra="forbid"`), except in JSONB config blobs.
- All responses include `X-Request-Id`.

## 3. Authentication matrix

| Auth | Header | Used by | Audience |
|---|---|---|---|
| Clerk session JWT | `Authorization: Bearer eyJ…` | Studio, docs site | `vistra-api` |
| API key | `Authorization: Bearer vst_live_…` | Host servers, CI | application |
| SDK session token | `Authorization: Bearer eyJ…` (aud `sdk`) | Widget/SDK | `sdk` |
| Webhook signature | `Vistra-Signature` | Receivers (outbound) | endpoint secret |

Requests with a token of the wrong audience return `401 AUTH_INVALID_AUDIENCE`. A key never acts as a user.

## 4. Endpoint inventory

### 4.1 Identity and org

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/v1/me` | user | self |
| GET | `/v1/organizations` | user | member |
| GET | `/v1/organizations/{org_id}` | user | `org.read` |
| PATCH | `/v1/organizations/{org_id}` | user | `org.update` |
| DELETE | `/v1/organizations/{org_id}` | user | `org.delete` |
| GET | `/v1/organizations/{org_id}/members` | user | `member.read` |
| POST | `/v1/organizations/{org_id}/invitations` | user | `member.invite` |
| PATCH | `/v1/organizations/{org_id}/members/{user_id}` | user | `member.role.update` |
| DELETE | `/v1/organizations/{org_id}/members/{user_id}` | user | `member.remove` |

### 4.2 Projects and applications

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET/POST | `/v1/projects` | user | `application.read` / `application.create` |
| GET/PATCH/DELETE | `/v1/projects/{id}` | user | read / update / delete |
| GET/POST | `/v1/applications` | user | `application.read` / `application.create` |
| GET/PATCH/DELETE | `/v1/applications/{id}` | user | `application.*` |
| POST | `/v1/applications/{id}/domains` | user | `application.update` |
| DELETE | `/v1/applications/{id}/domains/{domain_id}` | user | `application.update` |
| GET | `/v1/applications/{id}/keys` | user | `apikey.read` |
| POST | `/v1/applications/{id}/keys` | user | `apikey.create` |
| POST | `/v1/applications/{id}/keys/{key_id}/rotate` | user | `apikey.create` |
| DELETE | `/v1/applications/{id}/keys/{key_id}` | user | `apikey.revoke` |

### 4.3 SDK surface

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/v1/sdk/sessions` | API key | mints end-user session token; origin validated |
| POST | `/v1/sdk/sessions/{id}/refresh` | API key | rotate session token |
| POST | `/v1/sdk/sessions/{id}/revoke` | API key | host-initiated revoke |
| POST | `/v1/sdk/messages` | sdk token | send message; SSE response |
| GET | `/v1/sdk/sessions/{id}/messages` | sdk token | history |
| POST | `/v1/sdk/messages/{id}/feedback` | sdk token | rating/comment |
| POST | `/v1/sdk/guides` | sdk token | create guide flow |
| POST | `/v1/sdk/guides/{flow_id}/steps/{index}` | sdk token | report step outcome |
| POST | `/v1/sdk/approvals/{id}` | sdk token | grant/reject (if scope allows) |
| POST | `/v1/sdk/context` | sdk token | submit capture snapshot (bounded) |
| GET | `/v1/sdk/config` | API key | public runtime config (widget, capabilities) |

### 4.4 Agents, tools, workflows

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET/POST | `/v1/applications/{app}/agents` | user | `agent.read` / `agent.write` |
| GET/PATCH/DELETE | `/v1/agents/{id}` | user | `agent.*` |
| POST | `/v1/agents/{id}/versions` | user | `agent.write` |
| POST | `/v1/agents/{id}/versions/{v}/publish` | user | `agent.publish` |
| GET/POST | `/v1/applications/{app}/tools` | user | `tool.read` / `tool.write` |
| POST | `/v1/tools/{id}/versions` | user | `tool.write` |
| POST | `/v1/tools/{id}/test` | user | `tool.write` (dry-run, no side effects outside test) |
| GET/PUT | `/v1/agents/{id}/policies` | user | `policy.write` |
| GET/POST | `/v1/applications/{app}/workflows` | user | `workflow.write` |
| POST | `/v1/workflows/{id}/runs` | user | `agent.run` |
| GET | `/v1/runs/{id}` | user | `run.read` |
| GET | `/v1/runs/{id}/steps` | user | `run.read` |
| POST | `/v1/runs/{id}/cancel` | user | `run.cancel` |
| POST | `/v1/runs/{id}/resume` | user | `run.cancel` |
| POST | `/v1/approvals/{id}/decide` | user | `run.read` + policy |
| GET | `/v1/sessions` | user | `session.read` |
| GET | `/v1/sessions/{id}` | user | `session.read` |
| GET | `/v1/sessions/{id}/events` | user | `run.read` (SSE) |

### 4.5 Knowledge

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET/POST | `/v1/knowledge-bases` | user | `knowledge.read` / `knowledge.write` |
| GET/PATCH/DELETE | `/v1/knowledge-bases/{id}` | user | `knowledge.*` |
| GET/POST | `/v1/knowledge-bases/{id}/collections` | user | `knowledge.*` |
| GET/POST | `/v1/collections/{id}/sources` | user | `knowledge.*` |
| DELETE | `/v1/sources/{id}` | user | `knowledge.write` |
| POST | `/v1/sources/{id}/reingest` | user | `knowledge.write` |
| GET | `/v1/sources/{id}/documents` | user | `knowledge.read` |
| GET | `/v1/documents/{id}` | user | `knowledge.read` |
| DELETE | `/v1/documents/{id}` | user | `knowledge.write` |
| GET | `/v1/ingestion-jobs/{id}` | user | `knowledge.read` |
| POST | `/v1/knowledge/search` | user or sdk | `knowledge.read` (debug/playground) |
| POST | `/v1/files/presign` · `/v1/files/{id}/complete` | user | `knowledge.write` |

### 4.6 Platform

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/healthz` | none | liveness + dependency summary (no secrets) |
| GET | `/readyz` | none | readiness (DB/Redis reachable) |
| GET | `/v1/usage` | user | `usage.read` |
| GET | `/v1/usage/export` | user | `analyst+`, audited |
| GET | `/v1/audit-events` | user | `audit.read` |
| GET | `/v1/audit-events/export` | user | `audit.export` |
| GET/POST | `/v1/webhook-endpoints` | user | `webhook.write` |
| GET | `/v1/webhook-deliveries` | user | `webhook.write` |
| GET/POST | `/v1/integrations` | user | `integration.write` |
| GET/POST | `/v1/mcp-servers` | user | `integration.write` |
| GET/POST | `/v1/evaluation-suites` | user | `evaluation.run` |
| POST | `/v1/evaluation-suites/{id}/runs` | user | `evaluation.run` |
| GET | `/v1/internal/webhooks/{event_id}` | internal | replay (admin) |

Full field-level schemas are generated into `openapi.json`; this table is the inventory and permission
contract.

### 4.x Implemented additions (2026-11-14 slice)

Added for the dashboard and configurable agents (ADR-031). "user" means a Clerk session (full scope on the user's own
organization) or an API key with the named scope; `*` keys pass every scope.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/me` | user | Organization, active application, applications (auto-provisions on first Clerk sign-in) |
| POST/GET/PATCH | `/v1/applications`, `/v1/applications/{app}` | user, `applications:write` | Create / read / rename, tool base URL |
| POST/DELETE | `/v1/applications/{app}/domains` | user, `applications:write` | Allowed SDK origins |
| GET/DELETE | `/v1/applications/{app}/keys`, `/keys/{key}` | user, `keys:write` | List / revoke API keys |
| POST | `/v1/applications/{app}/tool-secret` | user, `applications:write` | Rotate per-app HMAC tool secret (shown once, encrypted at rest) |
| POST | `/v1/applications/{app}/playground-session` | user (dashboard origin only) | SDK token for the dashboard playground |
| GET | `/v1/applications/{app}/agents` | user, `applications:read` | Agents (ensures a published default) |
| GET/PATCH | `/v1/agents/{id}` | user | Detail with versions + runs per version; pause/resume |
| POST | `/v1/agents/{id}/versions[?publish=true]` | user, `applications:write` | New immutable version |
| POST | `/v1/agents/{id}/versions/{v}/publish` | user, `applications:write` | Roll forward/back |
| DELETE | `/v1/collections/{id}/sources/{source}` | user, `knowledge:write` | Delete source (cascades chunks/embeddings) |
| GET | `/v1/runs?limit&application_id` | user | Run list |
| GET | `/v1/usage/timeseries?days`, `/v1/usage/breakdown?days` | user | Charts: runs, calls, latency, tokens, intents, p95, error codes |
| GET | `/v1/events?limit&run_id` | user | Persisted agent events (no token chunks) |
| GET | `/v1/audit-events?limit` | user | Append-only audit trail |

## 5. Response envelope

Single resource: the object. List: an object with data + cursor.

```json
{
  "data": [ { "id": "app_01H…", "name": "Acme Console" } ],
  "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0xMS0xNFQxMDowMDowMFoiLCJpZCI6Ii4uLiJ9",
  "has_more": true
}
```

No `success`/`error` boolean envelope. HTTP status carries success; errors use problem+json (§6).

## 6. Errors

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json
X-Request-Id: req_01H…
```

```json
{
  "type": "https://docs.vistra.dev/errors/tool-args-invalid",
  "title": "Tool arguments are invalid",
  "status": 422,
  "code": "TOOL_ARGS_INVALID",
  "detail": "Argument 'project_name' must be 1-120 characters.",
  "instance": "/v1/tools/tol_01H/test",
  "request_id": "req_01H…",
  "errors": [{ "field": "project_name", "code": "too_long", "message": "max 120 characters" }]
}
```

`code` values are stable and enumerated in [27](27-ERROR-HANDLING-AND-RESILIENCE.md). `detail` is user-safe:
no SQL, no stack traces, no secrets, no provider payloads.

## 7. Pagination, filtering, sorting

- Cursor-based: `?limit=50&cursor=…`. Default 25, max 100.
- Cursor encodes `(created_at, id)`; opaque base64url. Never expose offsets for unbounded tables.
- Filters are explicit query params (`status`, `created_after`, `q`), never a free-form expression language.
- Sorting: `?sort=-created_at` with an allowlist per endpoint; default `-created_at`.
- Total counts only where cheap (`has_more` is mandatory; `total` is opt-in and documented).

## 8. Idempotency

Mutating endpoints accept `Idempotency-Key: <uuid>`. Semantics:

- Stored `(organization_id, key, endpoint)` → `(status, body_hash, response_snapshot)` for 24 h.
- Same key + same body → replay the stored response (same status), with `Idempotent-Replay: true`.
- Same key + different body → `409 IDEMPOTENCY_KEY_REUSED`.
- Concurrent duplicate → one executes; the other waits (Redis lock, 5 s) then replays or returns 409.

Required on: create/rotate key, source creation, tool invocation via public API, approval decision.

## 9. Rate limits

| Scope | Default |
|---|---|
| Per user (Studio) | 600 req/min |
| Per API key | 1,200 req/min; 60 session mints/min |
| Per SDK session | 30 messages/min; 10 guide flows/min |
| Ingestion jobs | 20 concurrent per org |
| Expensive ops (search, eval) | 60 req/min per org |

Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`; `429` includes `Retry-After`.
Limits are configurable per plan; enforcement is documented in doc 27.

## 10. OpenAPI workflow

```mermaid
flowchart LR
  PY[Pydantic models + routers] --> GEN[openapi.json export]
  GEN --> LINT[spectral lint + breaking-change diff]
  GEN --> CLIENT[@vistra/api-client generation]
  GEN --> DOCS[docs-site API reference]
  LINT --> CI[CI gate]
  CLIENT --> CI
```

- `openapi.json` is committed and generated (`python -m app.tools.export_openapi`).
- CI fails on: schema diff that breaks `/v1` (removed field, narrowed type, new required field, changed status),
  missing operation ids, missing error responses, or unauthenticated operations without an explicit marker.
- Each operation has: `operationId`, summary, tags, security, `429`/`500` responses, and examples.
- The generated client is never hand-edited; overrides live in a documented wrapper.

## 11. Versioning and deprecation

- Additive changes are non-breaking and ship in `/v1`.
- Breaking changes require `/v2`, with `/v1` maintained for ≥ 90 days and `Deprecation`/`Sunset` headers.
- SDK majors follow API versions; the SDK never requires a backend deploy to stay compatible.

## 12. Failure and edge behavior

| Case | Behavior |
|---|---|
| Unknown route | 404 problem+json, not HTML |
| Unsupported method | 405 with `Allow` |
| Body too large | 413 `PAYLOAD_TOO_LARGE` |
| Wrong content type | 415 `UNSUPPORTED_MEDIA_TYPE` |
| Invalid JSON | 400 `INVALID_JSON` |
| Unknown field | 422 with field error |
| Deeply nested JSON (>10) | 422 `PAYLOAD_TOO_DEEP` |
| Concurrent update | 409 `VERSION_CONFLICT` (optimistic `version`) |
| Soft-deleted resource | 404 |

## 13. Acceptance criteria

- [ ] Every endpoint in §4 exists in `openapi.json` with auth, errors, and examples.
- [ ] Contract tests validate runtime responses against the schema.
- [ ] Breaking-change detection is enabled in CI.
- [ ] Pagination, idempotency, and rate limits are implemented as specified.
- [ ] No endpoint returns a field not present in the schema.

## 14. Implementation checklist

1. Establish router composition and version prefix.
2. Implement problem+json handler and error code registry.
3. Implement cursor pagination helpers and response models.
4. Implement idempotency middleware/storage.
5. Implement rate limiting with Redis.
6. Wire OpenAPI export, linting, and client generation in CI.
7. Add contract tests.

## 15. Related documents

[22](22-BACKEND-ARCHITECTURE.md) · [27](27-ERROR-HANDLING-AND-RESILIENCE.md) ·
[54](../09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) ·
[56](../09-sdk-and-integrations/56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md) ·
[61](../10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md)
