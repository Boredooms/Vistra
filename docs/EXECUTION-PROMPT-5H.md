# VISTRA — 5-Hour End-to-End Build, Deploy & Demo Prompt

**Doc ID:** XP-1 · **Status:** Ready to execute · **Timebox:** 300 minutes
**Use:** paste this whole file (or the prompt below) into a coding agent with repo access.
**Reads:** [AGENTS](steering/AGENTS.md) · [23](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) · [60](10-applications-and-experience/60-DEMO-APPLICATION-AND-END-TO-END-SCENARIOS.md)

---

# PROMPT — START HERE

You are the lead engineer building VISTRA end-to-end in **5 hours**, then deploying it and demoing it. You have a
complete specification in `docs/` (75 technical documents). You will not implement all of it. You will implement
**one vertical slice that runs for real, deployed, on a mock website**, and you will say plainly what you skipped.

## 0. Non-negotiable rules

1. **Read before writing.** Read `docs/steering/AGENTS.md`, then `docs/steering/DEFINITION-OF-DONE.md`, then the
   documents listed in §3. Do not invent contracts: endpoints, table names, error codes and env vars already exist
   in the docs — use those exact names.
2. **No fake functionality.** Real database writes, real embeddings, real retrieval, real tool execution, real
   verification. If a credential is missing, use the documented degradation (§9) and **label it in the UI**. Never
   ship a mock response that pretends to be a model answer.
3. **Tenant isolation is not optional.** `organization_id` on every tenant table, RLS enabled, and a test proving a
   second org sees nothing.
4. **The model proposes, policy decides, execution verifies.** Never let model output directly cause a side effect
   without a policy check and a post-execution verification.
5. **Guide Mode ≠ Do Mode.** A cursor animation is never reported as a completed business action.
6. **Secrets never reach the browser.** Only `NEXT_PUBLIC_*` values and short-lived `sdk` tokens are client-side.
7. **Report at the end with evidence**: URLs, commands run, test names, what works, what does not. No claims
   without a check.

## 1. What you are building (the demoable slice)

A customer (Acme) embeds VISTRA into their SaaS. In the deployed demo:

- A user asks a question → answer is retrieved from Acme's own indexed documents, **with citations**.
- A user selects a UI element → VISTRA explains it using real DOM/accessibility context.
- A user asks "show me how to invite a teammate" → the **Ghost Cursor** walks real elements, step by step.
- A user asks "create a project called Website Redesign" → policy returns `require_approval` → approval card →
  the tool executes against the demo app's API → VISTRA **re-verifies** the record exists → it appears in the table.
- A forced provider failure → the same request completes through the fallback route with a visible provider trace.
- Studio-lite page shows the run: plan, steps, policy decision, provider/model, latency, verification result.

## 2. Stack you must use (fixed)

| Layer | Choice |
|---|---|
| API | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 async + asyncpg, Alembic or numbered SQL migrations |
| DB | Supabase Postgres + `pgvector` + `tsvector` (or local `pgvector/pgvector:pg16` in Docker) |
| Storage | Supabase Storage private bucket (signed URLs) |
| AI primary | Gemini via `google-genai` |
| AI fallback | NVIDIA NIM, OpenAI-compatible `POST {NVIDIA_BASE_URL}/chat/completions` |
| Demo app | Next.js 15 App Router + TypeScript + Tailwind (the mock website) + one route handler per tool |
| SDK/cursor | `packages/sdk-core` (vanilla) + `packages/ghost-cursor` (TS, standalone) |
| Deploy | API → Render (Docker), demo → Vercel, DB/storage → Supabase |
| CI | GitHub Actions: lint, typecheck, pytest, `validate-docs.py` |

Monorepo (create only what you need):

```
apps/api/            FastAPI
apps/demo/           Next.js mock SaaS ("Acme Workspace")
apps/studio-lite/    OPTIONAL: one page reading /v1/runs/{id} (skip if behind)
packages/ghost-cursor/
packages/sdk-core/
scripts/             migrate.py, seed.py, smoke.sh
supabase/migrations/ 0001…000N.sql
docs/                EXISTS — do not restructure
```

