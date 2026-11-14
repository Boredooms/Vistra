# Clerk Authentication

**Doc ID:** 17 · **Status:** Approved · **Area:** Identity
**Depends on:** [16](16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md) · **Related:** [18](18-TENANCY-RBAC-AND-AUTHORIZATION.md), [19](19-SUPABASE-RLS-AND-DATABASE-SECURITY.md), [54](../09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md)

---

## 1. Purpose

Specify how Clerk provides identity for VISTRA: frontend integration, backend token verification, session
lifecycle, organization context, webhook synchronization, and the Supabase third-party auth integration
that makes RLS work. This document removes any ambiguity about who is the identity authority.

## 2. Scope

Human users (developers/admins) and their organizations. **Not** in scope: end users of embedded
applications (they use VISTRA SDK session tokens, doc 54) and machine-to-machine API keys (doc 18 §7).

## 3. Decision summary

| Concern | Owner |
|---|---|
| Sign-up, sign-in, MFA, social, passwordless | Clerk |
| Session cookie + short-lived JWT | Clerk |
| User/org/membership source of truth | Clerk (projected to Postgres for joins/audit) |
| Role semantics inside VISTRA | VISTRA `organization_members.role` (mapped from Clerk role) |
| Token verification for the API | VISTRA `core/auth` against Clerk JWKS |
| Database authorization | Postgres RLS using claims from the Clerk session token |
| Supabase Auth | **Not used as an identity authority** (ADR-001) |

## 4. Frontend integration (Studio, demo, docs-site)

- `@clerk/nextjs` with `ClerkProvider` in the root layout; middleware protects authenticated routes.
- Sign-in/up use Clerk's hosted components (`<SignIn/>`, `<SignUp/>`, `<OrganizationSwitcher/>`).
- Tokens are obtained per request:

```ts
// server component / route handler
import { auth } from "@clerk/nextjs/server";
const { getToken, orgId, userId } = await auth();
const token = await getToken();            // short-lived session JWT
```

```ts
// client component
import { useAuth } from "@clerk/nextjs";
const { getToken, orgId } = useAuth();
const token = await getToken();
```

- The organization switcher changes the active org; the client sends `X-Organization-Id: org_…` on API
  calls where the token's `org_id` claim may be stale (the server always re-verifies membership).
- Never read `CLERK_SECRET_KEY` on the client. Only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is public.

### Required environment variables

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...            # server only
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...  # server only
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/overview
```

## 5. Backend verification

### 5.1 Module layout

```
app/core/auth/
  clerk_verifier.py    # JWKS fetch + JWT verification via clerk-backend-api/JWKS
  jwt_validation.py    # claim checks (iss, exp, nbf, azp, org)
  identity_resolver.py # token → AppUser (projection lookup)
  auth_dependencies.py # FastAPI dependencies: require_user, require_org, require_role
  token_context.py     # request-scoped context object
  auth_errors.py       # typed 401/403 errors
```

### 5.2 Verification algorithm

1. Extract `Authorization: Bearer <jwt>`; missing → `401 AUTH_MISSING`.
2. Resolve signing key by `kid` from JWKS (`https://<clerk-domain>/.well-known/jwks.json`), cached with a
   TTL (default 300 s) and refreshed on unknown `kid`.
3. Verify signature (RS256), `iss == CLERK_ISSUER`, `exp > now - leeway(30s)`, `nbf <= now + leeway`,
   `azp` in the allowed origins list.
4. Load the projection row by `sub`. Missing → `409 IDENTITY_NOT_READY` (webhook lag) with `Retry-After: 2`,
   or project-on-read from verified claims when `AUTH_PROJECT_ON_READ=true` (development only).
5. Resolve memberships; if `X-Organization-Id` is present, verify an active membership for it; else use the
   token's `org_id` if present, else the most recently active membership.
6. Build `TenantContext { user, organization, role, scopes, request_id }`.

**Failure taxonomy**

