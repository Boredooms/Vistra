# Repository and Monorepo Structure

**Doc ID:** 11 · **Status:** Approved (proposed layout; not yet created) · **Area:** Architecture
**Depends on:** [09](09-SYSTEM-ARCHITECTURE.md) · **Related:** [12](12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md), [67](../12-deployment-and-release/67-LOCAL-DEVELOPMENT-ENVIRONMENT.md)

---

## 1. Purpose

Define the canonical repository layout, what belongs in each directory, who owns its public interfaces,
and how it is built, tested, and deployed. This is the target structure for implementation; it is **not**
an instruction to create application folders in the documentation phase.

## 2. Conventions

- **Languages:** TypeScript (pnpm workspaces) and Python (`uv`). One repo, two toolchains.
- **Contract boundary:** OpenAPI 3.1 + JSON Schema. TypeScript and Python never import each other.
- **Ownership:** each package/service has one owning area (Platform, Runtime, Knowledge, Experience, DX).
- **Dependency direction:** `shared-types → api-client → sdk-core → {sdk-react, widget}`;
  `packages/*` never import `apps/*`; `apps/*` never import another app.
- **No build output committed.** No `dist/`, `.next/`, `__pycache__/`, `.venv/`.

---

## 3. Target tree

```text
vistra/
├── apps/
│   ├── api/                      # FastAPI modular monolith (Render)
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── core/             # config, auth, tenancy, db, storage, logging, exceptions, events
│   │   │   ├── modules/          # bounded contexts (see doc 12)
│   │   │   ├── api/v1/           # route composition
│   │   │   └── workers/          # thin entrypoints (also importable by services/*)
│   │   ├── migrations/           # symlinked/owned by infrastructure/supabase/migrations
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── Dockerfile
│   ├── studio/                   # Next.js developer console (Vercel)
│   ├── demo/                     # Acme Workspace reference SaaS (Vercel)
│   └── docs-site/                # Public documentation site (Vercel)
│
├── packages/
│   ├── shared-types/             # Wire types + generated DB enums; zero runtime deps
│   ├── api-client/               # Generated typed client (OpenAPI) + fetch wrapper
│   ├── sdk-core/                 # Framework-free browser SDK
│   ├── sdk-react/                # Provider/hooks over sdk-core
│   ├── widget/                   # Embeddable UI bundle (Shadow DOM)
│   ├── ghost-cursor/             # Standalone cursor/guidance engine
│   └── design-system/            # Tokens + primitives (Studio/demo/docs)
│
├── services/
│   ├── ingestion/                # Worker: fetch, parse, chunk, embed, index
│   ├── agent-worker/             # Worker: orchestrate runs, workflows, tool execution
│   ├── evaluation-worker/        # Worker: eval suites, golden sets, reports
│   └── webhook-worker/           # Worker: outbound delivery with retries/DLQ
│
├── infrastructure/
│   ├── docker/                   # Dockerfiles, compose for local deps
│   ├── render/                   # render.yaml, service definitions, health checks
│   ├── vercel/                   # project config, headers, redirects
│   ├── supabase/                 # config.toml, migrations/, seed.sql, buckets
│   └── github-actions/           # reusable workflows/composites
│
├── scripts/                      # Developer/CI scripts (documented, idempotent)
├── docs/                         # This documentation system (85 files)
├── tests/                        # Cross-app: e2e (Playwright), load (k6), security
├── .github/workflows/            # CI entry points (thin; logic in infrastructure/github-actions)
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .editorconfig / .gitignore / .nvmrc / .python-version
└── README.md
```

---

## 4. Directory contracts

### `apps/api`

| | |
|---|---|
| Belongs | HTTP layer, domain services, repositories, policies, DB session management, provider ports, worker entrypoints |
| Does not belong | UI code, prompt text files (they live in DB/config), package build output, migrations authored here (single source in `infrastructure/supabase/migrations`) |
| Public interface | OpenAPI document; event names; service interfaces for workers |
| Depends on | Postgres, Redis, Storage, providers, nothing in `apps/*` |
| Tested by | pytest (unit/integration/RLS), contract tests vs `openapi.json` |
| Built/deployed | Docker image → Render web service (doc 69) |
| Owner | Runtime |

Rules: no module imports another module's `repository.py`; shared utilities live in `core/`, not in a
module; `app/workers/*` must contain only argument parsing + loop, with logic in services.

### `apps/studio`

| | |
|---|---|
| Belongs | Server components, layouts, admin forms, tables, trace viewers, charts |
| Does not belong | Business rules (policy, retrieval, tenancy logic), direct DB access, provider calls |
| Public interface | None (a consumer) |
| Depends on | `api-client`, `shared-types`, `design-system` |
| Tested by | Vitest + Playwright journeys |
| Built/deployed | `next build` → Vercel |
| Owner | Experience |

### `apps/demo`

| | |
|---|---|
| Belongs | A realistic SaaS (dashboard, projects, team, analytics, billing, settings, docs), its own DB tables (demo schema), VISTRA SDK integration, tool endpoints |
| Does not belong | VISTRA platform logic; hardcoded AI answers |
| Public interface | Its tool APIs (called by VISTRA as the "host application") |
| Depends on | `sdk-react`, `widget`, its own DB |
| Tested by | Playwright end-to-end journeys (doc 60) |
| Owner | Experience |

### `apps/docs-site`

Static Next.js site rendering selected `docs/` content; must never become the source of truth for
contracts (it renders them).

### `packages/shared-types`

Wire DTOs, enums, event names, error codes, and generated database enums. **Zero runtime dependencies.**
Every public type used by more than one package lives here, not duplicated.

