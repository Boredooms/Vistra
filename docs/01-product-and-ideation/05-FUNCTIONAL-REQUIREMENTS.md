# Functional Requirements

**Doc ID:** 05 · **Status:** Approved · **Area:** Product / Engineering
**Depends on:** [02](02-PRODUCT-REQUIREMENTS.md) · **Related:** [08](08-ACCEPTANCE-CRITERIA.md), [12](../02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md)

---

## 1. Purpose

Decompose the product requirements into testable functional requirements (`FR-<area>-###`) owned by
modules. Each FR states behavior, inputs/outputs, error behavior, and the document that specifies it.

## 2. Scope

Platform behavior. UI composition is in [59](../10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md);
non-functional qualities in [06](06-NONFUNCTIONAL-REQUIREMENTS.md).

## 3. Conventions

- `FR-IDN` identity/tenancy · `FR-APP` applications · `FR-SES` sessions/conversations ·
  `FR-VIS` visual · `FR-KNW` knowledge · `FR-AGT` agents · `FR-TOL` tools/policy ·
  `FR-WRK` workflows/jobs · `FR-SDK` SDK/widget · `FR-API` public API/integrations ·
  `FR-STU` Studio · `FR-OPS` operations/metering.
- "Must" = P0. "Should" = P1. "May" = P2.
- Every FR references exactly one owning module from
  [12](../02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md).

---

## 4. Identity and tenancy (`FR-IDN`)

