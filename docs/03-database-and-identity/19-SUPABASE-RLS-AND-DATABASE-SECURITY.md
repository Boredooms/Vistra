# Supabase RLS and Database Security

**Doc ID:** 19 · **Status:** Approved (normative) · **Area:** Data / Security
**Depends on:** [16](16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md), [17](17-CLERK-AUTHENTICATION.md) · **Related:** [18](18-TENANCY-RBAC-AND-AUTHORIZATION.md), [63](../11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md)

---

## 1. Purpose

Specify row-level security so that tenant isolation is enforced by PostgreSQL, not only by application code,
and enumerate every privileged (service-role) path with its justification.

## 2. Model

- **Identity claim:** Clerk session token, available to Postgres as `auth.jwt()`.
- **Tenant predicate:** `organization_id = (auth.jwt() ->> 'org_id')`.
- **Membership predicate:** `is_org_member(organization_id)` — `security definer`, stable, indexed.
- **Roles:** `auth.jwt() ->> 'org_role'` (e.g. `org:admin`) mapped to VISTRA roles by a helper.
- **Default:** deny. A table with RLS enabled and no matching policy returns zero rows / rejects writes.
- **Forced:** `alter table … force row level security` so the table owner is also subject to policies.

Two access paths:

| Path | Connection | RLS | Use |
|---|---|---|---|
| User-scoped | Postgres role `authenticated` with JWT claims set | Enforced | Requests acting for a human |
| Privileged | `service_role` (via secret key) | Bypassed | Workers, webhooks, migrations, cross-org jobs |

**Every privileged query must include `where organization_id = :resolved_org`** — RLS is bypassed, so this is
the only isolation. It is enforced by a repository base class that refuses to build a query on a tenant table
without an org predicate (runtime assertion in development, static check in review).

## 3. Setting the request context

For the user path, the connection must expose claims. With Supabase's PostgREST this is automatic when the
request carries the Clerk token. For direct asyncpg/SQLAlchemy connections, set transaction-local GUCs:

```sql
select set_config('request.jwt.claims', :claims_json, true);
-- then all auth.jwt() calls resolve for this transaction
```

The `core/db` session factory provides `session_for_user(claims)` and `session_privileged()`; routers must use
the former when acting for a user, and services must justify the latter (enumerated below).

## 4. Policy pattern per table class

### 4.1 Standard tenant table (e.g. `applications`)

```sql
alter table applications enable row level security;
alter table applications force row level security;

create policy applications_select on applications for select to authenticated
  using (organization_id = (auth.jwt() ->> 'org_id') and is_org_member(organization_id));

create policy applications_insert on applications for insert to authenticated
  with check (organization_id = (auth.jwt() ->> 'org_id')
              and is_org_member(organization_id)
              and has_org_role(organization_id, array['owner','admin','developer']));

create policy applications_update on applications for update to authenticated
  using (organization_id = (auth.jwt() ->> 'org_id')
         and has_org_role(organization_id, array['owner','admin','developer']))
  with check (organization_id = (auth.jwt() ->> 'org_id'));

create policy applications_delete on applications for delete to authenticated
  using (organization_id = (auth.jwt() ->> 'org_id')
         and has_org_role(organization_id, array['owner','admin']));
```

Helper:

```sql
create function has_org_role(org text, roles text[]) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org
      and m.user_id = auth.jwt() ->> 'sub'
      and m.status = 'active'
      and m.role = any(roles)
  );
$$;
```

### 4.2 Child tables (denormalized tenancy)

Every child (`sessions`, `session_messages`, `document_chunks`, `agent_runs`, …) carries `organization_id` so
policies remain index-friendly and do not require joins:

```sql
create policy session_messages_select on session_messages for select to authenticated
  using (organization_id = (auth.jwt() ->> 'org_id') and is_org_member(organization_id));
```

Writes are normally performed by the API's privileged path, so child tables typically have **select-only**
policies for `authenticated`, plus insert policies where the browser writes directly (none in v1).

### 4.3 Append-only tables (`audit_events`, `usage_records`, `policy_decisions`)

```sql
create policy audit_select on audit_events for select to authenticated
  using (organization_id = (auth.jwt() ->> 'org_id')
         and has_org_role(organization_id, array['owner','admin','analyst']));
-- no insert/update/delete policies for authenticated:
-- writes are service-only; updates/deletes are revoked at the grant level.
revoke update, delete on audit_events from authenticated;
```

### 4.4 Knowledge ACL filtering (retrieval)

Collection ACLs are applied **in the retrieval function**, not only by RLS, because retrieval uses the
privileged path inside workers:

```sql
create policy chunks_select on document_chunks for select to authenticated
  using (
    organization_id = (auth.jwt() ->> 'org_id')
    and exists (
      select 1 from knowledge_collections c
      where c.id = document_chunks.collection_id
        and (c.access_scope = 'organization'
             or c.acl -> 'roles' ? (auth.jwt() ->> 'org_role'))
    )
  );
```

Workers/reterrieval code must apply the identical predicate as a parameter (`allowed_collections`) computed
from the actor context.