### `packages/api-client`

Generated from `openapi.json`; wrapped with auth injection, retries for idempotent GETs, problem+json
parsing, cursor pagination helpers. Hand-editing generated files is forbidden; customization lives in
`src/wrapper.ts` and `src/overrides.ts` (documented escape hatch).

### `packages/sdk-core`

| | |
|---|---|
| Belongs | Config validation, session auth, context collectors, transport, SSE parsing, event emitter, public API |
| Does not belong | React, business rules, DOM styling (widget owns UI) |
| Public interface | `createVistra`, `VistraClient`, types, error codes |
| Tested by | Vitest (jsdom/happy-dom), Playwright embedding tests, bundle budget |
| Built | ESM + IIFE, `dist/`, types, size check |

### `packages/ghost-cursor`

Standalone. No dependency on `sdk-core`, Next.js, or the API. Consumes `GuideStep[]` + a resolver adapter.
Owns motion, state machine, overlays, accessibility. Unit tests in jsdom + visual tests in Playwright.

### `packages/widget`

Shadow-DOM UI: launcher, panel, message list, citation cards, approval dialogs, step indicator. Depends on
`ghost-cursor` and `sdk-core` (types + runtime), never on `sdk-react`.

### `services/*`

Each is a deployable process with: `main.py` (loop), `handlers/`, `pyproject.toml`, `Dockerfile`, `tests/`.
They import `apps/api/app/modules/*` services **as a library** in the monorepo, or call the internal API
when isolation is required (the default is library import for latency and transactional clarity; document
any deviation per service).

> Implementation note: to avoid a circular packaging dependency, the shared Python package is published
> internally as `vistra_core` inside `apps/api` and installed as a path dependency by each worker:
> `uv add --editable ../../apps/api`.

### `infrastructure`

Only deployment/ops artifacts. Anything executable that developers run daily belongs in `scripts/`.
`infrastructure/supabase/migrations` is the single source of truth for schema.

### `tests`

Cross-cutting suites that need multiple apps: Playwright e2e, k6 load, security probes, and fixture
generators. Unit tests live next to their code.

---

## 5. Toolchain coordination

| Concern | TypeScript | Python |
|---|---|---|
| Package manager | pnpm 9 (`packageManager` pinned) | `uv` (lockfile committed) |
| Workspace | `pnpm-workspace.yaml` → `apps/*`, `packages/*` | one `pyproject.toml` per deployable + `vistra_core` |
| Lint/format | ESLint (flat config) + Prettier | Ruff (lint + format) |
| Types | `tsc --noEmit` per package, project references | `mypy --strict` |
| Tests | Vitest; Playwright for e2e | pytest, pytest-asyncio, httpx |
| Build | tsup for packages; `next build` for apps | Docker multi-stage; no build step (interpreted) |
| Versioning | Changesets (packages), app versions in git tags | CalVer for internal `vistra_core` |
| Contract | `pnpm openapi:export` → `openapi.json` → `pnpm api:generate` | FastAPI generates `openapi.json` |

**Cross-language rule:** adding a field means (1) change Pydantic model, (2) regenerate `openapi.json`,
(3) regenerate `api-client` + `shared-types`, (4) update Python and TS tests. One PR.

---

## 6. Build and CI mapping

| Path filter | Jobs |
|---|---|
| `apps/api/**`, `services/**` | ruff, mypy, pytest, docker build, migration check |
| `packages/**`, `apps/studio/**`, `apps/demo/**` | eslint, tsc, vitest, bundle budget, next build |
| `docs/**` | docs validator, link check |
| `infrastructure/supabase/migrations/**` | migrate on clean DB + RLS tests + drift check |
| `tests/**` | Playwright (on PR to main), load (nightly) |

Path filtering keeps PR feedback under ~10 minutes. Full matrix in
[72](../12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md).

---

## 7. What must never be added

- `apps/api-v2/`, `packages/sdk-next/`, `services/new-worker/` without an ADR and a doc update.
- A second `utils/` dumping ground. Shared code goes to `core/` (Python) or a named package (TS).
- Generated clients under version control in two places.
- Environment-specific config committed (only `*.example`).
- Migrations authored in two directories.

---

## 8. Naming and ownership summary

| Artifact | Name | Owner area | Deploy target |
|---|---|---|---|
| API | `vistra-api` | Runtime | Render web |
| Workers | `vistra-ingestion`, `vistra-agent-worker`, `vistra-eval`, `vistra-webhooks` | Runtime/Knowledge | Render workers |
| npm packages | `@vistra/sdk`, `@vistra/react`, `@vistra/widget`, `@vistra/ghost-cursor`, `@vistra/api-client`, `@vistra/shared-types`, `@vistra/design-system` | DX/Experience | npm (after authorization) |
| Studio | `vistra-studio` | Experience | Vercel |
| Demo | `acme-workspace` | Experience | Vercel |
| Docs | `vistra-docs` | DX | Vercel |

## 9. Acceptance criteria

- [ ] Every proposed directory has an entry in §4 with belongs/does-not-belong and an owner.
- [ ] Dependency rules are enforceable by lint (import-linter for Python, ESLint boundaries for TS).
- [ ] CI path filters map to every directory in §3.
- [ ] No file in the tree contradicts the module map in [12](12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md).

## 10. Related documents

[09](09-SYSTEM-ARCHITECTURE.md) · [12](12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md) ·
[14](14-TECHNOLOGY-STACK-AND-DEPENDENCIES.md) · [67](../12-deployment-and-release/67-LOCAL-DEVELOPMENT-ENVIRONMENT.md) ·
[72](../12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md)
