# CURSOR-RULES.md — Project Rules for Cursor (and any IDE agent)

These rules apply workspace-wide. They are intentionally concrete: they encode decisions already made in
`docs/`, so the IDE does not have to re-litigate them per file.

**Stack:** Python 3.12 / FastAPI / SQLAlchemy 2 (async) / Pydantic v2 / Alembic-free SQL migrations ·
TypeScript 5 (strict) / Next.js App Router / React 19 / Tailwind · pnpm workspaces · Supabase (Postgres,
pgvector, Storage) · Clerk · Gemini (primary) + NVIDIA NIM (fallback) · Render + Vercel · GitHub Actions.

---

## 1. Naming standards

| Thing | Convention | Example |
|---|---|---|
| Python modules/packages | `snake_case` | `agent_runtime/` |
| Python classes | `PascalCase` | `ToolInvocationService` |
| Python functions/vars | `snake_case`, verbs for actions | `resolve_tenant_context()` |
| Constants | `UPPER_SNAKE` | `MAX_CHUNK_TOKENS` |
| DB tables | plural `snake_case` | `agent_run_steps` |
| DB columns | `snake_case` | `organization_id`, `created_at` |
| Indexes | `idx_<table>_<cols>` | `idx_documents_org_collection` |
| Constraints | `<table>_<col>_fkey` / `_key` / `_check` | `chunks_document_id_fkey` |
| REST paths | plural nouns, kebab-free, versioned | `/v1/knowledge-bases/{id}/documents` |
| JSON wire fields | `snake_case` | `created_at`, `requires_approval` |
| TS variables/types | `camelCase` / `PascalCase` | `sessionToken`, `GuideStep` |
| React components | `PascalCase.tsx` | `AgentRunTimeline.tsx` |
| Hooks | `useX` | `useAgentRunStream` |
| Packages | `@vistra/<kebab>` | `@vistra/ghost-cursor` |
| Env vars | `UPPER_SNAKE`, provider-prefixed | `GEMINI_MODEL_VISION` |
| Feature flags | `ff_<area>_<behavior>` | `ff_rag_hybrid_search` |
| Events | `<domain>.<entity>.<past_tense>` | `agent.run.completed` |
| Error codes | `SCREAMING_SNAKE` | `TENANT_MISMATCH` |

---

## 2. Type safety

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
  `any` is banned in exported types; use `unknown` + a parser.
- Validate at every boundary: API responses (zod), localStorage/sessionStorage reads, `postMessage`,
  `window.name`, URL params, and SDK user config.
- Python: `mypy --strict` on `app/` and `services/`. Pydantic v2 models for all I/O. No `dict[str, Any]`
  in a public signature; use typed models or `JsonValue` with a documented schema.
- Nullability is explicit (`T | None`); never `Optional` in new code. No sentinel empty strings for
  "missing".
- Enums over string unions in the database (`CHECK` or native enum), generated const unions in TS.
- Never suppress the type checker to silence a real mismatch (`# type: ignore[...]` needs a reason comment
  and is disallowed in `app/core`).

---

## 3. Error handling

Backend:

```python
class VistraError(Exception):
    code: str            # stable, from the registry in docs/04-.../27
    status: int
    message: str         # safe for the client
    details: dict | None # never contains secrets or SQL
```

- Raise domain errors from services; a single exception handler renders RFC 9457 `application/problem+json`
  with `code`, `request_id`, and validation `errors[]`.
- Do not catch `Exception` to return 500 manually. Do not log-and-rethrow.
- External calls: classify errors into `retryable`, `permanent`, `configuration`, `quota`, `policy`.
  Retry only the first, with jittered backoff and a cap. Never retry side effects.
- Frontend: every request has a typed error path. Render the user-safe `message`, log `request_id` for
  support, and never display a stack trace or provider payload.

---

## 4. Component boundaries

- `apps/studio` and `apps/demo` own *presentation and orchestration of API calls*. They do not compute
  authorization, tenancy, retrieval, or agent policy.
- `packages/design-system` owns primitives (Button, Dialog, Table, Toast, Skeleton) and tokens. No
  business logic, no `fetch`.
- `packages/api-client` owns transport + generated types. Components never call `fetch` directly to the
  VISTRA API.
- `packages/ghost-cursor` has zero dependencies on Next.js, the API client, or auth. It receives data.
- `packages/widget` isolates all UI inside a Shadow DOM root; it must not leak styles or globals.
- One component per file when the file exceeds ~200 lines; extract hooks for stateful logic.
- Server Components by default in Studio; add `"use client"` only at interactive leaves.

---

## 5. Backend architecture rules

```
app/
  core/       config, auth, tenancy, db, storage, logging, exceptions, events
  modules/    one folder per bounded context (router/schemas/service/repository/models/policies)
  api/        versioned composition + dependencies + middleware
  workers/    entrypoints; each is a thin loop over a service
  tests/      unit, integration, rls, contract
```

- Router = transport. Service = transaction + orchestration. Repository = SQL. No skipping layers.
- One service method = one intent. Do not expose repository objects across boundaries; return DTOs.
- Cross-module communication: import the target module's `service`, or emit a domain event. Never reach
  into its tables.
- Transactions are owned by the service; routers do not manage commits.
- Background work: enqueue a persisted job row first, then publish to Redis. Never "fire and forget" a
  task whose failure is invisible.