## 3. Reading order (time-boxed: 25 minutes, then code)

1. `docs/steering/AGENTS.md` (5 min) — the rules that override your instincts.
2. `docs/04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md` §4 (5 min) — endpoint inventory.
3. `docs/03-database-and-identity/16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md` — **only** the tables you use (§7).
4. `docs/06-knowledge-and-rag/38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md` §3–§4 (5 min) — the SQL you will write.
5. `docs/08-visual-and-ghost-cursor/52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md` §3 (5 min) — targeting order.
6. `docs/07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md` §4 (5 min) — policy + verification.
7. `docs/12-deployment-and-release/68-ENVIRONMENT-AND-SECRETS-MANAGEMENT.md` §3 — exact env var names.

Do **not** read all 75 documents. Do not rewrite them.

## 4. Hard contracts (copy exactly)

### 4.1 Endpoints to implement

```
GET  /healthz                              liveness + dependency summary, no secrets
GET  /readyz                               DB + Redis-or-DB readiness

GET  /v1/applications                      list (user or dev-key auth)
POST /v1/applications/{id}/keys            create API key (returned once)
POST /v1/sdk/sessions                      API key; mints sdk token; Origin validated
POST /v1/sdk/sessions/{id}/refresh         API key
GET  /v1/sdk/config                        API key; widget config + capabilities

POST /v1/sdk/messages                      sdk token; SSE stream of events
GET  /v1/sdk/sessions/{id}/messages        sdk token; history
POST /v1/sdk/context                       sdk token; bounded capture snapshot
POST /v1/sdk/guides                        sdk token; create guide flow
POST /v1/sdk/guides/{flow_id}/steps/{i}    sdk token; step outcome
POST /v1/sdk/approvals/{id}                sdk token; approve/reject

GET/POST /v1/knowledge-bases
GET/POST /v1/knowledge-bases/{id}/collections
GET/POST /v1/collections/{id}/sources
GET  /v1/ingestion-jobs/{id}
POST /v1/knowledge/search                   debug retrieval (chunks + scores)
POST /v1/files/presign · /v1/files/{id}/complete

GET  /v1/runs/{id} · /v1/runs/{id}/steps
POST /v1/runs/{id}/cancel
GET  /v1/usage
```

### 4.2 Tables to create (minimum, real DDL)

`organizations`, `users`, `organization_members`, `applications`, `application_domains`, `api_keys`,
`application_sessions`, `knowledge_bases`, `knowledge_collections`, `knowledge_sources`, `documents`,
`document_versions`, `document_chunks`, `embeddings`, `ingestion_jobs`, `sessions`, `session_messages`,
`session_events`, `agent_runs`, `agent_run_steps`, `tool_invocations`, `approvals`, `guide_flows`,
`usage_records`, `model_usage`, `audit_events`.

Rules: `uuid` pk (app-generated v7 or `gen_random_uuid()`), `organization_id text not null` on every tenant table,
`created_at/updated_at timestamptz default now()`, FKs `on delete cascade` for children, `enable row level security`
+ `create policy tenant_isolation … using (organization_id = current_setting('app.organization_id', true))`.

`document_chunks`: `id, organization_id, collection_id, document_id, document_version_id, chunk_index,
parent_chunk_id, content text, content_tsv tsvector generated, token_count int, section_path text, page int,
metadata jsonb`.
`embeddings`: `id, organization_id, chunk_id unique, model text, dim int, index_version int default 1,
embedding vector(768)` + HNSW `vector_cosine_ops`.

### 4.3 Cursor targeting priority (do not change order)

`data-vistra-target` → accessible role + name → label/`aria-label` → stable data attribute → validated CSS selector
→ visible text → coordinates **last, only with `allowCoordinateFallback: true`**.

