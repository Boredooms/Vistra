# Production Runbook and Incident Response

**Doc ID:** 75 · **Status:** Approved · **Area:** Operations
**Depends on:** [64](../11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md), [74](74-PRODUCTION-RELEASE-AND-ROLLBACK.md) · **Related:** [21](../03-database-and-identity/21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md), [63](../11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md)

---

## 1. Purpose

Give an on-call engineer the exact steps for the failures that actually happen: what to check, what to do, what not
to do. Also define severity, roles, communication, and postmortems.

## 2. Severity

| Sev | Definition | Response |
|---|---|---|
| P1 | Platform down, tenant data at risk, unauthorized actions | page immediately, incident commander, status page |
| P2 | Major feature degraded (chat, retrieval, queue backlog) | page during business hours / 30 min |
| P3 | Minor degradation, single-tenant issue, cost anomaly | ticket, next business day |
| P4 | Cosmetic, docs | backlog |

## 3. Roles

- **Incident commander (IC):** coordinates, decides, owns communication.
- **Operations lead:** executes runbook steps.
- **Communications lead:** status page, customer updates.
- **Scribe:** timeline, decisions, evidence.

Solo on-call may hold all roles for P2/P3.

## 4. First 10 minutes (any incident)

```
1. Acknowledge the page; open the incident channel.
2. State what you know (symptom, start time, blast radius guess).
3. Check status: API /healthz, /readyz, provider dashboards, queue depth, DB connections.
4. Decide: mitigate first, diagnose second.
5. Announce severity + IC.
6. Start a timeline (timestamps, actions, results).
```

## 5. Runbooks

### RB-01 — API 5xx spike

1. `curl -s $API/healthz | jq` → which dependency is degraded?
2. Check Render deploy history: did a deploy just start/finish? → consider rollback (doc 74).
3. Check logs for the dominant `code` (`PROVIDER_*`, `DATABASE_*`, `INTERNAL_ERROR`).
4. If DB: check connections, slow queries, pool saturation; reduce pool if exhausting.
5. If provider: check fallback rate; if fallback also failing, enable maintenance mode for AI routes only.
6. If a single tenant: check quota/abuse and isolate.

### RB-02 — Provider outage / fallback storm

1. Confirm provider status page + our error metrics.
2. Verify fallback rate and whether fallback models are healthy.
3. If fallback is failing too: return `PROVIDER_UNAVAILABLE` with retry guidance; post status.
4. Disable the broken model in the registry (config), do not edit code.
5. When recovered, watch error rate back to baseline; keep the breaker state visible.

### RB-03 — Worker backlog / stuck jobs

1. Check queue depth, oldest job age, dead count.
2. Check worker heartbeats; if a replica is unhealthy, restart it (Render).
3. Look for a poison job (same error repeatedly) → mark dead, inspect payload, fix and requeue.
4. If ingestion backlog: scale ingestion; if agent: scale agent workers.
5. Verify the reaper is running (`jobs` with stale heartbeats being reclaimed).

### RB-04 — Database unavailable / connections exhausted

1. Check Supabase status + connection count.
2. If pool exhausted: lower `pool_size`, restart API instances one by one.
3. Kill long-running queries (`pg_stat_activity`) with care.
4. If primary down: enable maintenance mode; follow doc 21 §9 for restore if needed.

### RB-05 — Retrieval returning nothing / wrong answers

1. Check `retrieval_zero_results_total`, degraded rate, embedding provider health.
2. Verify the active index version and embedding coverage for the tenant.
3. If an index rebuild is in progress, confirm reads still use the previous version.
4. If ACL misconfiguration: check collection scopes and allowed-list computation.
5. Never "fix" by lowering thresholds globally.

### RB-06 — Tool verification failures

1. This is a correctness P1: an action may have happened without confirmation.
2. Inspect `tool_invocations` for the failing tool; check host API status.
3. If duplicates are possible: disable the tool (`status=disabled`), notify the tenant with the affected run ids.
4. Reconcile host state against our records; never mark verified manually without evidence.

### RB-07 — Suspected cross-tenant access

1. Treat as P1 security incident.
2. Identify scope from `audit_events` (`security.*`) and traces.
3. Revoke affected tokens/keys; disable the offending path/feature.
4. Preserve evidence; do not delete logs.
5. Notify per legal/contract after assessment.

### RB-08 — Cost anomaly

1. Identify the spend driver (org, app, capability, model).
2. Check for loops (same query repeated), ingestion bursts, or abuse.
3. Apply per-app throttle or hard budget; contact the tenant.
4. Fix the cause (limits, cache, prompt) before raising the cap.

### RB-09 — Bad release

Follow doc 74 §7. Roll back frontend first, then API, then workers. Do not roll back migrations unless corrupted.

### RB-10 — Storage/deletion failure

1. Check bucket policies and provider status.
2. Verify the deletion job's last run and error; requeue failed items.
3. Confirm tenant data is invisible in the API even if bytes remain (row marked deleted first).

### RB-11 — Auth outage (Clerk)

1. Existing sessions continue until token expiry if JWKS is cached.
2. If cache is cold: 503 `AUTH_UNAVAILABLE`; do **not** disable verification.
3. Post status; monitor Clerk status page.

### RB-12 — Realtime (SSE) broken

1. Check proxy buffering, Render service health, Redis pub/sub.
2. Verify heartbeat frames arrive (`ping` every 15 s).
3. If only live updates are broken, the API still works; clients fall back to polling.

## 6. Maintenance mode

A config flag (`MAINTENANCE_MODE=true`) makes the API return `503 MAINTENANCE_MODE` with `Retry-After` for
mutations while allowing `/healthz` and read-only status. Used for restores and destructive maintenance. Toggling
is audited.

## 7. Communication templates

**Investigating:** "We're investigating elevated errors affecting [feature]. Started [time]. Updates every 30 min."

**Identified:** "Cause identified: [provider/DB/release]. Mitigation in progress. [Feature] may show errors."

**Monitoring:** "Mitigation applied at [time]. Error rates returning to normal. Monitoring for 30 min."

**Resolved:** "Resolved at [time]. Duration [x]. [Feature] fully restored. Postmortem to follow."

Never speculate about cause or blame in customer-facing text. Never promise an ETA you cannot justify.

## 8. Postmortem template

```
Incident: <title>            Severity: <P>       Duration: <start–end>
Impact: <tenants, features, data>
Detection: <alert / customer / internal>
Timeline: <UTC, action, result>
Root cause: <technical, specific>
Contributing factors: <process, monitoring, config>
What went well: <>
What went poorly: <>
Action items: <owner, due date, linked issue>
Regression tests added: <>
```

Blameless. Action items are tracked to completion; a postmortem with no test or control change is incomplete.

## 9. On-call expectations

- Acknowledge P1 within 5 minutes, P2 within 30.
- Do not debug alone for > 20 minutes on a P1 without escalating.
- Never make unreviewed schema changes during an incident.
- Hand off with a written summary: state, actions, next step.

## 10. Acceptance criteria

- [ ] Every alert links to a runbook section.
- [ ] Each runbook has been exercised in a drill.
- [ ] Severity definitions match the alert severities in doc 64.
- [ ] Maintenance mode is tested and audited.
- [ ] Postmortems produce tracked, closed action items.

## 11. Related documents

[21](../03-database-and-identity/21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md) ·
[63](../11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md) ·
[64](../11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md) · [74](74-PRODUCTION-RELEASE-AND-ROLLBACK.md)