- Idempotency: mutating endpoints accept `Idempotency-Key`; store `(org_id, key) → response` for the TTL
  documented in doc 23.

---

## 6. API integration rules (frontend ↔ backend)

- Auth: `const token = await getToken()` from Clerk; send `Authorization: Bearer <token>`. Never read
  cookies from JS for authorization.
- Tenant context is derived server-side. The UI may display an org switcher, but the server must validate
  membership on every request.
- Streaming: use fetch + `ReadableStream` for SSE (not `EventSource`, which cannot send auth headers),
  unless the endpoint is cookie-authenticated by design.
- Cache policy: authenticated JSON is `Cache-Control: private, no-store`. Static assets are immutable +
  hashed. ETags for list endpoints where documented.
- Pagination: cursor-based (`?cursor=&limit=`), never offset for unbounded tables. Responses include
  `next_cursor` and `has_more`.
- Dates: ISO-8601 UTC with `Z`. IDs: strings (UUIDv7 or Clerk IDs), never numbers in JSON.
- Never construct API URLs by string concatenation in a component; use the generated client.

---

## 7. Database patterns

- Every tenant-scoped table: `organization_id text not null` + FK + index leading with it.
- UUIDv7 primary keys generated in the application (`uuid7()`), so IDs sort by creation time.
- `created_at`/`updated_at` `timestamptz not null default now()`; `updated_at` maintained by trigger.
- Soft delete only where documented (`deleted_at`); default is hard delete with `ON DELETE` rules that are
  explicit per FK.
- JSONB only for genuinely schemaless payloads (tool arguments, provider raw usage); anything queried
  relationally gets a column.
- Vector columns: `vector(768|1536|3072)` matching the embedding model version; index with HNSW
  (`vector_cosine_ops`) as documented in doc 38.
- Full-text: generated `tsvector` column + GIN index.
- Migrations: `NNNN_description.sql`, forward-only, idempotent guards (`IF NOT EXISTS`) only where safe;
  never edit applied migrations; never run destructive DDL without a documented backup step.
- RLS: enable + force on every table; policies named `<table>_<action>_<scope>`.

---

## 8. Test requirements per file type

| File you touched | Minimum tests |
|---|---|
| `modules/*/service.py` | unit tests per branch + policy denial |
| `modules/*/router.py` | integration: 200/401/403/404/422 |
| `migrations/*.sql` | clean-DB apply + RLS isolation test |
| `providers/*` | fixture-based success/failure/fallback tests |
| `packages/ghost-cursor/**` | resolution + motion state-machine tests |
| `packages/sdk-*/**` | public API type test + lifecycle/cleanup test |
| React page with data | component test for loading/empty/error; e2e if user-visible flow |
| Prompt change | eval fixture + recorded diff in `evaluation-worker` suite |

No test may hit a live provider, live Supabase, or the network. Use fakes at the adapter boundary and
recorded fixtures for provider payloads.

---

## 9. Security constraints (hard rules)

- No secret ever appears in `NEXT_PUBLIC_*`, client bundles, logs, error bodies, or test fixtures.
- `SUPABASE_SECRET_KEY` is server-only and used only in the enumerated privileged paths (doc 19).
- No `eval`, `new Function`, `innerHTML` with external content, or dynamic `require` of user input.
- All user-supplied URLs pass the egress allowlist/SSRF filter before fetch.
- Uploads: validate magic bytes, size, and parse in a sandbox; quarantine failures.
- Do not add CORS wildcards. Allowed origins are per-environment and explicit.
- Prompt-injection defense is mandatory in any path where retrieved text or tool output enters a prompt.
- Never implement auth "temporarily disabled" flags. There is no local bypass.

---

## 10. Documentation expectations

Every changed contract updates docs in the same commit. Add a doc header when creating a new document:

```md
# Title
**Doc ID:** 42 · **Status:** Draft|Review|Approved · **Owner:** <area>
**Depends on:** [39](../06-knowledge-and-rag/39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md) · **Related:** [35](../06-knowledge-and-rag/35-KNOWLEDGE-ENGINE-ARCHITECTURE.md)
```

Rules:

- Cross-link with relative paths; validate with `python docs/tools/validate-docs.py`.
- Mermaid: no `%%` comments inside node labels; quote labels containing parentheses or colons.
- Every diagram has a paragraph explaining it. No decorative diagrams.
- Do not add a document without a row in `docs/DOCUMENTATION-MAP.md`.
- Keep terminology identical to `docs/README.md` §Terminology (organization, project, application,
  session, run, step, chunk…).

---

## 11. Commit and review hygiene

- Conventional commits: `feat(api):`, `fix(sdk):`, `docs(rag):`, `chore(ci):`.
- One concern per commit; migrations and their code in the same PR (separate commits are fine).
- Never commit `.env*`, `*.pem`, dumps, or generated bundles.
- PR description must state: what changed, contract impact, migration impact, tests run, docs updated,
  and residual risk.

---

## 12. Related documents

`./AGENTS.md` · `./CLAUDE.md` · `./ENGINEERING-PRINCIPLES.md` · `./DEFINITION-OF-DONE.md` ·
`../02-system-architecture/11-REPOSITORY-AND-MONOREPO-STRUCTURE.md` ·
`../04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md`
