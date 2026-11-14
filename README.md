# VISTRA

An embeddable agent for SaaS products: cited answers from your own documents, a visible Ghost Cursor that guides
users over real controls, and actions that are policy-checked, approved and independently verified.

The specification lives in [`docs/`](docs/README.md). Current, evidence-backed status is in
[`docs/IMPLEMENTATION-STATUS.md`](docs/IMPLEMENTATION-STATUS.md).

## Repository

| Path | What it is |
|---|---|
| `apps/api` | FastAPI + LangGraph agent runtime (Python 3.12, uv) |
| `apps/web` | Website (landing, features, packages, security, docs) + Clerk-authenticated dashboard (Next.js 15) |
| `apps/demo` | "Acme Workspace", a stand-in customer app with signed tool endpoints |
| `packages/sdk-core` | `@boredooms/vistra-sdk` browser SDK |
| `packages/ghost-cursor` | `@boredooms/vistra-ghost-cursor` standalone guide cursor |
| `supabase/migrations` | Ordered SQL migrations (RLS enabled and forced on every tenant table) |
| `scripts/` | migrate, seed, checks, stress test |
| `tests/e2e` | Playwright journeys (demo beats, dashboard flow) |

## Architecture in one paragraph

Each message is a LangGraph run (`apps/api/app/agent/graph.py`): plan, then answer / explain / guide, or propose an action,
then approval (a durable `interrupt()` checkpointed to Postgres), execute, and verify. Models are LangChain chat models
(Gemini primary, NVIDIA NIM fallback) behind one router that owns retries, the circuit breaker, capability gating and
`model_usage` recording. Retrieval is pgvector + Postgres full text fused with RRF, scoped by tenant inside SQL.
Redis (Upstash) carries the ingestion queue, rate limits and locks. Clerk issues dashboard identity; the browser SDK
only ever holds 15 minute session tokens minted from your server with an API key. Agents are configurable and
versioned per application from the dashboard (ADR-031).

## Run locally

Requirements: Python 3.12 + uv, Node 20.9+, pnpm 10. Secrets go in `.env` at the repo root (see `.env.example`;
never commit it).

```bash
pnpm install
cd apps/api && uv sync
uv run python ../../scripts/migrate.py          # migrations + LangGraph checkpoint tables
uv run python ../../scripts/seed.py             # demo org/app/keys + Acme docs
uv run python ../../scripts/seed_web.py         # the website's own assistant
uv run python run_dev.py                        # API on :8000 (selector loop on Windows for psycopg)
```

```bash
pnpm --filter @vistra/web dev                   # website + dashboard on :3000
pnpm --filter @vistra/demo dev                  # Acme demo on :3001
```

`apps/web/.env.local` needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_VISTRA_API_URL`,
`NEXT_PUBLIC_VISTRA_APP_ID`, `VISTRA_API_URL` and the website's server-only `VISTRA_API_KEY`.

## Verify

```bash
cd apps/api
uv run ruff check app tests
uv run pytest tests/test_unit.py                # fast unit suite
uv run pytest tests/test_integration.py         # real DB; slow over a remote pooler
uv run python ../../scripts/rls_check.py        # RLS enabled+forced everywhere, private schemas closed
uv run python ../../scripts/check_backend.py    # Clerk user -> app, key, ingestion via worker, search, origins
uv run python ../../scripts/check_agents.py     # agent versions change real run behaviour, rollback
uv run python ../../scripts/durable_approval.py propose "Create a project called X"   # restart API, then:
uv run python ../../scripts/durable_approval.py approve
uv run python ../../scripts/stress.py --messages 12 --concurrency 6
cd ../.. && node tests/e2e/dashboard-flow.mjs   # browser: site pages + Clerk sign-in + every dashboard page
pnpm -r typecheck && pnpm --filter @boredooms/vistra-ghost-cursor test
python docs/tools/validate-docs.py
```

## Publish the SDK packages

The `vistra` npm org is owned by the publishing account. npm requires browser 2FA approval for each publish:

```bash
pnpm --filter @boredooms/vistra-ghost-cursor build && pnpm --filter @boredooms/vistra-sdk build
cd packages/ghost-cursor && pnpm publish --access public --no-git-checks   # approve in the browser
cd ../sdk-core && pnpm publish --access public --no-git-checks
```

Set `NEXT_PUBLIC_NPM_PUBLISHED=1` on the website afterwards so the Packages page links to npm.

## Deploy

API: Render, Docker (`apps/api/Dockerfile`, blueprint `render.yaml`), migrations as a release step, health check
`/readyz`. Website and demo: Vercel projects rooted at `apps/web` and `apps/demo`. After deploying, add the Vercel
origins to `CORS_ALLOWED_ORIGINS` and to each application's allowed origins, and rotate every credential that was
ever shared outside a secret manager.
