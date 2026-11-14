# Technology Stack and Dependencies

**Doc ID:** 14 · **Status:** Approved · **Area:** Architecture
**Depends on:** [10](10-ARCHITECTURE-DECISIONS.md) · **Related:** [68](../12-deployment-and-release/68-ENVIRONMENT-AND-SECRETS-MANAGEMENT.md), [72](../12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md)

---

## 1. Purpose

Enumerate the chosen technologies, the reason each exists, the version policy, and the dependency rules.
"No new dependency" decisions are also decisions; they are recorded here.

## 2. Version policy

- **Pin exact** versions in lockfiles (`pnpm-lock.yaml`, `uv.lock`). Ranges in manifests, exact in locks.
- **Runtime floor:** Python 3.12, Node 22 LTS, PostgreSQL 15+, pgvector 0.7+, Redis 7.
- **Major upgrades** require: passing suite, bundle/perf comparison, and a changelog note.
- **Security patches** within the SLA in NFR-SEC-004.
- **No dependency** that duplicates stdlib/browser capability (e.g. no `axios` if `fetch` suffices; no
  `lodash` for 3 helpers).

## 3. Backend

| Component | Choice | Why | Alternatives rejected |
|---|---|---|---|
| Language | Python 3.12 | Async ecosystem, typing maturity, AI SDK support | Node (weaker numeric/ML ecosystem), Go (slower delivery) |
| Framework | FastAPI | Async, Pydantic-native, OpenAPI generation, SSE/WS support | Django (heavier, sync-first), Flask (no async story), Litestar (smaller ecosystem) |
| ASGI server | uvicorn (gunicorn workers optional) | Standard, well-understood, supports lifespan | Hypercorn (HTTP/2 not needed) |
| ORM / SQL | SQLAlchemy 2.x async + text() for hot queries | Typed models + escape hatch for vector/FTS SQL | Django ORM (framework coupling), raw asyncpg only (no model layer) |
| Driver | asyncpg | Fast, async, prepared statements | psycopg3 (fine; asyncpg chosen for perf) |
| Validation | Pydantic v2 | Fast, strict, JSON Schema export | attrs/marshmallow (less OpenAPI synergy) |
| Migrations | Hand-written ordered SQL + a small runner | Full control of RLS/pgvector DDL; reproducible | Alembic autogenerate (poor at policies/functions), Supabase CLI only (limited review) |
| Jobs | Postgres job table + Redis wake signal | Durable, transactional with business data | Celery (broker complexity), Temporal (see ADR-005) |
| Cache / limits | Redis 7 | Counters, locks, hot cache, pub/sub for SSE fan-out | Memcached (no data structures), Postgres-only (slower counters) |
| HTTP client | httpx | Async, timeouts, connection pools | requests (sync only) |
| Crypto | `cryptography` | AES-GCM for integration credentials at rest | PyNaCl (fine, less ubiquitous) |
| Logging | structlog → JSON stdout | Structured, contextvar-bound | stdlib logging (weaker context) |
| Tracing | OpenTelemetry SDK + OTLP exporter | Vendor-neutral spans | Vendor SDKs (lock-in) |
| Tests | pytest, pytest-asyncio, httpx AsyncClient | Standard | unittest (verbose) |
| Static analysis | ruff, mypy --strict | Speed + type safety | flake8/black (slower, two tools) |

## 4. Data and storage

| Component | Choice | Why | Notes |
|---|---|---|---|
| Primary DB | Supabase PostgreSQL 15+ | Managed, backups, pooling, RLS, extensions | Single source of truth |
| Vectors | pgvector (`vector`, HNSW) | Filtered ANN in the same transaction as ACLs | Dimension-per-index-version |
| Keyword | PostgreSQL `tsvector` + GIN | No second search engine | `english` config + custom dictionary for product terms |
| Objects | Supabase Storage (S3-compatible API) | Signed URLs, isolation, no server disk | Behind `StorageProvider` port |
| Cache | Redis (managed) | Ephemeral only | ADR-014 |
| Pooling | Supavisor (Supabase pooler) | Connection multiplexing for serverless/containers | Transaction mode; no session-level state |

## 5. AI providers

| Component | Choice | Why | Caveats |
|---|---|---|---|
| Primary provider | Gemini via `google-genai` | Multimodal, structured output, tools, embeddings, live | Interactions API is the call surface (ADR-007); model IDs configurable |
| Secondary provider | NVIDIA NIM (`integrate.api.nvidia.com/v1`) | OpenAI-compatible, broad text catalog, resilience | Per-model capability; no assumption of vision/tools/embeddings parity |
| SDK (Python) | `google-genai` | Official, GA | Pin version; adapter isolates API changes |
| Transport | httpx for NVIDIA (OpenAI-compatible REST) | No need for the OpenAI SDK just for fallback | Keep request/response mapping explicit |

All model access is through `services/ai` (implemented inside `apps/api/app/modules/ai` or
`app/core/ai`); no module imports `google.genai` or calls NVIDIA directly.

