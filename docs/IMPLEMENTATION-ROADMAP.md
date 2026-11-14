# Implementation Roadmap

**Status:** Living. The build order for VISTRA, with the documents that govern each phase and the gate that must
pass before the next phase begins.

**Principle:** documentation → backend foundations → AI → agents/knowledge → visual → SDK → applications →
release. Never frontend-first; never a screen against fake data.

---

## 0. How to use this

- Each phase names **required reading**; read it before writing code.
- Each phase ends with a **gate** — concrete, checkable evidence, not "looks done".
- Phases are sequential where dependencies demand it (0→1→2→3→4→5→6→7→8→9→10→11→12). Within a phase, work can
  parallelize.
- Cross-reference: [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) tracks actual state;
  [steering/DEFINITION-OF-DONE.md](steering/DEFINITION-OF-DONE.md) defines "done" per work type.

---

## Phase 0 — Repository inspection and decisions

**Reading:** [11](02-system-architecture/11-REPOSITORY-AND-MONOREPO-STRUCTURE.md), [10](02-system-architecture/10-ARCHITECTURE-DECISIONS.md),
[67](12-deployment-and-release/67-LOCAL-DEVELOPMENT-ENVIRONMENT.md)

**Work**
1. Inventory the existing repository: apps, packages, deps, configs, CI, secrets layout.
2. Record differences from the documented target tree (do not silently restructure working code).
3. Resolve the six open questions in [10](02-system-architecture/10-ARCHITECTURE-DECISIONS.md) §6 or accept defaults.
4. Confirm the toolchain versions against [14](02-system-architecture/14-TECHNOLOGY-STACK-AND-DEPENDENCIES.md).

**Gate**
- [ ] Written inventory + gap list committed.
- [ ] No existing functionality broken by inspection (read-only).
- [ ] Open questions have a decision record.

---

## Phase 1 — Engineering foundation

**Reading:** [11](02-system-architecture/11-REPOSITORY-AND-MONOREPO-STRUCTURE.md), [14](02-system-architecture/14-TECHNOLOGY-STACK-AND-DEPENDENCIES.md),
[62](11-quality-security-and-operations/62-TESTING-STRATEGY.md), [72](12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md)

**Work**
- pnpm workspace + uv workspace; shared tsconfig; ESLint/Prettier/Ruff/mypy; pre-commit.
- `packages/shared-types` and the OpenAPI-generated client skeleton.
- Test runners (vitest, pytest), coverage thresholds, fixtures directory.
- CI: lint, types, unit, docs validator; branch protection.
- `.env.example` matching [68](12-deployment-and-release/68-ENVIRONMENT-AND-SECRETS-MANAGEMENT.md) exactly.

**Gate**
- [ ] `pnpm install && pnpm -r typecheck && pnpm -r test` green on a clean clone.
- [ ] `uv sync --directory apps/api && pytest` green.
- [ ] CI runs on PR and fails on lint/type/test/docs errors.
- [ ] `python docs/tools/validate-docs.py` passes.

---

## Phase 2 — Supabase database infrastructure

**Reading:** [15](03-database-and-identity/15-DATABASE-DESIGN-AND-ERD.md), [16](03-database-and-identity/16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md),
[19](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md), [20](03-database-and-identity/20-STORAGE-AND-FILE-LIFECYCLE.md),
[21](03-database-and-identity/21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md)

**Work**
- Supabase local stack; extensions (vector, pgcrypto, pg_trgm).
- Migrations `0001…0010` per doc 16, in the documented order, all idempotent and reversible where possible.
- Indexes including HNSW on `chunks`, FTS on chunk text, tenant-leading composites.
- RLS policies for every tenant table; column revokes for sensitive fields.
- Storage buckets + policies; seed and fixture scripts.
- DB test suite: constraints, cascade, RLS allow/deny, migration idempotency.

**Gate**
- [ ] `pnpm db:reset` applies all migrations from zero with no manual steps.
- [ ] RLS verification query returns zero missing/unforced rows.
- [ ] Cross-tenant read attempts fail in tests (A1–A16 of doc 18).
- [ ] Seed produces a usable demo org.

---

## Phase 3 — Clerk authentication and tenancy

**Reading:** [17](03-database-and-identity/17-CLERK-AUTHENTICATION.md), [18](03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md),
[19](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md)

**Work**
- Clerk application, orgs enabled, Supabase third-party auth configured.
- Backend `core/auth/*`: JWKS cache, verification, identity resolution, dependencies.
- Webhook endpoint with signature verification, idempotent, ordered-safe processing.
- Projection tables kept in sync (`users`, `organizations`, `organization_members`).
- Tenant context dependency; membership checks on every scoped route.
- Auth test matrix (valid/invalid/expired/wrong-issuer/removed-member/deleted-user/duplicate webhook).

**Gate**
- [ ] Two users in two orgs cannot see each other's rows via API **and** via RLS.
- [ ] Duplicate/out-of-order webhooks converge to the same state.
- [ ] No route trusts a client-supplied `organization_id` without membership verification.
- [ ] Sign-out invalidates the session; deleted users lose access.

