# Architecture Decisions (ADR Log)

**Doc ID:** 10 · **Status:** Living · **Area:** Architecture
**Depends on:** [09](09-SYSTEM-ARCHITECTURE.md) · **Related:** [14](14-TECHNOLOGY-STACK-AND-DEPENDENCIES.md), [../steering/AGENTS.md](../steering/AGENTS.md)

---

## 1. Purpose

Record every decision that would be expensive to reverse, with the alternatives considered and the
consequences accepted. An agent that wants to deviate must add an ADR here first — not in a PR comment.

## 2. Format

```
ADR-NNN — Title
Status: Accepted | Superseded by ADR-XXX | Deprecated
Context · Decision · Alternatives · Consequences · References
```

Decisions marked **Provisional** depend on a fact we must verify in production (noted inline).

---

## ADR-001 — Clerk as sole identity provider

**Status:** Accepted. **Context:** Need SSO/MFA/social/organization membership without building auth.
**Decision:** Clerk owns all human authentication; Supabase Auth is not used as a parallel identity
authority. Supabase is configured with Clerk as a **third-party auth provider**, not via a shared JWT
secret or a deprecated JWT-template integration.
**Alternatives:** Supabase Auth native (would force us to build org/role UX and lose Clerk's components);
Auth0/WorkOS (viable, heavier migration); custom OIDC (unacceptable risk).
**Consequences:** Two systems to keep in sync via verified webhooks; a projection table is required; local
development needs a Clerk dev instance. RLS reads Clerk claims via `auth.jwt()`.
**References:** https://clerk.com/docs/guides/development/integrations/databases/supabase ·
https://supabase.com/docs/guides/auth/third-party/clerk

---

## ADR-002 — Supabase Postgres as the single primary datastore

**Status:** Accepted. **Context:** Relational data + vectors + FTS + files, small team, managed ops.
**Decision:** One Postgres (Supabase) for all authoritative state; pgvector for embeddings; `tsvector` for
keyword search; Supabase Storage for objects behind an adapter.
**Alternatives:** Postgres + separate vector DB (Pinecone/Weaviate: extra consistency boundary, extra cost,
no transactional ACL filtering); MongoDB (weak relational integrity for tenancy); SQLite (no concurrency).
**Consequences:** Retrieval must respect Postgres index tuning; very large tenants need partitioning
strategy (doc 38); a vector-DB escape hatch is possible later behind the retrieval port.
**References:** https://supabase.com/docs/guides/database/extensions/pgvector · https://github.com/pgvector/pgvector

---

## ADR-003 — Row Level Security plus application scoping (defense in depth)

**Status:** Accepted. **Context:** Multi-tenant AI platform; a single missed `WHERE` is catastrophic.
**Decision:** RLS enabled and **forced** on every tenant table; policies read Clerk claims via
`auth.jwt()`. The privileged service path still adds explicit `organization_id` predicates. Both paths are
tested for cross-tenant denial.
**Alternatives:** App-only filtering (single point of failure); schema-per-tenant (migration/ops explosion);
database-per-tenant (cost, connection limits).
**Consequences:** Every query must set the JWT/`request.jwt.claims` context or use a scoped connection;
policy performance must be verified with `EXPLAIN`.
**References:** https://supabase.com/docs/guides/database/postgres/row-level-security

---

## ADR-004 — FastAPI modular monolith

**Status:** Accepted. **Context:** Broad domain, small team, need clear boundaries without distributed ops.
**Decision:** A single deployable API with internal modules (router/service/repository), plus separate
worker processes for async workloads. Module boundaries enforced by import rules, not network calls.
**Alternatives:** Microservices (network complexity, distributed transactions for tenancy, slower delivery);
serverless functions per route (cold starts, connection pooling pain, long SSE); Django (viable; FastAPI
chosen for async streaming + Pydantic contracts).
**Consequences:** Must be disciplined about module imports; extraction to a service later is possible
because modules communicate through service interfaces and events.
**References:** https://fastapi.tiangolo.com/

---

## ADR-005 — Workers as separate processes, not a task-queue framework in-process

**Status:** Accepted. **Context:** Ingestion and agent runs outlive HTTP requests.
**Decision:** Postgres job table is the source of truth; Redis provides wake-up signals; workers claim with
`FOR UPDATE SKIP LOCKED`, heartbeat, retry with backoff, and dead-letter. No Celery/RQ in v1.
**Alternatives:** Celery (extra broker semantics, config surface); Temporal (excellent durability; deferred
until workflow complexity justifies the operational cost); cloud queues (vendor lock, weaker transactional
coupling with run state).
**Consequences:** We own the retry/visibility logic; must test reclaim and idempotency carefully.
**References:** PostgreSQL `SKIP LOCKED` — https://www.postgresql.org/docs/current/sql-select.html

---

## ADR-006 — Gemini primary, NVIDIA NIM capability-gated fallback

**Status:** Accepted. **Context:** Need frontier multimodal + a second provider for resilience/cost.
**Decision:** Gemini is primary for reasoning, structured output, tools, vision, embeddings, live. NVIDIA
NIM (OpenAI-compatible at `https://integrate.api.nvidia.com/v1`) is secondary for capabilities its models
advertise. Routing is by capability, not model name. Unsupported capability ⇒ explicit error.
**Alternatives:** Single provider (outage = total failure); provider-agnostic library (LangChain-style:
hides capability gaps and retries, hard to observe); OpenAI primary (viable; Gemini chosen for multimodal +
long-context economics).
**Consequences:** Capability registry must be maintained per model; fallback quality differs and must be
labelled; embeddings from different models are never mixed in one index.
**References:** https://ai.google.dev/gemini-api/docs/interactions · https://docs.api.nvidia.com/nim/reference/llm-apis

---

## ADR-007 — Interactions API as the Gemini call surface; `generateContent` as documented fallback

**Status:** Accepted (Provisional: verify SDK parity per feature at implementation time).
**Context:** Google documents the Interactions API as GA and recommended for new projects; the older
`generateContent` API remains supported.
**Decision:** Implement the Gemini adapter against the Interactions API via `google-genai`
(`client.interactions.create`), behind our own port so the call surface can change without touching
business logic. Record the SDK version in the adapter and pin it.
**Alternatives:** `generateContent` only (legacy but stable); raw REST (more control, more maintenance).
**Consequences:** Adapter must normalize interaction/step objects into VISTRA's response model; prompt and
tool schema translation lives in one file.
**References:** https://ai.google.dev/gemini-api/docs/interactions-overview

---

## ADR-008 — Provider-neutral internal response schema

**Status:** Accepted. **Context:** Providers differ in structure, tool-call shape, and error taxonomy.
**Decision:** All provider output is mapped into VISTRA types (`AgentResponse`, `ToolCallProposal`,
`Citation[]`) and validated with Pydantic/Zod before use. Provider JSON is never passed through.
**Alternatives:** Pass-through (couples everything to one vendor, breaks on fallback).
**Consequences:** Mapping maintenance per provider; strict validation may reject usable-but-malformed
outputs — mitigated by one bounded repair attempt.

---

## ADR-009 — REST + SSE for the public surface; WebSocket only where bidirectional

**Status:** Accepted. **Context:** Chat streaming is server→client; live voice needs bidirectional audio.
**Decision:** SSE (fetch-stream, auth headers) for agent/message streaming; WebSocket for live voice and
collaborative presence only. Both are implemented in FastAPI with async generators and backpressure.
**Alternatives:** WebSocket everywhere (harder to proxy, auth-on-upgrade complexity); polling (latency,
cost).
**Consequences:** Need proxy buffering disabled on Render; heartbeat comments to keep connections alive;
documented reconnect semantics.
**References:** Render WebSockets — https://render.com/docs/websocket

---

## ADR-010 — OpenAPI 3.1 as the contract source; generated clients

**Status:** Accepted. **Context:** Studio, SDK, MCP, and third parties consume the same API.
**Decision:** The FastAPI schema is the source of truth, exported to a committed `openapi.json`; the
TypeScript client and docs examples are generated from it; CI fails on drift.
**Alternatives:** Hand-written clients (drift); GraphQL (good for flexible UI, poor fit for SDK/event
surface and file streaming).
**Consequences:** Generated code is not hand-edited; schema changes require versioning discipline.

---

## ADR-011 — SDK split: core, react, widget, cursor, api-client, shared-types, design-system

**Status:** Accepted. **Context:** Different consumers need different bundles; cursor is also sold as a
standalone capability.
**Decision:** Independent packages with explicit dependency direction:
`shared-types ← api-client ← sdk-core ← sdk-react/widget`; `ghost-cursor` depends on nothing but types.
**Alternatives:** One monolith SDK (bundle bloat, no standalone cursor).
**Consequences:** Version alignment via workspace protocol + changesets; cursor must remain framework-free.

---

## ADR-012 — Ghost Cursor as a standalone, semantic-targeting package

**Status:** Accepted. **Context:** Guidance is a differentiator; coordinate-based automation is fragile and
unsafe.
**Decision:** Standalone TS package; target resolution priority (host id → role+name → label → data
attribute → validated selector → coordinates); explicit state machine; Guide vs Do mode separation.
**Alternatives:** Use an existing tour library (no semantic resolution, no verification, styling lock-in);
coordinate replay (breaks on any layout change).
**Consequences:** Requires host cooperation (`data-vistra-target`) for best reliability; must handle nested
scroll and dynamic DOM; accessibility work is mandatory, not optional.

---

## ADR-013 — SDK session tokens instead of API keys in the browser

**Status:** Accepted. **Context:** Any secret in a browser is public.
**Decision:** The host's server mints (or the SDK obtains via a host-authenticated endpoint) a short-lived
JWT with audience `sdk`, scoped to one application and one opaque end-user reference. API keys are
server-only and hashed at rest.
**Alternatives:** Publishable key alone (unbounded abuse); Clerk user tokens for end users (requires every
end user to have a Clerk account — wrong product model).
**Consequences:** Host must run a token endpoint; token TTL/refresh in the SDK; revocation per end user.

---

## ADR-014 — Redis for ephemeral coordination only

**Status:** Accepted. **Context:** Rate limits, locks, hot caches, SSE fan-out.
**Decision:** Redis holds only data that can be lost without correctness loss. Job/run state lives in
Postgres. Rate-limit failure policy: fail-closed for auth-sensitive endpoints, fail-open for read-only
cosmetic limits.
**Alternatives:** Postgres advisory locks only (works, but slower for high-frequency counters); in-memory
(does not survive scale-out).
**Consequences:** Two stores to monitor; must document TTLs and invalidation.

---

## ADR-015 — Storage adapter with Supabase first, S3/MinIO later

**Status:** Accepted. **Context:** Customers may require self-hosted or S3-native storage.
**Decision:** `StorageProvider` port (upload/download/delete/signed URLs/metadata/health); Supabase adapter
ships first; S3-compatible adapter is a drop-in with identical key conventions.
**Alternatives:** Direct Supabase SDK calls everywhere (blocks portability).
**Consequences:** Signed URL semantics and multipart behavior differ per provider; contract tests must run
against both when the second adapter lands.

---

## ADR-016 — Render for API and workers; Vercel for Next.js frontends

**Status:** Accepted. **Context:** Need containers with long-lived processes and managed Next.js hosting.
**Decision:** Render runs Dockerized API + workers (private services where possible); Vercel runs Studio,
demo, and docs site. Supabase hosts data. No Kubernetes in v1.
**Alternatives:** AWS ECS/Fargate (more control, more ops); Fly.io (good fit, smaller ecosystem here);
single-platform (Vercel cannot run long-lived Python workers; Render's Next.js support exists but Vercel is
the documented Next.js target).
**Consequences:** Cross-origin config between Vercel and Render; secrets in two systems; worker/API
networking must use private/internal URLs and TLS. Render disk is ephemeral — no user files on local disk.
**References:** https://render.com/docs/disks · https://vercel.com/docs

---

## ADR-017 — Postgres full-text + pgvector hybrid retrieval, not a separate search engine

**Status:** Accepted. **Context:** Need keyword + semantic in one filtered query with ACLs.
**Decision:** `tsvector` + GIN for lexical, `vector` + HNSW for semantic, fused with weighted RRF, then
rerank. Filters applied in SQL before ANN ordering where possible.
**Alternatives:** Elasticsearch/OpenSearch (operational overhead, second ACL model); pure vector (poor
exact-term recall for error codes, SKUs, API names).
**Consequences:** Recall depends on query rewriting and `tsquery` normalization; tuning documented in doc 38.

---

## ADR-018 — Chunking is structure-aware and versioned

**Status:** Accepted. **Context:** Naive fixed-size chunks destroy tables and code blocks; re-embedding must
be safe.
**Decision:** Heading-aware recursive chunking with token budget and overlap; tables kept intact; parent
section stored for context expansion; chunks carry `content_hash`, `embedding_model`, `embedding_dim`,
`index_version`.
**Alternatives:** Fixed 512-token windows (cheap, poor for structured docs); whole-document embedding
(exceeds context, poor precision).
**Consequences:** More metadata to maintain; reprocessing required on model change; index versioning
enforced by a unique constraint.

---

## ADR-019 — Tool execution is policy-gated, approved, idempotent, verified

**Status:** Accepted. **Context:** Autonomous actions are the highest-risk feature.
**Decision:** Four-stage gate: schema validation → policy decision → approval (if required) → execution with
idempotency key → independent verification. The model never grants permission.
**Alternatives:** Prompt-level "ask before acting" (unenforceable); manual-only actions (no product).
**Consequences:** More state and latency; approval UX required; verification requires per-tool definitions.

---

## ADR-020 — Durable agent runs with per-step persistence

**Status:** Accepted. **Context:** Render restarts, deploys, and timeouts will interrupt long runs.
**Decision:** `agent_runs` + `agent_run_steps` written at every transition; workers resume; cancellation is
cooperative before the next side effect.
**Alternatives:** In-memory orchestration (loses runs on deploy); Temporal (deferred, ADR-005).
**Consequences:** Every step must be idempotent or guarded; trace volume grows (retention documented).

---

## ADR-021 — Evaluation as a first-class subsystem, not ad-hoc notebooks

**Status:** Accepted. **Context:** Prompt/model changes silently regress quality.
**Decision:** Versioned suites, golden sets, recorded runs, gates on release for retrieval and agent quality.
**Alternatives:** Manual spot checks (unreliable); offline notebooks (not enforced).
**Consequences:** Ongoing dataset curation cost; sampled live-provider calls in nightly only.

---

## ADR-022 — Server-side rendering for Studio, client widget for embedding

**Status:** Accepted. **Context:** Studio is authenticated admin UI; the widget lives in third-party pages.
**Decision:** Next.js App Router with server components for Studio data fetching; the widget is a
framework-free client bundle rendered in Shadow DOM.
**Alternatives:** SPA Studio (simpler auth, worse initial load); iframe widget (style isolation but layout
and a11y complications — used only for the hosted mode).
**Consequences:** Two rendering models to test; widget must not assume React.

---

## ADR-023 — Monorepo with pnpm workspaces + uv for Python

**Status:** Accepted. **Context:** Shared types and atomic contract changes across TS/Python.
**Decision:** One repository; pnpm workspace for TS, `uv` for Python (one `pyproject.toml` per deployable);
cross-language contracts via OpenAPI/JSON Schema; changesets for package versioning.
**Alternatives:** Polyrepo (contract drift, coordinated releases); Nx/Turborepo (possible; plain pnpm keeps
the surface small — revisit at >20 packages).
**Consequences:** CI must be path-filtered to stay fast; Python and Node toolchains both required locally.

---

## ADR-024 — Prompt and model configuration are data, not code

**Status:** Accepted. **Context:** Prompt iteration must not require a deploy, but must be auditable.
**Decision:** `prompts` + `prompt_versions` tables; agents reference a prompt version; model ids resolved
from a registry table/config; both are captured on every run.
**Alternatives:** Prompts in source (slower iteration, better review); prompt-management SaaS (extra vendor).
**Consequences:** Runtime config errors must be validated before activation; rollback by version pointer.

---

## ADR-025 — Redaction-first capture

**Status:** Accepted. **Context:** DOM/screenshot capture can leak credentials and PII.
**Decision:** Capture is opt-in per application with explicit scopes; password/payment fields and
`data-vistra-private` are removed before serialization; screenshots are cropped, downscaled, and not
persisted by default.
**Alternatives:** Capture everything and filter server-side (data already left the browser — unacceptable).
**Consequences:** Some pages yield partial context; UI must communicate `capture_limited`.

---

## ADR-026 — Soft-delete only where retention requires it

**Status:** Accepted. **Context:** "Soft delete everything" creates join complexity and stale data.
**Decision:** Hard delete for ephemeral artifacts (sessions, runs after retention); soft delete with
`deleted_at` for organizations, applications, knowledge bases, documents (to support restore windows);
`audit_events` is append-only and never deleted by tenant action.
**Alternatives:** Universal soft delete (query complexity, storage growth, false sense of safety).
**Consequences:** Every query on soft-deletable tables must filter `deleted_at IS NULL` (enforced via views
or repository base class).

---

## ADR-027 — MCP as an integration protocol, not the internal tool contract

**Status:** Accepted. **Context:** External tools should be consumable without bespoke glue.
**Decision:** Internal tools use VISTRA's JSON Schema contract; MCP servers are imported/mapped into it with
explicit policy assignments. MCP never bypasses the policy engine.
**Alternatives:** MCP-native internal registry (couples internals to an evolving external spec).
**Consequences:** Schema translation layer; MCP tool capabilities must be validated at import.

---

## ADR-028 — No Kafka, no Kubernetes in v1

**Status:** Accepted. **Context:** Premature infrastructure increases cost and failure surface.
**Decision:** Postgres + Redis queues and managed containers until measured throughput or reliability
demands otherwise.
**Alternatives:** Kafka (event streaming we do not need yet); K8s (ops burden without multi-service need).
**Consequences:** Revisit thresholds: >5M jobs/day, or >3 independent services, or multi-region requirement.

---

## ADR-029 — LangGraph state machine with a Postgres checkpointer for agent runs; LangChain chat models behind the provider port

**Status:** Accepted (implemented 2026-11-14). **Context:** ADR-020 requires runs to survive restarts; approvals
pause a run for minutes. The user asked for a LangChain-based agent backend.
**Decision:** The run is a LangGraph `StateGraph` (`apps/api/app/agent/graph.py`): plan → answer | explain | guide |
propose → approval (`interrupt()`) → execute → verify. `AsyncPostgresSaver` checkpoints every node to Supabase in the
isolated schema `agent_state` (thread_id = `agent_runs.id`; tenant role has no grants). Execute and verify are
separate nodes so a crash after a side effect resumes at verification. Gemini and NVIDIA NIM adapters are
LangChain chat models (`langchain-google-genai`, `langchain-openai` against NIM) with `max_retries=0`; retries,
circuit breaker, capability gating and `model_usage` recording stay in `app/ai/router.py`, so ADR-006/§9 rules
apply unchanged. Supersedes the Interactions-API choice of ADR-007 for the call surface.
**Alternatives:** Hand-written state persistence in `agent_run_steps` only (no resumable interrupt); LangChain
`AgentExecutor` with model-chosen tools (violates "policy decides").
**Consequences:** psycopg async requires a selector event loop on Windows (`apps/api/run_dev.py`); checkpoint
writes add ~1 round trip per node; checkpoint retention needs a cleanup job (not yet built).

## ADR-030 — Redis-backed ingestion queue with an embeddable worker

**Status:** Accepted (implemented 2026-11-14). Refines ADR-005 and ADR-014. **Decision:** Ingestion jobs are pushed to
`vistra:queue:ingestion` and consumed with BLMOVE into a processing list (`apps/api/app/worker.py`). The worker runs
embedded in the API (`WORKER_EMBEDDED=true`, single Render service) or standalone (`python -m app.worker`). The
`ingestion_jobs` row stays the record: stale queued/running jobs are re-enqueued every 60 s. Redis also backs
fixed-window rate limits (`RATE_LIMITED` 429) and approval locks. Without `REDIS_URL` jobs run in-process and limits
are skipped; `/readyz` reports the Redis mode.
**Consequences:** Upstash connection limits apply; the limiter fails open on Redis errors (availability first).

## ADR-031 — Configurable agents: one published version per application, safety rules not configurable

**Status:** Accepted (implemented 2026-11-14). **Context:** Operators need to tune tone, capabilities, models, evidence
strictness and tool policy from the dashboard without code changes or risk to the safety model.
**Decision:** `agents` / `agent_versions` (migration 0008, doc 16 shape) with an immutable version per save and a
`current_version_id` pointer; publishing any version rolls forward or back. Each run loads the published version
(`app/agent/config.py::load_runtime`) and records `agent_runs.agent_version_id`. Configurable: instructions (fenced as
style guidance below the system rules), capabilities, planner/answer model tier, retrieval `top_k` + strictness
thresholds, guide `max_steps`, per-tool enable + policy override. Not configurable: unregistered tools stay denied,
role-gated tools cannot be set to "allow", approval stays bound to the argument hash, side effects are always verified.
Deviation from doc 16: instructions are stored inline (`agent_versions.instructions`) instead of `prompt_versions`;
`agents.application_id` is `text` to match `applications.id`. A paused agent falls back to platform defaults.
Dashboard playground sessions (`POST /v1/applications/{id}/playground-session`) are allowed only from origins in
`CORS_ALLOWED_ORIGINS` (the dashboard), never from arbitrary sites.
**Consequences:** A malformed stored config logs and falls back to defaults instead of failing runs.

## ADR-032 — Clerk Core 3 (`@clerk/nextjs` 7) with per-resource protection

**Status:** Accepted (implemented 2026-11-14). **Context:** Core 2 SDKs are blocked for new sign-ups ("outdated Clerk
SDK"). **Decision:** `@clerk/nextjs` 7.10 + `@clerk/ui` themes; `<Show when>` replaces `SignedIn`/`SignedOut`;
`ClerkProvider` inside `<body>`; middleware only attaches auth, and `app/dashboard/layout.tsx` calls `auth.protect()`.
The dashboard keeps its `/v1/me` SWR key stable across Core 3's background token refresh (a flickering `useAuth()`
previously dropped the active application and produced `/v1/applications/undefined/...` calls).

---

## 3. Superseding an ADR

Add a new numbered ADR, mark the old one `Superseded by ADR-NNN`, and update the affected docs in the same
change. Never edit the decision text of an accepted ADR except to fix a typo.

## 4. Open questions (tracked, must be resolved before their phase)

| # | Question | Affects | Resolution path |
|---|---|---|---|
| Q1 | Exact Render instance types and limits for worker concurrency | doc 69, cost | Measure during Phase 3 |
| Q2 | pgvector HNSW build cost at 10M chunks per tenant | doc 38 | Benchmark on seeded data |
| Q3 | Gemini Interactions SDK parity for tools + structured output in the pinned version | doc 29 | Adapter integration test |
| Q4 | NVIDIA per-model function-calling reliability | doc 30, 31 | Capability probe suite |
| Q5 | Supabase connection pooling mode vs. SQLAlchemy async | doc 71 | Load test |
| Q6 | Studio realtime transport through Vercel to Render SSE | doc 25 | Spike in Phase 9 |

## 5. Related documents

[09](09-SYSTEM-ARCHITECTURE.md) · [12](12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md) ·
[14](14-TECHNOLOGY-STACK-AND-DEPENDENCIES.md) · [../IMPLEMENTATION-STATUS.md](../IMPLEMENTATION-STATUS.md)

## 6. References

Consolidated in [14](14-TECHNOLOGY-STACK-AND-DEPENDENCIES.md) §8.