## 6. Frontend and SDK

| Component | Choice | Why |
|---|---|---|
| Framework (Studio/demo/docs) | Next.js (App Router) | SSR for admin data, routing, image/font optimization, Vercel fit |
| UI runtime | React 19 | Ecosystem, server components |
| Language | TypeScript 5 strict | Contract safety |
| Styling | Tailwind CSS + design tokens | Consistency, no runtime CSS-in-JS cost |
| Components | Radix primitives + local design system | Accessible behavior without lock-in |
| Data fetching (client) | generated `@vistra/api-client` + TanStack Query (Studio only) | Cache/retry semantics where needed |
| SDK runtime | Vanilla TS + tsup builds (ESM/IIFE) | Framework-free embedding |
| Cursor | TypeScript + SVG + Web Animations/CSS transforms | Performance and control |
| Charts (Studio) | Recharts or visx (one, chosen at implementation) | Lightweight, accessible |
| Tests | Vitest, Testing Library, Playwright | Unit + e2e |

## 7. Platform and tooling

| Concern | Choice | Notes |
|---|---|---|
| Backend hosting | Render (Docker web + workers) | Health checks, private networking, no durable disk |
| Frontend hosting | Vercel | Preview deployments, edge caching for static |
| CI/CD | GitHub Actions | Path-filtered; reusable workflows |
| Container | Docker multi-stage, distroless/slim base | Digest-pinned, non-root |
| Package managers | pnpm 9, uv | Fast, lockfile-first |
| Monorepo tooling | pnpm workspaces (+ `turbo` optional later) | Keep surface small until needed |
| Docs validation | `docs/tools/validate-docs.py` (stdlib) | No third-party doc toolchain |
| Error tracking | Sentry (or OTLP-compatible equivalent) | Decision deferred to doc 64 |
| Product analytics | internal events → Postgres rollups | Avoid third-party on customer pages |

## 8. Reference links (authoritative)

- Clerk: https://clerk.com/docs · Supabase: https://supabase.com/docs
- Clerk×Supabase third-party auth: https://supabase.com/docs/guides/auth/third-party/clerk
- pgvector: https://github.com/pgvector/pgvector
- PostgreSQL FTS: https://www.postgresql.org/docs/current/textsearch.html
- Gemini API: https://ai.google.dev/gemini-api/docs · SDK: https://ai.google.dev/gemini-api/docs/libraries
- Gemini Interactions API: https://ai.google.dev/gemini-api/docs/interactions-overview
- Gemini embeddings: https://ai.google.dev/gemini-api/docs/embeddings
- NVIDIA NIM: https://docs.api.nvidia.com/nim/reference/llm-apis
- FastAPI: https://fastapi.tiangolo.com/ · SQLAlchemy: https://docs.sqlalchemy.org/
- Next.js: https://nextjs.org/docs · React: https://react.dev · TypeScript: https://www.typescriptlang.org/docs/
- Render: https://render.com/docs · Vercel: https://vercel.com/docs
- Playwright: https://playwright.dev/docs
- MCP: https://modelcontextprotocol.io/

## 9. Dependency governance

1. Every new runtime dependency requires: purpose, size impact, maintenance signal (release cadence,
   open criticals), license compatibility, and an alternative considered.
2. Frontend bundle budgets enforce the cost of additions (NFR-PERF).
3. No dependency may be added for a single trivial function; write it.
4. Direct dependencies only — no transitive pinning except security overrides, documented in
   `pnpm.overrides` / `uv` constraints with a comment and expiry.
5. License allowlist: MIT, Apache-2.0, BSD, ISC, MPL-2.0. Copyleft (GPL/AGPL) requires legal review.

## 10. Explicitly rejected for v1

| Rejected | Why |
|---|---|
| Kubernetes | Ops burden without multi-service need (ADR-028) |
| Kafka / event streaming | Postgres outbox + queues suffice |
| Separate vector DB | Transactional ACL filtering + one datastore |
| Elasticsearch | Second ACL model, ops cost |
| GraphQL | Contract generation and SDK simplicity favor REST; streaming favors SSE |
| Prisma / Drizzle | Python owns the schema; cross-language ORM duplication |
| Redux | Server state belongs on the server; local state is small |
| Celery | Job table + workers is simpler and transactional (ADR-005) |
| LangChain / agent frameworks | Hide capability gaps and retries; we need explicit control (ADR-006) |
| Micro-frontends | No organizational need |

## 11. Acceptance criteria

- [ ] Every row in §3–§7 has an owner document that describes its use.
- [ ] No dependency outside the allowlist exists in the lockfiles.
- [ ] Version floors match CI and Docker base images.
- [ ] Rejected list is respected (a violation requires an ADR).

## 12. Related documents

[10](10-ARCHITECTURE-DECISIONS.md) · [11](11-REPOSITORY-AND-MONOREPO-STRUCTURE.md) ·
[28](../05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md) ·
[72](../12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md)
