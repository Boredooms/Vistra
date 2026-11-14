# Non-Functional Requirements

**Doc ID:** 06 · **Status:** Approved · **Area:** Engineering
**Depends on:** [05](05-FUNCTIONAL-REQUIREMENTS.md) · **Related:** [65](../11-quality-security-and-operations/65-PERFORMANCE-AND-SCALABILITY.md), [66](../11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md)

---

## 1. Purpose

Set measurable quality attributes. Every NFR has a metric, a measurement method, and an enforcement
point. Unmeasured NFRs are aspirational and are not accepted as done.

## 2. Scope

Security, privacy, performance, scalability, availability, accessibility, maintainability, cost,
compatibility, and operability of the whole platform.

## 3. Budget summary (release targets)

| Attribute | Target | Measurement |
|---|---|---|
| API availability (30d) | ≥ 99.9% | uptime probe on `/healthz` per region |
| API latency p95 (non-AI endpoints) | ≤ 300 ms | APM histogram, per route |
| Chat first-token p50 / p95 | ≤ 900 ms / ≤ 2.0 s | `time_to_first_token_ms` from provider telemetry |
| Grounded answer completion p95 | ≤ 6 s | server span `agent.run` |
| Guide step start after request | ≤ 400 ms | client event timestamp vs server response |
| Cursor motion frame budget | ≤ 8 ms/frame main thread; 60 fps target | performance marks in the package |
| Widget bundle (gzip) | ≤ 60 KB core, ≤ 110 KB widget+cursor | build size check in CI |
| Ingestion throughput | ≥ 60 pages/min/worker, 10 MB PDF ≤ 60 s p95 | worker metrics |
| Retrieval p95 | ≤ 350 ms (vector+fts+filter, 1M chunks) | query instrumentation |
| Error budget | ≤ 0.1% 5xx monthly | structured logs |
| RPO / RTO | ≤ 5 min / ≤ 60 min | restore drill |
| Cost per resolved interaction | ≤ $0.02 blended | usage rollups (doc 66) |

## 4. Security (`NFR-SEC`)

| ID | Requirement | Metric | Enforcement |
|---|---|---|---|
| NFR-SEC-001 | Every request authenticated and authorized; no unauthenticated data path except `/healthz`, `/v1/public/*` (rate-limited). | 100% of routes | route inventory test in CI |
| NFR-SEC-002 | Tenant isolation at the database layer, not just application layer. | 100% scoped tables have forced RLS | RLS audit query in CI |
| NFR-SEC-003 | Secrets never in client bundles or logs. | 0 findings | bundle scan + log pattern tests + secret scanning |
| NFR-SEC-004 | Vulnerability remediation: critical ≤ 24 h, high ≤ 7 d, medium ≤ 30 d. | 100% SLA adherence | dependency scanning + tracked issues |
| NFR-SEC-005 | SSRF blocked on all user-supplied URLs. | 100% of egress calls pass the filter | egress adapter is the only fetch path |
| NFR-SEC-006 | Prompt injection cannot change policy. | 0 bypasses in the adversarial suite | injection test corpus in doc 63 |
| NFR-SEC-007 | Audit coverage for privileged actions. | 100% enumerated | endpoint → audit assertion test |
| NFR-SEC-008 | Session token lifetime ≤ 15 min; refresh requires host-minted assertion. | configured and tested | auth tests |

## 5. Privacy and data protection (`NFR-PRIV`)

| ID | Requirement | Metric |
|---|---|---|
| NFR-PRIV-001 | Capture redacts password, payment, and `data-vistra-private` content before leaving the browser. | 0 redaction misses on the fixture page set |
| NFR-PRIV-002 | Screenshots are not persisted by default; when enabled, retention ≤ tenant policy (max 30 d). | retention job audit |
| NFR-PRIV-003 | Document deletion completes (objects + rows + vectors) within 24 h of request. | deletion job report |
| NFR-PRIV-004 | PII in prompts is minimized; logs exclude prompt bodies at INFO. | log sampling review |
| NFR-PRIV-005 | Data export endpoint returns all tenant-owned records in a documented format. | export completeness test |
| NFR-PRIV-006 | Sub-processor data flows documented (Clerk, Supabase, Render, Vercel, Google, NVIDIA). | doc 68 inventory |