| Condition | Status | Code |
|---|---|---|
| Missing header | 401 | `AUTH_MISSING` |
| Malformed token | 401 | `AUTH_INVALID_TOKEN` |
| Bad signature / unknown kid after refresh | 401 | `AUTH_INVALID_SIGNATURE` |
| Expired | 401 | `AUTH_TOKEN_EXPIRED` |
| Wrong issuer / azp | 401 | `AUTH_INVALID_ISSUER` |
| Projection missing | 409 | `IDENTITY_NOT_READY` |
| JWKS unavailable and cache empty | 503 | `AUTH_UNAVAILABLE` |
| No membership in requested org | 404 | `NOT_FOUND` (+ security audit) |
| Insufficient role | 403 | `INSUFFICIENT_ROLE` |

### 5.3 Do not

- Do not decode without verification (`jwt.decode(..., options={"verify_signature": False})`).
- Do not trust `org_id`, `role`, or `sub` from the body or query string.
- Do not cache the *decision* longer than the token lifetime; cache JWKS, not authorization.

## 6. Identity projection and webhooks

Clerk is authoritative; Postgres holds a projection for joins, auditing, and referential integrity.

### 6.1 Handled events

| Clerk event | Effect |
|---|---|
| `user.created` | upsert `users` |
| `user.updated` | update profile fields |
| `user.deleted` | soft delete user; deactivate memberships |
| `organization.created` | upsert `organizations` (id = Clerk org id) |
| `organization.updated` | update name/slug/image |
| `organization.deleted` | soft delete org + schedule tenant purge |
| `organizationMembership.created` | insert member (role mapping) |
| `organizationMembership.updated` | update role/status |
| `organizationMembership.deleted` | set status `suspended` / remove membership |

### 6.2 Processing rules

1. Verify the webhook signature with `CLERK_WEBHOOK_SIGNING_SECRET` (Svix scheme) and a 5-minute timestamp
   tolerance; reject otherwise.
2. Insert into `webhook_events` keyed by the provider event id; duplicate → return 200 immediately.
3. Process in a transaction; mark `processed` or `failed` (with attempts) for retry.
4. Recompute state rather than applying deltas: for membership events, fetch/derive the current membership
   shape so out-of-order delivery converges.
5. Respond 2xx quickly; heavy work (e.g. tenant purge) is enqueued to a worker.
6. Expose an idempotent replay endpoint for support (`POST /v1/internal/webhooks/{event_id}/replay`), admin-only.

### 6.3 Role mapping

| Clerk role | VISTRA role |
|---|---|
| `org:admin` | `admin` |
| `org:member` | `developer` |
| custom `org:owner` | `owner` |
| custom `org:viewer`, `org:analyst` | `viewer`, `analyst` |

Unknown roles map to `viewer` (least privilege) and emit a warning metric.

## 7. Supabase third-party auth integration

This is what makes RLS work with Clerk tokens.

**Setup (one-time, per project):**

1. In Clerk, activate the Supabase integration so session tokens are compatible; copy the Clerk domain.
2. In Supabase Dashboard → Authentication → Sign In / Providers → Add provider → **Clerk**; paste the Clerk
   domain.
3. For local development, add to `supabase/config.toml`:

```toml
[auth.third_party.clerk]
enabled = true
domain = "your-app.clerk.accounts.dev"
```

4. The browser creates the Supabase client with Clerk's token (only needed for direct-from-browser Supabase
   reads; the preferred path is the VISTRA API):

```ts
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  accessToken: async () => (await session?.getToken()) ?? null,
});
```

5. RLS policies read claims via `auth.jwt()`:

```sql
create policy applications_select on applications for select to authenticated
using (organization_id = (auth.jwt() ->> 'org_id') and is_org_member(organization_id));
```

**Explicitly rejected:** the legacy shared JWT secret / JWT-template integration (deprecated), and issuing
Supabase JWTs ourselves. Keys are the new publishable (`sb_publishable_…`) and secret (`sb_secret_…`) keys;
legacy `anon`/`service_role` keys are not used in new code.

## 8. Session lifecycle

| Event | Behavior |
|---|---|
| Sign-in | Clerk creates session; frontend obtains JWT on demand |
| Token refresh | `getToken()` returns a fresh JWT; SDK API client retries once on 401 `AUTH_TOKEN_EXPIRED` |
| Org switch | New token with new `org_id`; client must refetch tenant-scoped queries |
| Membership removed | Webhook updates projection; next API call fails 403/404; UI shows access revoked |
| User deactivated | Tokens rejected after projection update (`users.deleted_at` set) |
| Sign-out | Clerk clears session; client clears caches |
| Revocation | Clerk dashboard "revoke sessions" → tokens invalid at next `exp` (short TTL) |

