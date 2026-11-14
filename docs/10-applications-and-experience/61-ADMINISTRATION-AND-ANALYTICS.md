# Administration and Analytics

**Doc ID:** 61 · **Status:** Approved · **Area:** Experience / Operations
**Depends on:** [59](59-VISTRA-STUDIO-ARCHITECTURE.md) · **Related:** [18](../03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md), [64](../11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md), [66](../11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md)

---

## 1. Purpose

Define the administrative controls and the analytics that make the platform operable and provably valuable:
members/roles, audit, retention, data deletion, usage/cost, quality and adoption metrics, and support access.

## 2. Administration

| Capability | Where | Rules |
|---|---|---|
| Members, invitations, roles | Settings → Members | owner/admin; role changes audited; last owner cannot be removed |
| Org profile, slug, logo | Settings → General | owner/admin |
| Retention per domain | Settings → Data | owner/admin; bounded per plan |
| Capture scope per application | Application → Capture | developer+; changes audited; effective next session |
| API keys | Application → Keys | developer+; create/rotate/revoke; secret shown once |
| Webhook endpoints/secrets | Settings → Webhooks | developer+; rotate with overlap |
| Credential management | Tools/Integrations | developer+; write-only |
| Billing/plan | Settings → Billing | owner only (post-MVP) |
| Audit log + export | Security | owner/admin/analyst; export audited |
| Data export | Settings → Data | owner/admin; async job; signed URL 24 h |
| Data deletion | Settings → Danger zone | owner; typed confirmation; 30-day soft window then purge |

### 2.1 Deletion semantics

| Request | Effect |
|---|---|
| Delete application | Soft delete; sessions stop accepting; purge after 30 d (configurable) |
| Delete knowledge base | Documents/chunks/vectors deleted immediately; objects within 24 h |
| Delete session | Content hard-deleted within 24 h; aggregate usage kept |
| Delete organization | Soft delete + immediate access block; hard purge after 30 d |
| Delete user (self) | Account removed; memberships deactivated; authored content retained per org policy |

Every deletion is audited with actor, scope, and counts.

## 3. Audit

`audit_events` is append-only and captures: actor (user/end user/API key/system/agent), action, resource,
before/after summary, request id, IP, user agent, timestamp.

Administrative actions always audited: role changes, membership changes, key lifecycle, credential writes,
application create/delete, source deletion, agent publish, policy change, approval decisions, retention changes,
exports, break-glass support access, and all cross-tenant denials.

Export: CSV/JSONL over a date range, generated asynchronously, delivered via a signed URL valid 24 h, audited.

## 4. Analytics model

### 4.1 Funnel

```
sessions started
  → first message
  → answer produced
  → grounded answer (citation)
  → guide started → guide completed
  → action proposed → approved → verified
  → feedback positive
```

### 4.2 Metrics

| Metric | Definition | Target |
|---|---|---|
| Sessions | distinct `application_sessions` with ≥1 message | growth |
| Messages/session | messages ÷ sessions | 2–6 (healthy engagement, not spam) |
| Grounded rate | grounded answers ÷ answers | ≥ 85% |
| Citation rate | answers with ≥1 citation ÷ answers | ≥ 80% |
| Deflection proxy | sessions with no "contact support" click within 10 min ÷ sessions | report only |
| Guide completion | completed flows ÷ started | ≥ 85% |
| Action success | verified invocations ÷ executed | ≥ 98% |
| Approval rate | granted ÷ requested | report |
| CSAT | thumbs up ÷ (up+down) | ≥ 80% |
| p95 first token | provider + orchestration | ≤ 2 s |
| Cost per resolved interaction | spend ÷ grounded sessions | ≤ $0.02 |

### 4.3 Dimensions

Application, agent version, intent, collection, provider/model, fallback flag, locale, device class, plan tier.
No end-user identifiers in analytics aggregates.

### 4.4 Content gap report

Weekly clustering of `grounded=false` questions (embedding similarity, k-means, ≤ 20 clusters) with example
questions and the closest low-score chunks. Shown in Studio → Analytics with "create source" shortcuts.

## 5. Dashboards

| Dashboard | Contents |
|---|---|
| Overview | sessions, grounded rate, guide completion, action success, cost, open incidents |
| Quality | grounded/citation/refusal trends, top failure codes, eval status |
| Engagement | messages/session, top questions, most guided flows, drop-off steps |
| Actions | proposals, approvals, denials, verification failures by tool |
| Knowledge | sources by status, stale documents, ingestion failures, gaps |
| Cost | spend by provider/model/capability, cache hit rate, budget status |

All dashboards are server-rendered from aggregate queries; no client-side sampling.

## 6. Alerting (product-level)

| Signal | Threshold | Action |
|---|---|---|
| Grounded rate drop | > 10 points WoW | notify owner; open quality review |
| Verification failures | > 0 for a tool in 1 h | page on-call; disable tool optionally |
| `TARGET_MISSING` spike | > 20% of steps for an app | notify customer: UI changed |
| Ingestion failure rate | > 10% for an org | notify + surface in Studio |
| Cost anomaly | > 30% DoD | notify owner; check budgets |
| Provider fallback | > 10% for 10 min | page on-call |

## 7. Support access (VISTRA staff)

- Break-glass only: explicit org grant, reason recorded, time-boxed (≤ 4 h), read-only.
- Every action audited with `actor_type='system'` and the support identity.
- No access to prompts/credentials; no ability to execute tools on a tenant's behalf.
- Session recordings and screenshots are never available to support without the tenant enabling it.

## 8. Reporting exports

| Export | Format | Contents |
|---|---|---|
| Usage | CSV/Parquet | daily aggregates per app/capability |
| Audit | JSONL/CSV | events in range |
| Conversations | JSONL | messages + citations (tenant-initiated only) |
| Evaluation | JSON | suite results + diffs |

Exports are tenant-scoped, signed, expiring, and audited.

## 9. Failure scenarios

| Scenario | Behavior |
|---|---|
| Analytics query slow | pre-aggregated rollups; dashboards never scan raw tables for > 90 days |
| Deletion job fails midway | idempotent retry; status visible; no partial "deleted" claim |
| Audit write fails | mutation fails (same transaction) — no unaudited privileged action |
| Export contains cross-tenant rows | impossible by query construction; tested |
| Support access misuse | break-glass audit + review; access auto-expires |

## 10. Acceptance criteria

- [ ] Every administrative action in §3 produces an audit row.
- [ ] Deletion is idempotent and verifiable end-to-end.
- [ ] Analytics definitions in §4.2 are implemented in one place (no duplicate metric logic).
- [ ] Exports are tenant-scoped and audited.
- [ ] Support access requires an explicit grant and expires.

## 11. Related documents

[18](../03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) · [48](../07-agents-and-execution/48-AGENT-MEMORY-AND-EXECUTION-TRACES.md) ·
[59](59-VISTRA-STUDIO-ARCHITECTURE.md) · [64](../11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md) ·
[66](../11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md)