Guide events to emit: `guide.started`, `target.resolved`, `target.missing`, `cursor.moving`, `cursor.hovering`,
`step.waiting`, `step.completed`, `step.failed`, `guide.completed`, `guide.cancelled`.

### 4.4 Error codes (problem+json, RFC 9457, `code` stable)

`ORIGIN_NOT_ALLOWED` 403 · `SESSION_EXPIRED` 401 · `SESSION_REVOKED` 401 · `AUTH_INVALID_ISSUER` 401 ·
`AUTH_UNAVAILABLE` 503 · `VALIDATION_ERROR` 422 · `TOOL_ARGS_INVALID` 422 · `POLICY_DENIED` 403 ·
`APPROVAL_REQUIRED` 409 · `APPROVAL_EXPIRED` 409 · `PROVIDER_UNAVAILABLE` 503 · `PROVIDER_CONFIGURATION_ERROR` 500 ·
`CAPABILITY_UNAVAILABLE` 422 · `INSUFFICIENT_EVIDENCE` 200-with-flag (not an error) · `INTERNAL_ERROR` 500.

### 4.5 Env vars (names are fixed by doc 68)

```
APP_ENV, APP_URL, API_URL, API_VERSION
CLERK_SECRET_KEY, CLERK_ISSUER, CLERK_JWKS_URL            # optional in this sprint
SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_DB_URL
AI_PRIMARY_PROVIDER=gemini, AI_FALLBACK_PROVIDER=nvidia, AI_PROVIDER_MODE=live|fake
GEMINI_API_KEY, GEMINI_MODEL_DEFAULT, GEMINI_MODEL_FAST, GEMINI_MODEL_EMBEDDING, GEMINI_EMBEDDING_DIM=768
NVIDIA_API_KEY, NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1, NVIDIA_MODEL_DEFAULT
TOOL_SIGNING_SECRET
ENCRYPTION_KEY, ENCRYPTION_KEY_VERSION=1
REDIS_URL (optional), STORAGE_PROVIDER=supabase, S3_*
CORS_ALLOWED_ORIGINS, RATE_LIMIT_ENABLED, LOG_LEVEL, SENTRY_DSN (optional)
```

## 5. The five hours

### BLOCK 1 — 0:00–0:45 — Foundation that cannot be skipped

1. Create the monorepo skeleton, `apps/api` FastAPI app factory with middleware: request-id, structured JSON logs,
   problem+json exception handlers, CORS from `CORS_ALLOWED_ORIGINS`.
2. `scripts/migrate.py` applying `supabase/migrations/*.sql` in order against `SUPABASE_DB_URL`.
3. Migration `0001_core.sql`: extensions, orgs/users/members/apps/domains/keys/sessions.
4. `scripts/seed.py`: one org (`org_demo`), one app (`app_demo`), one API key (printed once), one project set.
5. `GET /healthz`, `GET /readyz`.
6. `.env.example` matching §4.5; `.env` locally; GitHub Actions running ruff + pytest + docs validator.

**Exit check:** `curl localhost:8000/healthz` → 200 with `db: ok`; migrations run twice without error.

### BLOCK 2 — 0:45–2:00 — Data, auth, sessions, streaming

1. `0002_knowledge.sql` + `0003_runtime.sql` (sessions, messages, events, runs, steps, tool_invocations, approvals,
   guide_flows, usage_records, model_usage, audit_events) + RLS policies on all.
2. API-key auth: `Authorization: Bearer vsk_live_…`, SHA-256 hash stored, constant-time compare, scope check.
3. `POST /v1/sdk/sessions`: validate `Origin` against `application_domains` → else `403 ORIGIN_NOT_ALLOWED`;
   issue HS256 token `{aud:"sdk", app_id, org_id, session_id, exp: now+900}` signed with `TOOL_SIGNING_SECRET`.
4. `POST /v1/sdk/messages`: persist user message, create `agent_run`, stream SSE (`text/event-stream`,
   `X-Accel-Buffering: no`, heartbeat every 15 s) with events `run.started`, `token`, `citation`, `tool.proposed`,
   `approval.required`, `run.completed`, `run.failed`. Persist every event to `session_events`.
