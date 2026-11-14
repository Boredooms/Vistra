# CLAUDE.md — Working on VISTRA with Claude Code

You are operating inside **VISTRA**, an embeddable visual intelligence and autonomous execution
platform. This file tells you how to orient yourself, how much to read, and how to make changes that do
not rot the architecture.

**Precedence:** `./AGENTS.md` (rules) → this file (workflow) → subsystem documents (design) → code
(evidence). If code contradicts a document, stop and flag the drift; do not "fix" the document to match
a shortcut.

---

## 1. What you are building

Five product surfaces share one backend:

| Surface | Path | Purpose |
|---|---|---|
| API | `apps/api` | FastAPI modular monolith: auth, tenancy, agents, knowledge, sessions, tools |
| Studio | `apps/studio` | Developer/admin console (Next.js) |
| Demo | `apps/demo` | "Acme Workspace" SaaS that embeds the SDK end-to-end |
| Docs site | `apps/docs-site` | Public developer documentation |
| SDK family | `packages/*` | Browser SDK, React bindings, widget, Ghost Cursor, API client, shared types |

Backends own truth. Frontends render truth. SDKs transport truth. No layer invents data.

---

## 2. Orientation (10 minutes, once per task)

```bash
ls docs/                          # the documentation system
cat docs/DOCUMENTATION-MAP.md     # which document answers which question
cat docs/IMPLEMENTATION-STATUS.md # what actually exists today
```

Then read **only** the documents for your subsystem (table in §3). Reading all 75 documents wastes
context and hides the two that matter.

Before editing, answer in your own words:

1. Which module owns this behavior today?
2. Which table stores it?
3. Which contract (OpenAPI operation / TS type / Pydantic schema) already exists?
4. Which tests currently cover it?
5. What is the smallest change that satisfies the request?

If you cannot answer 1–3 from the repository, search for it (`code_search` for route paths, table names,
error codes). Do not guess.

---

## 3. Subsystem → documents (context routing)

| If the task touches… | Read |
|---|---|
| Product scope, requirements, acceptance | `01-product-and-ideation/02`, `05`, `08` |
| Cross-cutting design, boundaries, ADRs | `02-system-architecture/09`, `10`, `12` |
| Repo layout, package ownership | `02-system-architecture/11` |
| Clerk, sessions, tokens, webhooks | `03-database-and-identity/17` |
| Tenancy, RBAC, the authz matrix | `03-database-and-identity/18` |
| Tables, columns, indexes, ERD | `03-database-and-identity/15`, `16` |
| RLS policies, service-role paths | `03-database-and-identity/19` |
| Files, buckets, signed URLs, retention | `03-database-and-identity/20` |
| Migrations, backups, DR | `03-database-and-identity/21` |
| FastAPI modules, layering, workers | `04-backend-and-api/22`, `26` |
| Endpoints, error envelope, pagination | `04-backend-and-api/23`, `27` |
| Conversations, session lifecycle | `04-backend-and-api/24` |
| SSE, WebSockets, event names | `04-backend-and-api/25` |
| Provider router, fallback, capability gates | `05-ai-and-model-infrastructure/28`, `31`, `34` |
| Gemini specifics | `05-ai-and-model-infrastructure/29` |
| NVIDIA NIM specifics | `05-ai-and-model-infrastructure/30` |
| Prompts, context assembly, injection defense | `05-ai-and-model-infrastructure/32` |
| Embeddings, multimodal | `05-ai-and-model-infrastructure/33` |
| Ingestion, parsing | `06-knowledge-and-rag/36` |
| Chunking, embedding pipeline | `06-knowledge-and-rag/37` |
| Retrieval, hybrid search, citations | `06-knowledge-and-rag/38`, `39` |
| Connectors, permissions-aware retrieval | `06-knowledge-and-rag/40`, `41` |
| Agents, orchestration, memory | `07-agents-and-execution/43`, `44`, `48` |
| Tools, approvals, workflows | `07-agents-and-execution/45`, `46`, `47` |
| Visual context capture | `08-visual-and-ghost-cursor/49`, `50` |
| Ghost Cursor | `08-visual-and-ghost-cursor/51`, `52`, `53` |
| SDK, widget, public API, MCP | `09-sdk-and-integrations/54`–`58` |
| Studio, demo, analytics | `10-applications-and-experience/59`–`61` |
| Tests, security, observability, perf, cost | `11-quality-security-and-operations/62`–`66` |
| Local dev, secrets, deployment, runbook | `12-deployment-and-release/67`–`75` |

---

## 4. Implementation workflow (use this order)

1. **Locate.** Find the owning module, route, table, and tests. `git grep`, `code_search`, and read
   `IMPLEMENTATION-STATUS.md`.
2. **Decide.** Write a 3–6 line plan: files to touch, contract change (if any), migration (if any),
   tests to add, doc to update. For multi-step work use a task list.