VISTRA does not maintain its own refresh tokens for human users.

## 9. Local development

```bash
# .env.local (apps/studio, apps/demo)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_ISSUER=https://your-instance.clerk.accounts.dev
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
```

- Use a Clerk **development instance**; never a production instance for local work.
- Webhooks locally: `clerk dev` tunnel or `ngrok`; alternatively replay captured payloads via the internal
  endpoint with a test signature.
- Tests use pre-generated test tokens signed by a test JWKS fixture (`tests/fixtures/clerk/`), never real
  Clerk calls. The verifier accepts an injected JWKS client in tests.

## 10. Security considerations

- Tokens are bearer credentials: never log them, never put them in URLs, never store in `localStorage`
  (Clerk's cookie strategy handles browser persistence).
- Verify `azp` so tokens minted for another application cannot be replayed at the API.
- Enforce short JWKS cache TTL and handle key rotation.
- Membership checks are per request (cheap indexed lookup), not cached for the session.
- Emit `audit_events` for role changes, membership changes, and org deletion.
- Rate limit auth failures per IP and per user to blunt token-guessing.

## 11. Failure scenarios

| Scenario | Behavior |
|---|---|
| Clerk outage, JWKS cached | Existing tokens verified until cache expiry; no new sign-ins |
| Clerk outage, cache cold | 503 `AUTH_UNAVAILABLE`; no fallback to unverified decoding |
| Webhook delay after signup | 409 `IDENTITY_NOT_READY` with retry; UI shows "setting up your workspace" |
| Duplicate webhook | Idempotent no-op, 200 |
| Out-of-order membership events | State recomputed from Clerk payload; converges |
| Token from a different Clerk instance | 401 `AUTH_INVALID_ISSUER` |
| Deleted user with valid token | 403 `ACCOUNT_DISABLED` after projection update |

## 12. Testing strategy

| Test | Assertion |
|---|---|
| Valid token → protected route | 200 + correct org context |
| Expired / tampered / wrong-iss / wrong-azp tokens | 401 with specific codes |
| Missing projection | 409 then success after projection |
| Org header without membership | 404 + audit row |
| Role matrix | each role × each endpoint → expected status |
| Webhook signature invalid | 401/400, no DB write |
| Webhook duplicate/out-of-order | single convergent row |
| RLS with Clerk JWT | `auth.jwt()` claims drive policies; cross-tenant select returns 0 rows |
| Token refresh | client retries once and succeeds |

## 13. Acceptance criteria

- [ ] No route executes business logic before verification succeeds.
- [ ] JWKS caching and rotation are unit-tested with a rotating fixture.
- [ ] Webhook processing is idempotent and converges under reordering.
- [ ] Supabase policies reference `auth.jwt()` (not a custom table lookup for identity).
- [ ] Local development instructions produce a working sign-in in a fresh clone.

## 14. Implementation checklist

1. Create Clerk application + dev instance; enable Organizations.
2. Configure Supabase third-party auth (Clerk provider) and local `config.toml`.
3. Implement `clerk_verifier` + JWKS cache + claim validation; add tests with fixtures.
4. Implement projection + webhook endpoint with signature verification and `webhook_events` dedupe.
5. Add `require_user`/`require_org`/`require_role` dependencies and apply to every router.
6. Wire Studio `ClerkProvider` + middleware; verify org switch behavior.
7. Add audit events for membership/role changes.
8. Run the security test suite (doc 63) and the RLS suite (doc 19).

## 15. Related documents

[18](18-TENANCY-RBAC-AND-AUTHORIZATION.md) · [19](19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) ·
[54](../09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) ·
[68](../12-deployment-and-release/68-ENVIRONMENT-AND-SECRETS-MANAGEMENT.md) ·
[63](../11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md)

## 16. References

- Clerk Supabase integration — https://clerk.com/docs/guides/development/integrations/databases/supabase
- Supabase Clerk third-party auth — https://supabase.com/docs/guides/auth/third-party/clerk
- Clerk backend requests/token verification — https://clerk.com/docs/backend-requests/overview
- Clerk webhooks — https://clerk.com/docs/webhooks/overview
- Supabase RLS — https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase API keys — https://supabase.com/docs/guides/getting-started/api-keys