## 6. Performance (`NFR-PERF`)

| ID | Requirement | Budget |
|---|---|---|
| NFR-PERF-001 | Non-AI API p95 | ≤ 300 ms at 200 rps/instance |
| NFR-PERF-002 | List endpoints p95 with 10k rows | ≤ 250 ms (cursor pagination, covering indexes) |
| NFR-PERF-003 | Retrieval p95 (filtered hybrid, top-20) | ≤ 350 ms |
| NFR-PERF-004 | First token from provider | p50 ≤ 900 ms |
| NFR-PERF-005 | SSE event latency (server emit → client receive) p95 | ≤ 150 ms |
| NFR-PERF-006 | SDK init → widget interactive | ≤ 250 ms on a mid-tier laptop, ≤ 600 ms on throttled 4G |
| NFR-PERF-007 | DOM/a11y capture on a 5k-node page | ≤ 50 ms, ≤ 20 KB serialized summary |
| NFR-PERF-008 | Ingestion: 10 MB PDF end-to-end (parse→index) | ≤ 60 s p95 |
| NFR-PERF-009 | No main-thread task > 50 ms caused by the SDK | 0 violations in the budget test |
| NFR-PERF-010 | Cold start of API container | ≤ 5 s; workers ≤ 10 s |

## 7. Scalability (`NFR-SCALE`)

| ID | Requirement | Target |
|---|---|---|
| NFR-SCALE-001 | Horizontal scale of stateless API | 20 instances without code change |
| NFR-SCALE-002 | Concurrent SSE streams per instance | ≥ 2,000 (async, no thread-per-connection) |
| NFR-SCALE-003 | Chunks per organization | 10M with p95 retrieval within budget (HNSW + org filter) |
| NFR-SCALE-004 | Ingestion queue backpressure | visible depth + autoscale signal; no unbounded memory |
| NFR-SCALE-005 | DB connection usage | pooled (Supavisor/pgBouncer), ≤ 80% of plan limit at peak |
| NFR-SCALE-006 | Worker throughput scales linearly with replicas | verified by load test with 2 vs 4 replicas |
| NFR-SCALE-007 | Per-tenant quotas prevent noisy-neighbor starvation | enforced in Redis + DB |

## 8. Reliability (`NFR-REL`)

| ID | Requirement | Target |
|---|---|---|
| NFR-REL-001 | Graceful shutdown drains in-flight requests/jobs within 25 s | SIGTERM test |
| NFR-REL-002 | Idempotent retries for transient failures | 0 duplicate side effects in chaos test |
| NFR-REL-003 | Provider outage degrades, never corrupts | fallback test matrix |
| NFR-REL-004 | Worker crash resumes run from last persisted step | kill -9 test |
| NFR-REL-005 | Migrations are backward compatible during rolling deploy | expand/contract test |
| NFR-REL-006 | Backups verified by restore drill monthly | RPO ≤ 5 min, RTO ≤ 60 min |

## 9. Accessibility (`NFR-A11Y`)

| ID | Requirement | Standard |
|---|---|---|
| NFR-A11Y-001 | Widget and Studio meet WCAG 2.2 AA for keyboard, focus, contrast, and labels. | axe-core zero critical violations; manual keyboard pass |
| NFR-A11Y-002 | Streamed content announced politely; no focus stealing. | `aria-live="polite"`, focus trap only in modal |
| NFR-A11Y-003 | Reduced motion honored across cursor and widget. | `prefers-reduced-motion` test |
| NFR-A11Y-004 | Guidance always has a non-visual equivalent (text step list). | DOM assertion in cursor tests |
| NFR-A11Y-005 | Cursor never obscures the target's accessible name from screen readers. | overlay is `aria-hidden` |

## 10. Maintainability (`NFR-MNT`)