5. `POST /v1/sdk/context`: accept bounded snapshot (route, title, a11y summary ≤ 8 KB, optional selection),
   redacting `input[type=password]`, `autocomplete=cc-*`.
6. `POST /v1/runs/{id}/cancel`; `GET /v1/runs/{id}` + `/steps`.
7. Test suite: token expiry, wrong audience, wrong origin, cross-org read, SSE happy path.

**Exit check:** two `curl`s create a session and stream a (stub) reply; a request from an unlisted origin returns
`ORIGIN_NOT_ALLOWED`; a second org's run id returns 404.

### BLOCK 3 — 2:00–3:00 — Providers, knowledge, retrieval, citations

1. `app/ai/`: `Provider` protocol (`generate_text`, `generate_structured(schema)`, `embed`), `GeminiProvider`,
   `NvidiaProvider`, `FakeProvider`, `Router` with capability map, retry ×2 with jitter, breaker (5 fails → open
   30 s), fallback allowed **only** if the capability is supported by the target and `AI_FALLBACK_PROVIDER` is set.
   Record provider/model/latency/tokens into `model_usage` on every call.
2. Ingestion: `POST /v1/collections/{id}/sources` (md, txt, html, url) → `ingestion_jobs` row → inline `asyncio`
   task (documented temporary; the job table is the seam for a worker): fetch/parse → normalize → chunk
   (~800 tokens, 15 % overlap, heading-aware, parent/child) → embed in batches of 32 → insert `document_chunks` +
   `embeddings` with `index_version=1` → job `succeeded`. Idempotent by content hash.
3. Hybrid retrieval SQL: vector top-40 (`<=>`) + FTS top-40 (`websearch_to_tsquery`) → RRF (k=60) → dedupe by
   document → ACL filter in SQL (org + collection) → top-8 → optional rerank stub (score blend, no paid service).
4. Answer assembly: context block per chunk with `[c1]`-style ids; response schema
   `{answer, citations:[{chunk_id, document_id, title, page, section}], insufficient_evidence:bool}`. **Validate**:
   every `[cN]` maps to a returned chunk id; strip/flag uncited claims; if no chunk passes threshold → set
   `insufficient_evidence: true` and say so.
5. `POST /v1/knowledge/search` for debugging (scores visible).
6. Seed 3 real documents for Acme: `pricing.md`, `api-reference.md`, `onboarding.html`.

**Exit check:** "What is included in the Starter plan?" returns an answer whose citations resolve to the real
`pricing.md` chunk; asking about something absent returns `insufficient_evidence: true`; `/v1/knowledge/search`
shows both vector and FTS contributions.

### BLOCK 4 — 3:00–4:00 — Mock website, SDK, Ghost Cursor, one real action

1. **`apps/demo` (Acme Workspace)** — Next.js, Tailwind, pages: `/dashboard`, `/projects`, `/projects/[id]`,
   `/team`, `/billing`, `/docs`, `/settings`. Real data from its own route handlers backed by Postgres (or a JSON
   store via API if time is short — but the project table must be real, since a tool writes to it).
   Every interactive element gets `data-vistra-target="projects.invite"` style ids.
2. **Tools (server-side, in the demo app):** `create_project`, `invite_member`, `list_projects`. Each is a route
   handler that **verifies an HMAC** of `{tool, args, run_id, ts}` with `TOOL_SIGNING_SECRET` and rejects stale
   (>60 s) or replayed calls. `list_projects` is the verification read.
3. **`packages/sdk-core`**: `Vistra.init({appId, apiUrl, getSessionToken})`, `ask()`, `on(event)`, `guide()`,
   `guideFlow()`, `select()`, `destroy()`. Session mint goes through the demo's `/api/vistra/session` route (holds
   the API key server-side). Auto-refresh at 80 % TTL. No key in the bundle.
