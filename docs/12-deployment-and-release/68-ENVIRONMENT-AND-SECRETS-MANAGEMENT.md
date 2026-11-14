# Environment and Secrets Management

**Doc ID:** 68 · **Status:** Approved (normative) · **Area:** Platform / Security
**Depends on:** [22](../04-backend-and-api/22-BACKEND-ARCHITECTURE.md) · **Related:** [17](../03-database-and-identity/17-CLERK-AUTHENTICATION.md), [63](../11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md), [69](69-RENDER-BACKEND-DEPLOYMENT.md)

---

## 1. Purpose

Define every environment, every variable, where each secret lives, who can read it, and how it is rotated. Most
production incidents in platforms like this start with a mis-scoped secret or a missing variable discovered at
runtime.

## 2. Environments

| Env | Purpose | Provider config | Data |
|---|---|---|---|
| `development` | Local machine | `.env.local` | Local Supabase, seeds |
| `test` | CI | CI secrets (fake providers) | Ephemeral |
| `staging` | Release validation | Staging projects, real providers (capped) | Seeded, isolated |
| `production` | Customers | Production projects | Real |

Rules: no sharing of databases, storage buckets, Clerk instances, or provider keys across environments. Staging
is never a copy of production data.

## 3. Variable catalogue

### 3.1 Application

```env
APP_ENV=development|test|staging|production
APP_URL=https://studio.vistra.dev
API_URL=https://api.vistra.dev
API_VERSION=v1
LOG_LEVEL=INFO
```

### 3.2 Clerk (server)

```env
CLERK_SECRET_KEY=            # server only
CLERK_ISSUER=https://<instance>.clerk.accounts.dev
CLERK_JWKS_URL=https://<instance>.clerk.accounts.dev/.well-known/jwks.json
CLERK_WEBHOOK_SIGNING_SECRET=
CLERK_AUTHORIZED_PARTIES=https://studio.vistra.dev,https://vistra.dev
```

### 3.3 Clerk (browser — public)

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/overview
NEXT_PUBLIC_VISTRA_API_URL=https://api.vistra.dev   # browser calls this origin
NEXT_PUBLIC_VISTRA_APP_ID=app_01H...                # demo app only (public application id)
NEXT_PUBLIC_APP_ORIGIN=https://studio.vistra.dev    # this deployment's own origin
```

These are compiled into the client bundle and are public by definition. Anything that must stay secret uses the
server-only names in §3.2/§3.4; a `NEXT_PUBLIC_` prefix on a secret is a defect, and `docs`/CI scan for it.

### 3.4 Supabase

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # browser-safe, RLS enforced
SUPABASE_SECRET_KEY=sb_secret_...             # server only, bypasses RLS
SUPABASE_DB_URL=postgresql://...              # pooled connection string
```

Legacy `anon`/`service_role` keys are not used (deprecated; doc 17 §7).

### 3.5 Providers

```env
AI_PRIMARY_PROVIDER=gemini
AI_FALLBACK_PROVIDER=nvidia
AI_PROVIDER_MODE=live|fake
GEMINI_API_KEY=
GEMINI_MODEL_DEFAULT=
GEMINI_MODEL_FAST=
GEMINI_MODEL_REASONING=
GEMINI_MODEL_VISION=
GEMINI_MODEL_EMBEDDING=
GEMINI_EMBEDDING_DIM=768
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL_DEFAULT=
NVIDIA_MODEL_REASONING=
```

### 3.6 Infrastructure

```env
REDIS_URL=
STORAGE_PROVIDER=supabase
S3_ENDPOINT=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=
ENCRYPTION_KEY=                 # AES-256-GCM key for credential ciphertexts (base64)
ENCRYPTION_KEY_VERSION=1
OTEL_EXPORTER_OTLP_ENDPOINT=
SENTRY_DSN=
WEB_CONCURRENCY=2
```

### 3.7 Session/SDK

```env
SESSION_TOKEN_SECRET=           # signs SDK session tokens (separate from Clerk)
SESSION_TOKEN_TTL_SECONDS=900
RATE_LIMIT_ENABLED=true
```

## 4. Classification