| ID | Requirement | Target |
|---|---|---|
| NFR-MNT-001 | Module boundary violations | 0 (import-linter in CI) |
| NFR-MNT-002 | Test coverage on changed service/policy code | ≥ 80% branches |
| NFR-MNT-003 | Type strictness | `mypy --strict`, TS `strict` + no `any` in exports |
| NFR-MNT-004 | Documentation coverage | 100% of contracts have an owning doc; validator green |
| NFR-MNT-005 | Dependency freshness | no direct dep > 2 majors behind without an ADR note |
| NFR-MNT-006 | Onboarding to first PR | ≤ 1 day using docs 67 + 11 |

## 11. Cost (`NFR-COST`)

| ID | Requirement | Target |
|---|---|---|
| NFR-COST-001 | Cost attributable per org/app/feature | 100% of provider calls metered |
| NFR-COST-002 | Blended cost per resolved interaction | ≤ $0.02 |
| NFR-COST-003 | Embedding cost per 1k pages | ≤ $0.15 |
| NFR-COST-004 | Idle infrastructure cost (no traffic) | ≤ $70/mo pre-GA |
| NFR-COST-005 | Cost anomaly alerting | > 30% day-over-day per org triggers alert |

## 12. Compatibility (`NFR-COMP`)

| ID | Requirement |
|---|---|
| NFR-COMP-001 | SDK supports the last 2 versions of Chrome, Edge, Firefox, Safari (desktop) and iOS Safari 16+, Chrome Android. |
| NFR-COMP-002 | SDK works in ESM bundlers (Vite, Next, Webpack 5) and as a script tag with a global. |
| NFR-COMP-003 | No dependency on `eval`, `with`, or `document.write`. |
| NFR-COMP-004 | API versioning: `/v1` stable; breaking change requires `/v2` + 90-day deprecation. |
| NFR-COMP-005 | Python 3.12+; Node 22 LTS; Postgres 15+ with pgvector 0.7+. |

## 13. Observability (`NFR-OBS`)

| ID | Requirement | Target |
|---|---|---|
| NFR-OBS-001 | Every request has `request_id` in logs, traces, and error responses. | 100% |
| NFR-OBS-002 | Trace coverage for agent runs incl. provider spans | 100% of runs |
| NFR-OBS-003 | Alert signal-to-page | ≤ 5 min for SLO breaches |
| NFR-OBS-004 | Dashboards for API, workers, providers, retrieval, cost | maintained per doc 64 |
| NFR-OBS-005 | Log retention | 30 d hot, 1 y cold (audit 1 y) |

## 14. Operability (`NFR-OPS`)

| ID | Requirement |
|---|---|
| NFR-OPS-001 | All config validated at boot; missing required config fails fast with a clear message. |
| NFR-OPS-002 | Migrations run as a discrete release step with a recorded version. |
| NFR-OPS-003 | Rollback to the previous image/deployment in ≤ 10 min. |
| NFR-OPS-004 | Runbook covers the top 12 failure modes with diagnostic commands. |
| NFR-OPS-005 | Feature flags gate incomplete capabilities; no dead code paths in production. |

---

## 15. Verification plan

| NFR group | Verified by | Where |
|---|---|---|
| SEC, PRIV | security suite + adversarial tests | [63](../11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md), [62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md) |
| PERF, SCALE | k6/Locust load tests, budgets in CI | [65](../11-quality-security-and-operations/65-PERFORMANCE-AND-SCALABILITY.md) |
| REL | chaos tests: provider failure, worker kill, DB failover | [62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md) |
| A11Y | axe + manual keyboard + reduced-motion | [62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md) |
| COST | usage rollups + budget alerts | [66](../11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md) |
| OPS | release checklist + incident drill | [74](../12-deployment-and-release/74-PRODUCTION-RELEASE-AND-ROLLBACK.md) |

## 16. Acceptance criteria

- [ ] Each NFR has an automated check or a documented manual procedure.
- [ ] Budgets are asserted in CI where measurable without production traffic.
- [ ] A regression in any budget fails the release gate.

## 17. Related documents

[65](../11-quality-security-and-operations/65-PERFORMANCE-AND-SCALABILITY.md) ·
[66](../11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md) ·
[62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md) ·
[64](../11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md)