3. **Contract first.** Update/extend the Pydantic schema, OpenAPI operation, or TS type before logic.
4. **Migrate.** New table/column ⇒ forward-only SQL migration + RLS policies + tests, in the same change.
5. **Implement inside-out.** repository → service → router. Never the reverse; never business logic in a
   router.
6. **Authorize.** Every new endpoint declares its required scope and tenant predicate. Add a cross-tenant
   denial test at the same time.
7. **Test the seams.** Unit for logic, integration for route + DB, RLS test for table access, provider
   test for model paths, Playwright for user-visible journey when behavior is user-visible.
8. **Run.** `ruff`, `mypy`, `pytest`, `eslint`, `tsc --noEmit`, `vitest`, and `docs/tools/validate-docs.py`
   as applicable. Capture real output.
9. **Document + status.** Update the owning doc, `IMPLEMENTATION-STATUS.md`, and the traceability row if
   a requirement is now met.
10. **Report** using the format in `AGENTS.md` §20.

---

## 5. Working incrementally

- One vertical slice per change: migration + service + endpoint + test + doc. Avoid "foundation sweeps"
  that touch 40 files with no observable behavior.
- Keep the repository compiling at every commit. If a refactor needs multiple steps, land them behind
  type-safe adapters, not broken imports.
- Prefer extending an existing module over creating a new one. New modules need a boundary justification
  and a line in `02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md`.
- Do not reformat unrelated files. Do not reorder imports in files you did not otherwise change.

---

## 6. Running things

```bash
# Python (uv-managed)
uv sync --directory apps/api
uv run --directory apps/api pytest -q
uv run --directory apps/api ruff check .
uv run --directory apps/api mypy app

# TypeScript (pnpm workspace)
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm --filter @vistra/studio dev

# Contracts
pnpm --filter @vistra/api-client generate   # OpenAPI → typed client
python docs/tools/validate-docs.py
```

Test database: local Supabase (`supabase start`) or `TEST_DATABASE_URL`. Never point tests at a shared
staging or production database. If a dependency is unavailable, skip with an explicit reason and report
it — never silently pass.

---

## 7. Missing credentials: the honest path

When `GEMINI_API_KEY`, `NVIDIA_API_KEY`, `CLERK_SECRET_KEY`, `SUPABASE_SECRET_KEY`, or `REDIS_URL` is
absent:

1. Do **not** invent values, mock inside production code paths, or disable auth to "make it work".
2. Implement against the interface. Providers are behind ports; tests use recorded fixtures/fakes at the
   adapter boundary, not in the service.
3. Mark the affected module `blocked: credentials` in `IMPLEMENTATION-STATUS.md`.
4. Report exactly which env var is missing and what remains unverified.

Auth in particular: never stub `verify_token`. A local bypass flag must not exist in the codebase.

---

## 8. Avoiding architecture drift

Red flags you must stop and escalate:

- A second way to call a model, query documents, or resolve identity.
- A new table without `organization_id` (unless allowlisted).
- A service importing another module's `repository`.
- A frontend type that duplicates a generated type.
- Business logic in a React component that should be an API operation.
- A model name or prompt string duplicated in three files.
- A tool that executes without a policy check.
- Any code that treats retrieved text or tool output as instructions.

Fix drift by amending the document + ADR **and** the code, in one change, or by reverting to the
documented design. Never let documentation and code diverge silently.

---

## 9. Subsystem-specific cautions

**Auth.** Verify `iss`/`exp`/JWKS; cache keys with TTL; never log tokens. Webhooks: verify signature,
dedupe on event id, tolerate out-of-order delivery (recompute projection state, don't blindly apply deltas).

**Database.** RLS is default-deny: a table without policies denies everything. Service-role queries must
still filter by `organization_id`. Test both paths.

**AI.** Route by capability through the registry. Never retry a non-idempotent action. Never let a
fallback model receive a vision payload it cannot handle — check `supports(capability)` first.

**Agents.** Persist state before side effects. Approval binds to frozen arguments. Verification must be
independent of the model's own claim of success.

**Knowledge.** Filter permissions in SQL. Citations must reference retrieved chunks. Re-embedding creates
a new index version.

**Ghost Cursor.** Resolve semantically, validate visibility, degrade to highlight under reduced motion,
cancel cleanly, and never claim an action executed.

**SDK.** No secrets. Full teardown in `destroy()`. Semver discipline. Contract tests for every exported
type.

**Deployment.** Migrations are a release step, not boot-time. Workers drain on SIGTERM. No durable local
files.

---

## 10. When you are done

You must be able to paste, truthfully:

- the commands you ran and their results,
- what you did not run and why,
- the documentation you updated,
- the remaining risk.

If any of those is missing, the task is incomplete. See `./DEFINITION-OF-DONE.md`.

---

## 11. Related documents

`./AGENTS.md` · `./CURSOR-RULES.md` · `./ENGINEERING-PRINCIPLES.md` · `./DEFINITION-OF-DONE.md` ·
`../DOCUMENTATION-MAP.md` · `../IMPLEMENTATION-ROADMAP.md`