| Class | Examples | Handling |
|---|---|---|
| Public | `NEXT_PUBLIC_*` publishable keys, API URL | May ship in bundles |
| Secret | Clerk secret, Supabase secret, provider keys, encryption key, webhook secret | Secret store only; never in git, logs, or responses |
| Restricted | `SUPABASE_DB_URL`, `ENCRYPTION_KEY` | Break-glass access, audit on read |

`NEXT_PUBLIC_` is the only prefix allowed to reach the browser. A CI check fails if any secret-class variable name
appears in a `NEXT_PUBLIC_` variable or in `apps/*/public/`.

## 5. Storage of secrets

| Environment | Where |
|---|---|
| Local | `.env.local` (gitignored) |
| CI | GitHub Actions secrets (environment-scoped) |
| Render | Environment group / secret env vars per service |
| Vercel | Project env vars per environment (encrypted) |
| Supabase | Project settings / vault for DB credentials |

Rules:
- One secret per purpose; no reuse across environments.
- `.env.example` has names + placeholders, never values.
- Secrets are injected at deploy time, not baked into images.
- Local `.env` files are excluded from Docker build contexts (`.dockerignore`).

## 6. Rotation

| Secret | Cadence | Procedure |
|---|---|---|
| API keys (VISTRA tenant keys) | customer-driven | create new → overlap → revoke |
| `SUPABASE_SECRET_KEY` | 180 d or on suspicion | create new, deploy, revoke old, verify |
| `CLERK_SECRET_KEY` | 180 d | rotate in Clerk, update store, redeploy |
| Provider keys | 90 d or on suspicion | new key, staged rollout, revoke |
| `ENCRYPTION_KEY` | yearly | add `ENCRYPTION_KEY_VERSION=2`, dual-read, re-encrypt job, retire v1 |
| Webhook signing secrets | 180 d | dual-secret window (24 h) |
| `SESSION_TOKEN_SECRET` | 90 d | dual-key verify for one TTL window |

Rotation is a documented runbook step with verification (doc 74), never an ad-hoc console change.

## 7. Boot validation

`Settings` fails fast on:
- missing required variables for the selected mode,
- malformed URLs/keys,
- `AI_PROVIDER_MODE=fake` with `APP_ENV=production` (hard failure),
- `NEXT_PUBLIC_` secret leakage (build-time check),
- `SUPABASE_SECRET_KEY` used in a browser bundle (build scan).

## 8. Access control

| Role | Can read |
|---|---|
| Engineer (dev) | development secrets |
| Engineer (on-call) | staging + production (break-glass, audited) |
| CI | environment-scoped secrets for its workflow only |
| Service | its own env vars only |

No secret is displayed in Studio, logs, error messages, or traces. Support cannot retrieve tenant credentials.

## 9. Leak response

1. Revoke the secret at the provider.
2. Rotate and redeploy.
3. Search logs/artifacts for use during the exposure window.
4. If a tenant credential leaked: notify the tenant, rotate their credential, audit access.
5. Add a regression control (scanner rule, test) and record the incident.

## 10. Acceptance criteria

- [ ] `.env.example` matches the variables the code reads (checked by a test that fails on unknown/missing names).
- [ ] No secret is reachable from a browser bundle (scan).
- [ ] Production boot fails on `fake` provider mode or missing required secrets.
- [ ] Every secret has an owner and a rotation cadence.
- [ ] Secrets are absent from git history (scanner in CI).

## 11. Related documents

[17](../03-database-and-identity/17-CLERK-AUTHENTICATION.md) · [22](../04-backend-and-api/22-BACKEND-ARCHITECTURE.md) ·
[63](../11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md) · [69](69-RENDER-BACKEND-DEPLOYMENT.md) ·
[70](70-VERCEL-FRONTEND-DEPLOYMENT.md) · [74](74-PRODUCTION-RELEASE-AND-ROLLBACK.md)

## 12. References

- Supabase API keys — https://supabase.com/docs/guides/getting-started/api-keys
- Clerk production deployment — https://clerk.com/docs/deployments/overview
- Render environment variables — https://render.com/docs/configure-environment-variables
- Vercel environment variables — https://vercel.com/docs/projects/environment-variables