---

## Phase 4 — Core backend

**Reading:** [22](04-backend-and-api/22-BACKEND-ARCHITECTURE.md), [23](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md),
[27](04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md), [24](04-backend-and-api/24-SESSION-AND-CONVERSATION-MANAGEMENT.md)

**Work**
- App factory, middleware chain, structured logging, request ids.
- Problem+json error envelope with the code registry; exception handlers.
- Pydantic v2 request/response models per module; repositories + services.
- Organizations, projects, applications, API keys endpoints.
- OpenAPI generation committed; typed client regenerated.
- Rate limiting; pagination; idempotency middleware.

**Gate**
- [ ] `openapi.json` is deterministic and generated in CI (no drift).
- [ ] Every error path returns a documented `code`.
- [ ] Contract tests pass against the generated client.
- [ ] Auth + tenancy enforced on every endpoint, proven by tests.

---

## Phase 5 — Storage and background jobs

**Reading:** [20](03-database-and-identity/20-STORAGE-AND-FILE-LIFECYCLE.md), [26](04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md)

**Work**
- `StorageProvider` interface + Supabase adapter; signed upload/download; validation.
- Job model, claiming with `FOR UPDATE SKIP LOCKED`, heartbeats, reaper, DLQ, cancellation.
- Worker process skeleton; graceful SIGTERM drain.
- Enqueue API; job status endpoint.

**Gate**
- [ ] Upload → metadata row → signed download round-trip works with a non-owner denied.
- [ ] A killed worker's job is reclaimed and completed exactly once.
- [ ] Duplicate enqueue with the same dedupe key yields one job.
- [ ] No bytes written to local disk.

---

## Phase 6 — AI provider infrastructure

**Reading:** [28](05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md), [29](05-ai-and-model-infrastructure/29-GEMINI-PRIMARY-INTEGRATION.md),
[30](05-ai-and-model-infrastructure/30-NVIDIA-NIM-FALLBACK-INTEGRATION.md), [31](05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md),
[34](05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md)

**Work**
- Capability registry and model registry (config-driven, validated at boot).
- Gemini adapter: text, structured, tools, vision, embeddings, streaming.
- NVIDIA adapter: OpenAI-compatible catalog probe, capability-gated use.
- Router with eligibility; retry/backoff/jitter; circuit breakers; fallback recording.
- Response validation against internal schema; usage and cost accounting.
- Provider test suite with recorded fakes + live smoke behind a flag.

**Gate**
- [ ] An induced primary failure produces a valid, observable fallback for an eligible capability.
- [ ] A vision request never routes to a text-only model (test asserts a hard error).
- [ ] Invalid API key classifies as configuration error, not retry.
- [ ] Usage records reconcile with provider-reported tokens within an accepted tolerance (documented).

---

## Phase 7 — Agent runtime

**Reading:** [43](07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md), [44](07-agents-and-execution/44-SPECIALIZED-AGENT-ARCHITECTURE.md),
[45](07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md), [47](07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md),
[48](07-agents-and-execution/48-AGENT-MEMORY-AND-EXECUTION-TRACES.md)

**Work**
- Agent definitions + immutable versions; run/step persistence.
- Orchestrator loop with intent → plan → select → execute, budgets and step limits.
- Tool registry with JSON Schema; validation; executor; independent verifier.
- Policy engine (allow/deny/require_approval) with frozen-argument approvals.
- Execution events stream; trace persistence; cancellation.
- Duplicate prevention via idempotency keys on invocations.

**Gate**
- [ ] Every state transition persisted and replayable from the trace.
- [ ] Approval binds to a hash of arguments; changed arguments invalidate it.
- [ ] A verification failure marks the run failed and never reports success.
- [ ] Killing the worker mid-run resumes or fails safely, never double-executes.

---

## Phase 8 — Knowledge and RAG

**Reading:** [35](06-knowledge-and-rag/35-KNOWLEDGE-ENGINE-ARCHITECTURE.md), [36](06-knowledge-and-rag/36-DOCUMENT-INGESTION-AND-PARSING.md),
[37](06-knowledge-and-rag/37-CHUNKING-AND-METADATA-EXTRACTION.md), [38](06-knowledge-and-rag/38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md),
[39](06-knowledge-and-rag/39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md), [41](06-knowledge-and-rag/41-KNOWLEDGE-PERMISSIONS-AND-TENANT-ISOLATION.md)

**Work**
- Source registration, ingestion pipeline, parsers per format, checksums, versions.
- Chunking with parent/child, headings, tables; metadata extraction.
- Embedding batches with index versioning; backfill and cutover.
- Hybrid retrieval (vector + FTS, RRF), ACL filter, dedupe, rerank.
- Citation builder + validator; insufficient-evidence state.
- Ingestion worker with retries and per-source status.

**Gate**
- [ ] PDF/DOCX/MD/HTML ingestion produce retrievable, citable chunks.
- [ ] Retrieval never returns chunks from another org (adversarial test).
- [ ] Citation ids resolve to the exact source span; no fabricated citations under test.
- [ ] Recall@10 on the golden set meets the doc 42 threshold.

