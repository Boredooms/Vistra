# Supabase and Redis Production Setup

**Doc ID:** 71 · **Status:** Approved · **Area:** Platform / Data
**Depends on:** [16](../03-database-and-identity/16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md), [19](../03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) · **Related:** [21](../03-database-and-identity/21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md), [69](69-RENDER-BACKEND-DEPLOYMENT.md), [75](75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md)

---

## 1. Purpose

Configure the managed data layer for production: Supabase project settings, extensions, pooling, storage buckets,
RLS verification, backups, monitoring, and the Redis instance used for ephemeral coordination.

## 2. Project setup

| Setting | Value |
|---|---|
| Plan | Sized for connections + storage + PITR needs |
| Region | Same region as Render API (latency) |
| Postgres | 15+ |
| Point-in-time recovery | Enabled (plan-dependent) |
| Network | TLS required; IP allowlist for the API egress ranges if supported |
| API keys | Publishable + secret (legacy `anon`/`service_role` unused) |
| Auth | Third-party Clerk provider configured (doc 17 §7) |

Environment separation: separate Supabase projects for staging and production. Never share a database across
environments.

## 3. Extensions

```sql
create extension if not exists vector;      -- pgvector
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
-- optional: pg_cron for scheduled maintenance (supabase supports via dashboard)
```

Verify: `select extname, extversion from pg_extension;` — pgvector ≥ 0.7 for HNSW.

## 4. Connection strategy

| Consumer | Connection | Why |
|---|---|---|
| API | Pooled (Supavisor, transaction mode) | Many short requests; avoids connection exhaustion |
| Workers | Pooled, smaller pool | Long jobs; bounded concurrency |
| Migrations | Direct (not pooled) | DDL + advisory locks |
| Analytics/export | Direct with a read-only role | Long queries, avoid pool contention |

```env
SUPABASE_DB_URL=postgresql://postgres.<ref>:<pw>@<pooler-host>:6543/postgres?sslmode=require
DIRECT_DB_URL=postgresql://postgres.<ref>:<pw>@<direct-host>:5432/postgres?sslmode=require
```

Notes:
- Transaction pooling mode does not support session-level features (prepared statements across statements,
  `SET` persistence). Configure asyncpg accordingly (`statement_cache_size=0` when required) and set JWT claims per
  transaction.
- Pool sizes: API `pool_size=10` per instance (with 2+ instances), workers 4; keep total under the plan's
  connection limit with headroom.
- Set `statement_timeout` (5 s OLTP, 30 s analytics) and `idle_in_transaction_session_timeout` (10 s).

## 5. Storage

| Bucket | Public | Policy |
|---|---|---|
| `documents-original` | no | server-only signed URLs |
| `documents-processed` | no | server-only |
| `extracted-assets` | no | server-only |
| `screenshots` | no | server-only, 7 d |
| `exports` | no | server-only, 7 d |
| `datasets` | no | server-only |
| `avatars` | yes (CDN) | public read, write via API |

- Buckets are private by default; access is via signed URLs generated after authorization.
- Storage policies deny `anon`; service role used only by the API.
- Per-org prefixes enforced by key construction (doc 20 §4).
- Lifecycle: scheduled deletion job for expired screenshots/exports; orphan sweep daily.

## 6. RLS verification in production

After every migration:

```sql
-- tables without RLS
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;

-- tables with RLS but not forced
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity and not c.relforcerowsecurity;

-- policies per table
select tablename, policyname, cmd from pg_policies where schemaname='public' order by 1,2;
```

CI runs the same checks; production runs them as a post-deploy verification and records the result.

## 7. Backups and recovery

| Item | Setting |
|---|---|
| Daily backups | enabled |
| PITR window | plan max (7–30 d) |
| Logical dumps | daily to a separate bucket, 30 d |
| Restore drill | monthly, recorded |
| RPO / RTO | ≤ 5 min / ≤ 60 min |

Procedure and validation steps: doc 21 §9.

## 8. Monitoring

Watch:

- connections in use vs limit, pool wait time,
- CPU/memory/IOPS, disk usage (WAL + tables + indexes),
- slow queries (> 1 s) and lock waits,
- replication/PITR lag,
- storage bytes per bucket and per org (quota enforcement),
- error rate from the API's DB layer.

Alerts: connections > 80%, disk > 75%, slow query rate spike, backup failure, PITR disabled unexpectedly.

## 9. Maintenance

| Task | Cadence |
|---|---|
| `ANALYZE` on hot tables | weekly (auto-vacuum normally suffices) |
| `REINDEX CONCURRENTLY` HNSW if bloat detected | quarterly / on alert |
| Vacuum tuning for high-churn tables (`session_events`, `jobs`) | after 2 weeks of data |
| Partition creation (monthly usage/audit) | monthly job |
| Extension upgrades (pgvector) | with a tested migration + index rebuild plan |

## 10. Redis

| Setting | Value |
|---|---|
| Provider | Managed Redis 7-compatible, same region |
| TLS | `rediss://` |
| Eviction | `noeviction` for queues/locks; keys always have TTL for caches |
| Maxmemory | sized for counters + hot cache (small); Redis is not a datastore |
| Persistence | not required (state is rebuildable) |
| Namespacing | `vistra:{env}:{purpose}:{key}` |

Key families: `rl:*` (rate limits, TTL 60 s), `lock:*` (5–30 s), `cache:app:*` (60 s),
`cache:jwks` (300 s), `cache:embed:*` (10 min), `stream:*` (pub/sub channels), `jobwake:*`.

Failure policy: caches fail open (miss); rate limits for auth-sensitive routes fail closed; queue wake signals
degrade to DB polling.

## 11. Failure scenarios

| Scenario | Behavior |
|---|---|
| Pooler saturated | API returns 503 fast; alert; scale pool/instances |
| Direct connection used by API | connection storm; blocked by config review + code check |
| Storage bucket accidentally public | alert on policy drift; re-apply policy |
| PITR unavailable | fall back to nightly dumps; document in incident |
| Redis eviction of locks | duplicate work possible; idempotency still protects |
| Region mismatch | latency alert; migrate project region (planned downtime) |

## 12. Acceptance criteria

- [ ] RLS verification query returns zero rows for missing/unforced policies.
- [ ] API uses the pooled connection; migrations use direct.
- [ ] All buckets private except avatars.
- [ ] Backup restore drill completed within RTO.
- [ ] Redis has TTLs on every key family and no durable business data.

## 13. Related documents

[16](../03-database-and-identity/16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md) · [19](../03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) ·
[21](../03-database-and-identity/21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md) · [65](../11-quality-security-and-operations/65-PERFORMANCE-AND-SCALABILITY.md) ·
[69](69-RENDER-BACKEND-DEPLOYMENT.md)

## 14. References

- Supabase connection pooling — https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase storage — https://supabase.com/docs/guides/storage
- Supabase backups — https://supabase.com/docs/guides/platform/backups
- pgvector — https://github.com/pgvector/pgvector