4. **`packages/ghost-cursor`**: fixed-position overlay pointer, SVG artwork with correct hotspot, bezier motion with
   ease-in-out and 550–900 ms durations, `requestAnimationFrame` loop, scroll-into-view, resize/mutation observers,
   `prefers-reduced-motion` (instant teleport + highlight), target highlight ring + tooltip + step indicator,
   `TARGET_MISSING` / `INTERRUPTED` / `CANCELLED` states, `destroy()` removing all listeners.
5. **Wire the four flows**: ask → SSE → answer with citation chips that scroll to `/docs#anchor`; select → context →
   explain; guide → 3-step flow to invite; action → policy → approval card → execute → verify → refresh table.
6. **Policy**: `create_project` → `require_approval`; `invite_member` → `allow` if role permits; anything
   unregistered → `deny` (`POLICY_DENIED`). Approval binds to a SHA-256 of the frozen args; changing args invalidates.
7. **Verification**: after `create_project`, call `list_projects` and match `id`; only then mark
   `tool_invocations.verified_at`. Emit `verification.succeeded|failed`.

**Exit check (local):** the six demo beats in §7 all pass against `localhost:8000` + `localhost:3001`.

### BLOCK 5 — 4:00–5:00 — Deploy, prove, report

1. **Supabase:** create project (region near Render), run migrations, create private bucket `documents-original`,
   run seed, verify RLS query returns zero missing/unforced rows.
2. **Render:** Dockerfile (§8), web service `vistra-api`, health check `/readyz`, env group from §4.5,
   `CORS_ALLOWED_ORIGINS=https://<demo>.vercel.app`, deploy.
3. **Vercel:** project for `apps/demo`, env `NEXT_PUBLIC_VISTRA_API_URL`, `NEXT_PUBLIC_VISTRA_APP_ID`,
   `VISTRA_API_KEY` (server only), `TOOL_SIGNING_SECRET` (server only).
4. **Close the loop:** add the Vercel domain to `application_domains`; verify preflight + session mint from the
   deployed origin.
5. **`scripts/smoke.sh`** (must exit non-zero on failure): health, session mint, one message, one retrieval with
   citation, one guide, one approved action + verification.
6. **Update docs:** `docs/IMPLEMENTATION-STATUS.md` (real state, per module), `docs/IMPLEMENTATION-ROADMAP.md`
   (phase status), and append the *actual* deployed demo script + URLs to
   `docs/10-applications-and-experience/60-DEMO-APPLICATION-AND-END-TO-END-SCENARIOS.md`. Run
   `python docs/tools/validate-docs.py` and keep it green.
7. **Report** using §10.

## 6. Cut order when you are behind (cut in this order, never the other way)

1. `apps/studio-lite` (use `GET /v1/runs/{id}` in a terminal/JSON viewer instead).
2. Reranking (keep RRF only) and query rewriting.
3. Screenshot capture (keep DOM/a11y/selection — vision beat becomes "explain this element", not "explain this image").
4. NVIDIA fallback live (keep the code path, prove it with `FakeProvider` as `AI_PROVIDER_MODE=fake` and label it).
5. HTML/URL ingestion (keep md/txt).
6. Widget theming, trail animation, focus rings.
7. `packages/sdk-react` (the vanilla SDK is enough to demo).

**Never cut:** RLS + tenant test, SSE streaming, citations, approval, verification, cursor targeting by role+name,
CORS origin validation, deployed health checks, honest status docs.

## 7. The six demo beats (rehearse these; they are the deliverable)