---

## Phase 9 — Visual context and Ghost Cursor

**Reading:** [49](08-visual-and-ghost-cursor/49-VISUAL-CONTEXT-ENGINE.md), [50](08-visual-and-ghost-cursor/50-DOM-AND-ACCESSIBILITY-INSPECTION.md),
[51](08-visual-and-ghost-cursor/51-GHOST-CURSOR-ENGINE.md), [52](08-visual-and-ghost-cursor/52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md),
[53](08-visual-and-ghost-cursor/53-VISUAL-GUIDANCE-AND-VERIFICATION.md)

**Work**
- Context collectors with redaction; a11y tree summary; selection.
- `packages/ghost-cursor`: state machine, targeting priority chain, motion engine, visuals, a11y.
- Guide flows, step verification, cancellation, reduced motion.
- Server-side guidance contract (`POST /v1/sdk/guide`), cursor event schema.

**Gate**
- [ ] Targeting resolves by role+name on a real page; missing targets produce a typed error, not a wrong click.
- [ ] Scroll/resize/DOM mutation during motion is handled without drift.
- [ ] Reduced-motion path is instant and tested.
- [ ] Guide Mode cannot trigger a business action (asserted in code and test).

---

## Phase 10 — SDK and widget

**Reading:** [54](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md), [55](09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md),
[56](09-sdk-and-integrations/56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md), [58](09-sdk-and-integrations/58-SDK-VERSIONING-AND-PUBLISHING.md)

**Work**
- `sdk-core`, `sdk-react`, `widget` against tested endpoints only.
- Session mint route in the host app; short-lived tokens; renewal.
- Events, streaming, cleanup, error taxonomy, type declarations.
- Bundle size and CSP checks; shadow DOM isolation.

**Gate**
- [ ] SDK in a real page completes: init → session → ask → cite → guide.
- [ ] No secret in any bundle (scan).
- [ ] Unmount leaks no listeners, timers, or observers.
- [ ] Versioned build + changelog; publishing is a separate authorized step.

---

## Phase 11 — Demo application

**Reading:** [60](10-applications-and-experience/60-DEMO-APPLICATION-AND-END-TO-END-SCENARIOS.md), [59](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md)

**Work**
- Acme Workspace pages with real data and tools.
- Journeys J1–J9 including knowledge answer, element explanation, guide flow, action with approval, workflow.
- Seed data that makes each journey meaningful.

**Gate**
- [ ] Every journey passes against the real API (Playwright), asserting DB state.
- [ ] No hardcoded answers or mocked responses in the demo.
- [ ] Created records are visible in the app after the agent action.

---

## Phase 12 — Studio

**Reading:** [59](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md), [61](10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md)

**Work**
- Overview, applications, live sessions, agent/workflow builders, knowledge hub, integrations, tools, MCP,
  webhooks, evaluation lab, analytics, usage, security, audit, settings.
- Server components for auth'd reads; role-gated UI mirroring server permissions.

**Gate**
- [ ] Every page reads real endpoints; empty/loading/error states exist.
- [ ] Role gating matches the API (no UI-only enforcement).
- [ ] Audit and usage pages reconcile with recorded data.

---

## Phase 13 — Release

**Reading:** [62](11-quality-security-and-operations/62-TESTING-STRATEGY.md), [63](11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md),
[69](12-deployment-and-release/69-RENDER-BACKEND-DEPLOYMENT.md), [70](12-deployment-and-release/70-VERCEL-FRONTEND-DEPLOYMENT.md),
[72](12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md), [74](12-deployment-and-release/74-PRODUCTION-RELEASE-AND-ROLLBACK.md)

**Work**
- Full E2E suite, load test, security test pass, restore drill.
- Production envs, secrets, domains, CORS verification.
- Release checklist and rollback rehearsal.

**Gate**
- [ ] All release gates in doc 74 §5 pass with recorded numbers.
- [ ] Restore drill completed within RTO.
- [ ] Rollback rehearsed; timings recorded.
- [ ] No open P1/P2 security findings.

---

## Roadmap → documentation anchor table

| Phase | Ship milestone | Docs |
|---|---|---|
| 0–1 | Repo + CI | 11, 14, 62, 72 |
| 2 | Schema + RLS | 15, 16, 19, 20, 21 |
| 3 | Identity | 17, 18 |
| 4 | API v1 | 22, 23, 24, 27 |
| 5 | Storage + jobs | 20, 26 |
| 6 | Providers | 28–31, 33, 34 |
| 7 | Agents | 43–45, 47, 48 |
| 8 | Knowledge | 35–39, 41, 42 |
| 9 | Cursor | 49–53 |
| 10 | SDK | 54–56, 58 |
| 11 | Demo | 60 |
| 12 | Studio | 59, 61 |
| 13 | Release | 62, 63, 69–75 |

## Related documents

[IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) · [REQUIREMENT-TRACEABILITY.md](REQUIREMENT-TRACEABILITY.md) ·
[07](01-product-and-ideation/07-MVP-AND-PRODUCT-ROADMAP.md) · [steering/AGENTS.md](steering/AGENTS.md)