### 4.5 Global tables

`users`, `organizations`, `webhook_events` have no `organization_id`:

- `organizations`: select where `id = (auth.jwt() ->> 'org_id')`; update where `has_org_role(id, ['owner','admin'])`.
- `users`: select self (`id = sub`) or co-members via `organization_members`; update self only.
- `webhook_events`: no `authenticated` access (service only).

## 5. Privileged paths (complete enumeration)

Every use of the service role must appear here. Adding a path requires review.

| # | Path | Why privileged | Isolation control |
|---|---|---|---|
| 1 | Clerk webhook projection | No user context yet | Writes only ids present in the verified payload |
| 2 | Ingestion workers | Long-running, no user session | Job row carries `organization_id`; all writes scoped to it |
| 3 | Retrieval inside agent worker | No user session at execution time | `allowed_collections` + `organization_id` parameters required |
| 4 | Agent run/step persistence | System writes | Run row carries org; repository asserts predicate |
| 5 | Outbound webhook delivery | Reads deliveries across tenants | Scoped per delivery row |
| 6 | Usage rollups / retention jobs | Cross-tenant maintenance | Explicitly cross-tenant by design; no user data returned |
| 7 | SDK session minting | Authenticates an application, not a user | App → org resolved from the key hash |
| 8 | Signed URL generation for storage | Storage API requires server credentials | Object key resolved from `files` row of the resolved org |
| 9 | Migrations | DDL | Run by CI/release with a dedicated role; audited |
| 10 | Admin support tooling (read-only) | Cross-tenant diagnostics | Break-glass, requires explicit grant, fully audited, time-boxed |

## 6. Grants

```sql
-- authenticated users get DML on user-facing tables only via policies
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- never grant to anon (there is no anonymous data path)
revoke all on all tables in schema public from anon;

-- sensitive columns are not readable even if the row is
revoke select (key_hash) on api_keys from authenticated;
revoke select (ciphertext, key_version) on tool_credentials from authenticated;
revoke select (secret_ciphertext) on webhook_endpoints from authenticated;
```

Column-level revokes are defense in depth; the API also never serializes those fields.

## 7. Performance

- Every policy predicate must be index-supported: `organization_id` is the leading column of every index.
- `is_org_member` / `has_org_role` are `security definer` + `stable`, so they are evaluated once per query
  when wrapped in a subquery; prefer `(select is_org_member(organization_id))` to force init-plan caching.
- Measure with `EXPLAIN (ANALYZE, BUFFERS)` on seeded 1M-row tables; target ≤ 15% overhead vs no RLS.
- Avoid correlated subqueries in policies on hot tables; denormalize the predicate source instead.

## 8. Testing

```sql
-- harness: set claims, attempt access
begin;
select set_config('request.jwt.claims',
  '{"sub":"user_A","org_id":"org_A","org_role":"org:member"}', true);
set local role authenticated;
select count(*) from applications;              -- expect only org_A rows
rollback;
```

Mandatory suite (`tests/rls/`):

| Test | Expectation |
|---|---|
| select other org | 0 rows |
| insert with other `organization_id` | policy violation (42501) |
| update other org row | 0 rows affected |
| delete other org row | 0 rows affected |
| role below required | policy violation |
| `audit_events` update/delete | permission denied |
| `api_keys.key_hash` select | permission denied |
| child table with mismatched org | constraint violation |
| privileged query without org predicate | repository assertion error (dev/test) |

CI runs the suite against a freshly migrated database on every migration change.

## 9. Failure scenarios

| Scenario | Behavior |
|---|---|
| JWT claims not set | All policies return zero rows; API returns empty data — detected by integration tests |
| `org_id` claim stale after org switch | 0 rows; API uses header-validated org instead |
| Policy recursion (policy referencing its own table) | Postgres error 42P17; avoided by helper functions |
| `security definer` search_path hijack | All definer functions set `search_path = public, pg_temp` and are owned by a non-login role |
| Service role key leaked | Rotate immediately; all privileged paths require the key from secret store; audit exports reviewed |

## 10. Acceptance criteria

- [ ] 100% of tables with `organization_id` have RLS enabled and forced.
- [ ] Every privileged path appears in §5 with a test.
- [ ] Cross-tenant read/write/delete all return zero rows for `authenticated`.
- [ ] Column revokes prevent reading secret material even with a valid row grant.
- [ ] Policy performance measured on 1M-row fixtures.

## 11. Related documents

[16](16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md) · [17](17-CLERK-AUTHENTICATION.md) ·
[18](18-TENANCY-RBAC-AND-AUTHORIZATION.md) · [21](21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md) ·
[41](../06-knowledge-and-rag/41-KNOWLEDGE-PERMISSIONS-AND-TENANT-ISOLATION.md) ·
[63](../11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md)

## 12. References

- Supabase RLS — https://supabase.com/docs/guides/database/postgres/row-level-security
- Postgres policies — https://www.postgresql.org/docs/current/sql-createpolicy.html
- Supabase Clerk third-party auth — https://supabase.com/docs/guides/auth/third-party/clerk