| # | Ask | What must visibly happen | Proof to show |
|---|---|---|---|
| 1 | "What's included in the Starter plan?" | Answer streams, 1–2 citation chips, clicking one opens `/docs` at the section | `/v1/knowledge/search` shows vector + FTS hits |
| 2 | Select the "Overdue" badge on a project row → "what does this mean?" | Answer names the element's role/name and its visible text | `session_events` has the context snapshot |
| 3 | "Show me how to invite a teammate" | Cursor travels to Team → Invite member → name field, with tooltips and step dots | Cursor state log; `guide_flows` row completed |
| 4 | "Create a project called Website Redesign" | Tool proposed → approval card → approve → row appears in the Projects table → toast "verified" | `tool_invocations`: `verified_at` set; the row id in the demo DB |
| 5 | Flip `AI_PROVIDER_MODE`/breaker to force primary failure, repeat beat 1 | Same answer completes via fallback route; badge shows which provider served it | `model_usage` rows: primary failed, fallback succeeded |
| 6 | Open `/runs/{id}` (or Studio-lite) | Timeline: intent → retrieval → policy → approval → execution → verification, with latency and cost | JSON from `/v1/runs/{id}/steps` |

Beat 4 is the one that must never be faked: if verification fails, the UI must say it failed.

## 8. Deployment specifics

```dockerfile
# apps/api/Dockerfile
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 curl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv
WORKDIR /app
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/api/app ./app
COPY apps/api/scripts ./scripts
COPY supabase ./supabase
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["sh","-c","uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
```

Order: Supabase → migrations → API (Render) → demo (Vercel) → register Vercel domain in `application_domains` →
smoke. Never deploy the demo before the API answers `/readyz`.

## 9. Degradation matrix (allowed, must be labeled)

| Missing | Do this | Label |
|---|---|---|
| `GEMINI_API_KEY` | `AI_PROVIDER_MODE=fake`: deterministic provider that returns schema-valid output + hash-based 768-d embeddings; retrieval, citations, cursor, approval, verification all still real | UI banner "simulated model" |
| `NVIDIA_API_KEY` | Fallback path exercised with `FakeProvider` as secondary; record it | Trace shows `provider=fake-secondary` |
| Clerk keys | Skip Studio auth; user routes accept a dev bearer token gated by `APP_ENV != production`; org resolved from token claims | `/v1/applications` protected by dev token in demo only |
| Supabase Storage | Ingest md/txt/url only; no file upload | Status doc notes it |
| Supabase entirely | Docker `pgvector/pgvector:pg16` locally; Render Postgres in prod | Status doc notes it |

Anything else missing: stop and say what is missing. Do not silently substitute.

## 10. Report format (fill this in, with numbers)

```
DEPLOYED
  API:     https://…        /healthz → 200 (…ms)
  Demo:    https://…
  DB:      Supabase project … (migrations 0001–000N applied)
DEMO BEATS: 1 ✅ 2 ✅ 3 ✅ 4 ✅ (verified_at …) 5 ✅ 6 ✅
CONTRACTS MET: RLS ✅ (test …), origin check ✅ (test …), citations ✅ (…), approval hash ✅, verification ✅
TESTS: pytest … passed / … failed · typecheck … · validate-docs.py 0 errors
NOT DONE (honest): Studio, workflows, MCP, webhooks, voice, screenshot vision, reranker, workers…
RISKS: …
NEXT 60 MIN IF CONTINUING: …
```

If a beat fails on the deployed URL, say so and say why. A demo that half-works and is described accurately is a
success; one that is described as complete and is not, is a failure.

## 11. Stop conditions

- 4:30 and the action beat is not deployed → freeze features, fix only the failing beat, deploy, report.
- 4:45 and deploys are broken → report the deployed part, the exact error, and the fix in flight. Do not leave
  production in a half-migrated state; migrations run before image switch, always.
- Any P1 security issue (secret in bundle, cross-tenant read) → stop feature work and fix it.

---

## Related documents

[steering/AGENTS.md](steering/AGENTS.md) · [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) ·
[60](10-applications-and-experience/60-DEMO-APPLICATION-AND-END-TO-END-SCENARIOS.md) ·
[69](12-deployment-and-release/69-RENDER-BACKEND-DEPLOYMENT.md) · [74](12-deployment-and-release/74-PRODUCTION-RELEASE-AND-ROLLBACK.md)