| ID | Requirement | Module | Spec |
|---|---|---|---|
| FR-IDN-001 | The API must verify a Clerk session token on every authenticated request against JWKS, validating signature, `iss`, `exp`, `nbf`, and authorized party; failures return 401 `AUTH_INVALID_TOKEN`. | `core/auth` | [17](../03-database-and-identity/17-CLERK-AUTHENTICATION.md) |
| FR-IDN-002 | The system must project Clerk users/orgs/memberships into `users`, `organizations`, `organization_members` via verified webhooks, idempotent on event id. | `modules/identity` | [17](../03-database-and-identity/17-CLERK-AUTHENTICATION.md) |
| FR-IDN-003 | Every org-scoped request must resolve exactly one organization from the token claim or an explicit `X-Organization-Id` header that is validated against membership. | `core/tenancy` | [18](../03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |
| FR-IDN-004 | Role checks must be enforced by a policy dependency returning `403 INSUFFICIENT_ROLE`, never inside the router body. | `core/tenancy` | [18](../03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |
| FR-IDN-005 | Organization deletion must be soft (30-day) then hard, cascading to projects, applications, agents, knowledge, sessions, and storage objects. | `modules/organizations` | [20](../03-database-and-identity/20-STORAGE-AND-FILE-LIFECYCLE.md) |
| FR-IDN-006 | Membership removal must revoke access on the next request and emit `organization.member.removed`. | `modules/identity` | [18](../03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |

## 5. Applications and API keys (`FR-APP`)

| ID | Requirement | Module | Spec |
|---|---|---|---|
| FR-APP-001 | Creating an application must return a public id (`app_<ulid>`) and a one-time-visible API key (`vst_live_…`/`vst_test_…`); only a SHA-256 hash is stored. | `modules/applications` | [56](../09-sdk-and-integrations/56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md) |
| FR-APP-002 | Embedding must be restricted to configured origins; a request from an unlisted origin returns 403 `ORIGIN_NOT_ALLOWED` and emits a security event. | `modules/applications` | [55](../09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md) |
| FR-APP-003 | API keys must support scopes (`sdk:session`, `knowledge:write`, `agent:run`, …), expiry, last-used tracking, and rotation with an overlap window. | `modules/applications` | [18](../03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |
| FR-APP-004 | An application must declare capability configuration: capture scope, enabled agents, allowed tools, retention overrides. | `modules/applications` | [49](../08-visual-and-ghost-cursor/49-VISUAL-CONTEXT-ENGINE.md) |

## 6. Sessions and conversations (`FR-SES`)

| ID | Requirement | Module | Spec |
|---|---|---|---|
| FR-SES-001 | The SDK must exchange `(app_id, API-key-signed host assertion or server-minted token)` for a short-lived session token (audience `sdk`, TTL ≤ 15 min) scoped to one application and one end-user reference. | `modules/sessions` | [54](../09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) |
| FR-SES-002 | A conversation must persist messages, roles, content parts, citations, token usage, and provider metadata. | `modules/conversations` | [24](../04-backend-and-api/24-SESSION-AND-CONVERSATION-MANAGEMENT.md) |
| FR-SES-003 | Message streaming must emit ordered SSE events (`message.started`, `content.delta`, `citation`, `tool.proposed`, `approval.required`, `message.completed`, `error`) and persist the final message atomically. | `modules/sessions` | [25](../04-backend-and-api/25-REALTIME-AND-EVENT-ARCHITECTURE.md) |
| FR-SES-004 | Conversations must support cancellation, resume-after-load, and a max message count per session. | `modules/conversations` | [24](../04-backend-and-api/24-SESSION-AND-CONVERSATION-MANAGEMENT.md) |
| FR-SES-005 | Session tokens must be revocable per end user and expire regardless of activity. | `modules/sessions` | [18](../03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |

## 7. Visual context (`FR-VIS`)

| ID | Requirement | Module | Spec |
|---|---|---|---|
| FR-VIS-001 | The SDK must collect route, title, viewport, scroll, and a bounded accessibility summary, respecting `data-vistra-ignore` and form-field redaction. | `visible` (SDK) + `modules/visual` | [49](../08-visual-and-ghost-cursor/49-VISUAL-CONTEXT-ENGINE.md) |
| FR-VIS-002 | Screenshot capture must be opt-in per application, downscaled, redacted, and retained per policy (default: not persisted beyond the request). | `modules/visual` | [49](../08-visual-and-ghost-cursor/49-VISUAL-CONTEXT-ENGINE.md) |
| FR-VIS-003 | Element selection must produce a normalized descriptor: role, accessible name, tag, attributes allowlist, text excerpt, bounding box, and a stability score. | `visible` | [50](../08-visual-and-ghost-cursor/50-DOM-AND-ACCESSIBILITY-INSPECTION.md) |
| FR-VIS-004 | Context must be size-bounded (tokens) with deterministic truncation that preserves headings, selected element, and errors. | `modules/visual` | [32](../05-ai-and-model-infrastructure/32-PROMPT-AND-CONTEXT-MANAGEMENT.md) |
| FR-VIS-005 | Cross-origin iframe content must not be read; the API must report `capture_limited` rather than pretending completeness. | `visible` | [50](../08-visual-and-ghost-cursor/50-DOM-AND-ACCESSIBILITY-INSPECTION.md) |

## 8. Knowledge (`FR-KNW`)

| ID | Requirement | Module | Spec |
|---|---|---|---|
| FR-KNW-001 | An organization must be able to create multiple knowledge bases and assign collections to agents per environment. | `modules/knowledge` | [35](../06-knowledge-and-rag/35-KNOWLEDGE-ENGINE-ARCHITECTURE.md) |
| FR-KNW-002 | Source creation must validate type, size, and reachability, then create an `ingestion_job`; the request must return immediately with a job id. | `modules/ingestion` | [36](../06-knowledge-and-rag/36-DOCUMENT-INGESTION-AND-PARSING.md) |
| FR-KNW-003 | Ingestion must record per-stage status (`queued|fetching|parsing|chunking|embedding|indexing|ready|failed`) with attempts and error codes. | `services/ingestion` | [26](../04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md) |
| FR-KNW-004 | Documents must be versioned by content hash; re-upload of identical content must not duplicate vectors. | `modules/ingestion` | [37](../06-knowledge-and-rag/37-CHUNKING-AND-METADATA-EXTRACTION.md) |
| FR-KNW-005 | Retrieval must combine vector and full-text candidates, apply ACL/tenant filters in SQL, rerank, dedupe, and return top-k with scores. | `modules/retrieval` | [38](../06-knowledge-and-rag/38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) |
| FR-KNW-006 | Answers must cite retrieved chunk ids with document title, version, page/section; validation must reject citations not present in context. | `modules/retrieval` | [39](../06-knowledge-and-rag/39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md) |
| FR-KNW-007 | Deleting a source must remove its documents, chunks, vectors, and stored objects within the retention window, and invalidate caches. | `modules/knowledge` | [20](../03-database-and-identity/20-STORAGE-AND-FILE-LIFECYCLE.md) |
| FR-KNW-008 | Ingestion must block SSRF: DNS resolution checks, private-range denial, redirect limits, and per-source egress policy. | `services/ingestion` | [40](../06-knowledge-and-rag/40-KNOWLEDGE-SOURCE-CONNECTORS.md) |

## 9. Agents (`FR-AGT`)

| ID | Requirement | Module | Spec |
|---|---|---|---|
| FR-AGT-001 | The orchestrator must classify intent into a bounded taxonomy and select an agent plan; classification output must be schema-validated. | `modules/orchestration` | [43](../07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md) |
| FR-AGT-002 | Agent definitions and versions must be persisted; every run must reference an immutable `agent_version`. | `modules/agents` | [44](../07-agents-and-execution/44-SPECIALIZED-AGENT-ARCHITECTURE.md) |
| FR-AGT-003 | Runs must persist state at each step transition and be resumable by a worker after restart. | `services/agent-worker` | [26](../04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md) |
| FR-AGT-004 | Specialized agents must exist for vision, knowledge, guide, action, workflow, and live modes with documented contracts. | `modules/orchestration` | [44](../07-agents-and-execution/44-SPECIALIZED-AGENT-ARCHITECTURE.md) |
| FR-AGT-005 | Execution traces must record plan, steps, retrieval, provider/model, tokens, cost, latencies, policy decisions, approvals, and verification. | `modules/agents` | [48](../07-agents-and-execution/48-AGENT-MEMORY-AND-EXECUTION-TRACES.md) |
| FR-AGT-006 | Memory must be scoped: session (short), end-user (opt-in, tenant policy), organization (shared knowledge only). | `modules/agents` | [48](../07-agents-and-execution/48-AGENT-MEMORY-AND-EXECUTION-TRACES.md) |
| FR-AGT-007 | A run must be cancellable; cancellation must take effect before the next side effect. | `modules/orchestration` | [43](../07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md) |

## 10. Tools, policy, approvals (`FR-TOL`)

| ID | Requirement | Module | Spec |
|---|---|---|---|
| FR-TOL-001 | Tools must be registered with a name, description, JSON Schema arguments, side-effect class (`read|write|external`), and timeout. | `modules/tools` | [45](../07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md) |
| FR-TOL-002 | Tool arguments must be validated against the schema before policy evaluation; invalid args fail with `TOOL_ARGS_INVALID` and are never executed. | `modules/tools` | [45](../07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md) |
| FR-TOL-003 | Policy evaluation must return `allow|deny|require_approval` per (agent, tool, org policy, actor, args); default is deny. | `modules/approvals` | [47](../07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) |
| FR-TOL-004 | Side-effecting invocations must carry an idempotency key `(run_id, step_id, tool_id)`; duplicate delivery must return the original result. | `modules/tools` | [45](../07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md) |
| FR-TOL-005 | Approvals must bind to frozen arguments, expire (default 10 min), and record approver identity; changed args invalidate the approval. | `modules/approvals` | [47](../07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) |
| FR-TOL-006 | Every side effect must be independently verified before a run is marked successful. | `modules/tools` | [47](../07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) |
| FR-TOL-007 | Tool execution must enforce per-tool timeout and circuit breaking, and must not retry non-idempotent calls. | `modules/tools` | [27](../04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) |

## 11. Workflows and jobs (`FR-WRK`)

| ID | Requirement | Module | Spec |
|---|---|---|---|
| FR-WRK-001 | Workflows must define ordered steps with per-step tool binding, approval policy, retry, and optional compensation. | `modules/workflows` | [46](../07-agents-and-execution/46-WORKFLOW-ENGINE-AND-STATE-MACHINE.md) |
| FR-WRK-002 | Workflow execution must persist step state and support resume and explicit partial-completion reporting. | `services/agent-worker` | [46](../07-agents-and-execution/46-WORKFLOW-ENGINE-AND-STATE-MACHINE.md) |
| FR-WRK-003 | Every background job must persist id, org, resource, status, attempts, error, and correlation id, with a dead-letter state. | `services/*` | [26](../04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md) |
| FR-WRK-004 | Jobs must be deduplicated by a stable key (e.g. `document_id+content_hash`) and cancellable. | `services/*` | [26](../04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md) |

## 12. SDK and widget (`FR-SDK`)

| ID | Requirement | Module | Spec |
|---|---|---|---|
| FR-SDK-001 | `createVistra(config)` must validate config, fail fast with typed errors, and expose `ask`, `guide`, `guideFlow`, `select`, `open`, `close`, `destroy`. | `packages/sdk-core` | [54](../09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) |
| FR-SDK-002 | The SDK must support streaming callbacks and typed event listeners with unsubscribe. | `packages/sdk-core` | [54](../09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) |
| FR-SDK-003 | `destroy()` must remove all DOM nodes, listeners, observers, timers, sockets, and object URLs; no memory growth across mount cycles. | `packages/sdk-core` | [55](../09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md) |
| FR-SDK-004 | The React package must provide `VistraProvider`, `useVistra`, `useGuide`, and `<VistraWidget/>` with SSR-safe behavior. | `packages/sdk-react` | [54](../09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) |
| FR-SDK-005 | The widget must render in a Shadow DOM, be keyboard operable, announce streamed content via `aria-live`, and respect reduced motion. | `packages/widget` | [55](../09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md) |

## 13. Public API and integrations (`FR-API`)

| ID | Requirement | Module | Spec |
|---|---|---|---|
| FR-API-001 | All operations must be documented in OpenAPI 3.1 with auth, scopes, errors, pagination, and idempotency; the client is generated. | `apps/api` | [23](../04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) |
| FR-API-002 | Errors must use RFC 9457 problem+json with a stable `code`, `request_id`, and validation `errors[]`. | `core/exceptions` | [27](../04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) |
| FR-API-003 | List endpoints must be cursor-paginated with `limit` cap 100 and stable ordering. | `apps/api` | [23](../04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) |
| FR-API-004 | Outbound webhooks must be signed (HMAC-SHA256, timestamp + body), retried with backoff, and replay-protected. | `services/webhook-worker` | [57](../09-sdk-and-integrations/57-MCP-WEBHOOKS-AND-EXTERNAL-INTEGRATIONS.md) |
| FR-API-005 | MCP servers must be registrable with credential storage, capability discovery, and per-tool policy mapping. | `modules/integrations` | [57](../09-sdk-and-integrations/57-MCP-WEBHOOKS-AND-EXTERNAL-INTEGRATIONS.md) |
| FR-API-006 | Rate limits must be enforced per API key and per organization with `429` + `Retry-After`. | `core/security` | [27](../04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) |

## 14. Studio and operations (`FR-STU`, `FR-OPS`)

| ID | Requirement | Module | Spec |
|---|---|---|---|
| FR-STU-001 | Studio must expose the pages in [59](../10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md) §4, each bound to real endpoints. | `apps/studio` | [59](../10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md) |
| FR-STU-002 | Live sessions must show runs in near-real-time via SSE, with filters by application, status, and time. | `apps/studio` | [25](../04-backend-and-api/25-REALTIME-AND-EVENT-ARCHITECTURE.md) |
| FR-STU-003 | The Evaluation Lab must run suites against selected agent/prompt versions and show per-case diffs. | `services/evaluation-worker` | [34](../05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md) |
| FR-OPS-001 | Every privileged or administrative mutation must write an `audit_events` row (actor, action, resource, before/after summary, request id, ip, ua). | `core/audit` | [61](../10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md) |
| FR-OPS-002 | Usage must be metered per call (provider, model, tokens, latency, cost estimate) and aggregated hourly/daily. | `modules/usage` | [66](../11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md) |
| FR-OPS-003 | Health endpoints must report DB, Redis, storage, and provider reachability separately. | `core/observability` | [64](../11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md) |

---

## 15. Failure behavior summary

| Failure | Result |
|---|---|
| Invalid/expired token | 401 `AUTH_INVALID_TOKEN`; no DB query executed |
| Missing org membership | 404 `NOT_FOUND` + security event |
| Provider invalid credentials | 500 `PROVIDER_CONFIGURATION_ERROR`; no fallback attempt |
| Provider timeout | retry ≤ 2, then capability-gated fallback, then 503 `PROVIDER_UNAVAILABLE` |
| Retrieval empty | 200 with `grounded=false` and insufficient-evidence message (never fabricated) |
| Tool args invalid | 422 `TOOL_ARGS_INVALID`; no execution |
| Approval expired | 409 `APPROVAL_EXPIRED`; re-proposal required |
| Ingestion parse failure | job `failed` with `PARSE_ERROR`; document retained with `parse_status=failed` |
| Cursor target missing | `TARGET_MISSING` event; no motion; text fallback |

## 16. Acceptance criteria

- [ ] Each FR has at least one test in the owning module's test suite.
- [ ] Each FR appears (directly or via its parent `PR-*`) in
      [../REQUIREMENT-TRACEABILITY.md](../REQUIREMENT-TRACEABILITY.md).
- [ ] No FR contradicts a steering rule in [../steering/AGENTS.md](../steering/AGENTS.md).

## 17. Related documents

[02](02-PRODUCT-REQUIREMENTS.md) · [06](06-NONFUNCTIONAL-REQUIREMENTS.md) · [08](08-ACCEPTANCE-CRITERIA.md) ·
[12](../02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md) · [23](../04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md)
