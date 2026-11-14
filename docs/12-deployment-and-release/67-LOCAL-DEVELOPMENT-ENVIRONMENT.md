# Local Development Environment

**Doc ID:** 67 · **Status:** Approved · **Area:** Platform
**Depends on:** [11](../02-system-architecture/11-REPOSITORY-AND-MONOREPO-STRUCTURE.md) · **Related:** [68](68-ENVIRONMENT-AND-SECRETS-MANAGEMENT.md), [72](72-CI-CD-AND-GITHUB-ACTIONS.md), [21](../03-database-and-identity/21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md)

---

## 1. Purpose

Let a new engineer (or agent) go from clone to a working end-to-end loop — Studio, demo, API, workers, database,
storage — with deterministic, reproducible steps. Onboarding target: one day to a first PR.

## 2. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node | 22 LTS (`.nvmrc`) | pnpm via corepack |
| pnpm | 9 (`packageManager`) | `corepack enable` |
| Python | 3.12 | `uv` for env/deps |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh | sh` |
| Docker | 24+ | for Redis (and optionally Postgres) |
| Supabase CLI | latest | `supabase start` for DB/Storage |
| Git | 2.40+ | |

Optional: `clerk` CLI for webhook tunneling; `k6` for load tests; Playwright browsers.

## 3. Bootstrap

```bash
git clone <repo> vistra && cd vistra
cp .env.example .env.local             # fill required values (see §5)
pnpm install
uv sync --directory apps/api
uv sync --directory services/ingestion
uv sync --directory services/agent-worker
supabase start                          # Postgres + Storage + Studio
pnpm db:migrate                         # applies infrastructure/supabase/migrations
pnpm db:seed                            # reference data + demo tenant (no secrets)
pnpm dev                                # api + studio + demo + workers (concurrently)
```

Ports:

| Service | Port |
|---|---|
| API | 8000 |
| Studio | 3000 |
| Demo | 3001 |
| Docs site | 3002 |
| Supabase API/DB | 54321 / 54322 |
| Redis | 6379 |

## 4. What `pnpm dev` starts

| Process | Command |
|---|---|
| API | `uv run --directory apps/api uvicorn app.main:app --reload --port 8000` |
| Studio | `pnpm --filter @vistra/studio dev` |
| Demo | `pnpm --filter acme-workspace dev` |
| Ingestion worker | `uv run --directory services/ingestion python -m app.workers.ingestion` |
| Agent worker | `uv run --directory services/agent-worker python -m app.workers.agent` |
| Redis | `docker compose -f infrastructure/docker/compose.dev.yml up redis` |

Workers default to a 2 s poll interval locally; no Redis is required for correctness (DB polling), but it is
recommended for realistic behavior.

## 5. Environment

`.env.example` is the canonical list with placeholders (doc 68). Minimum for the end-to-end loop:

```env
APP_ENV=development
API_URL=http://localhost:8000
SUPABASE_URL=http://localhost:54321
SUPABASE_PUBLISHABLE_KEY=<printed by supabase start>
SUPABASE_SECRET_KEY=<printed by supabase start>
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:54322/postgres
REDIS_URL=redis://localhost:6379
CLERK_ISSUER=https://<dev-instance>.clerk.accounts.dev
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
GEMINI_API_KEY=            # optional; without it, provider tests use fakes
NVIDIA_API_KEY=            # optional
```

Without provider keys, the API boots in `AI_PROVIDER_MODE=fake` for local development (explicitly set, never a
silent production default). Fake responses come from fixtures and are labeled in logs.

## 6. Database workflow

```bash
pnpm db:new -- name=add_table     # creates the next numbered migration
pnpm db:migrate                   # apply to local
pnpm db:reset                     # drop, migrate, seed
pnpm db:types                     # regenerate TS types
uv run --directory apps/api python scripts/verify_schema.py   # drift check vs doc 16
```

Rules: never edit an applied migration; every migration includes its RLS and indexes; reset is safe and fast
(< 60 s).

## 7. Storage locally

`supabase start` provides S3-compatible storage. Buckets are created by `infrastructure/supabase/seed.sql`.
Uploads land under the local org prefix; signed URLs work against `http://localhost:54321`.

## 8. Auth locally

- Use a Clerk **development instance**.
- Webhooks: `clerk dev` tunnel or `ngrok http 8000`, then set the endpoint in Clerk.
- Without webhooks, run `pnpm seed:identity` to project a test user/org directly (dev only, refuses in
  production).

## 9. Tests locally

```bash
pnpm -r test                     # ts unit
uv run --directory apps/api pytest -q
uv run --directory apps/api pytest tests/rls -q
pnpm test:e2e                    # playwright against local stack
python docs/tools/validate-docs.py
```

Playwright starts the stack via `webServer` config; it uses the seeded demo tenant.

## 10. Common problems

| Symptom | Cause | Fix |
|---|---|---|
| `IDENTITY_NOT_READY` | webhook not processed | run `pnpm seed:identity` or configure tunnel |
| `ORIGIN_NOT_ALLOWED` | app domain missing | add `http://localhost:3001` in Studio |
| Migrations fail on enum change | non-transactional `ALTER TYPE` | isolate in its own file |
| Worker claims nothing | Redis down and poll disabled | check `WORKER_POLL_INTERVAL` |
| Storage 403 | wrong key mode (test vs local) | re-read `supabase start` output |
| Port in use | stale process | `pnpm kill:ports` |

## 11. Repository hygiene

- `.env.local` is gitignored; `.env.example` is committed with placeholders only.
- No generated files committed (`dist/`, `.next/`, `openapi.json` is committed intentionally).
- Hooks: pre-commit runs lint-staged + ruff; pre-push runs affected tests.
- `pnpm doctor` validates tool versions, env presence, DB reachability, and seeded data.

## 12. Acceptance criteria

- [ ] A fresh clone reaches a working chat in ≤ 10 commands.
- [ ] `pnpm doctor` diagnoses missing prerequisites with actionable messages.
- [ ] No local step requires production credentials.
- [ ] Reset is deterministic and idempotent.
- [ ] Docs validator runs locally without extra installs.

## 13. Related documents

[11](../02-system-architecture/11-REPOSITORY-AND-MONOREPO-STRUCTURE.md) · [21](../03-database-and-identity/21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md) ·
[68](68-ENVIRONMENT-AND-SECRETS-MANAGEMENT.md) · [72](72-CI-CD-AND-GITHUB-ACTIONS.md) ·
[69](69-RENDER-BACKEND-DEPLOYMENT.md)

## 14. References

- Supabase local development — https://supabase.com/docs/guides/local-development
- uv — https://docs.astral.sh/uv/
- pnpm — https://pnpm.io/
- Playwright — https://playwright.dev/docs/test-configuration
