# Observability, Logging, and Monitoring

**Doc ID:** 64 · **Status:** Approved · **Area:** Operations
**Depends on:** [27](../04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) · **Related:** [48](../07-agents-and-execution/48-AGENT-MEMORY-AND-EXECUTION-TRACES.md), [65](65-PERFORMANCE-AND-SCALABILITY.md), [75](../12-deployment-and-release/75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md)

---

## 1. Purpose

Make the system's behavior answerable in minutes: what happened to this request, why did this run fail, which
provider is degrading, what does this tenant cost. Define logs, metrics, traces, dashboards, and alerts.

## 2. Three pillars

| Pillar | Purpose | Backend |
|---|---|---|
| Logs | Discrete events with context | stdout JSON → platform log drain |
| Metrics | Aggregates, rates, latency | OpenTelemetry → backend (vendor-agnostic) |
| Traces | Causality across API → DB → provider → tool | OpenTelemetry spans |

Plus **product telemetry** (runs/steps/usage in Postgres), which is the source for Studio and audits.

## 3. Log schema (normative)

```json
{
  "ts": "2026-11-14T10:00:00.123Z",
  "level": "info",
  "event": "tool.invocation.succeeded",
  "request_id": "req_01H…",
  "trace_id": "4bf92f…",
  "span_id": "00f067…",
  "organization_id": "org_…",
  "application_id": "app_…",
  "actor_type": "end_user",
  "actor_id": "aus_…",
  "module": "tools",
  "route": "POST /v1/sdk/messages",
  "status": 200,
  "duration_ms": 412,
  "tool_id": "tol_…",
  "verified": true
}
```

Rules: one JSON object per line; no multi-line stack traces in the message field (`error.stack` separate,
truncated); no tokens, prompts, document text, or credentials; identifiers only where needed; `request_id` on
every line.

### Redaction list

`authorization`, `cookie`, `set-cookie`, `api_key`, `secret`, `password`, `token`, `ciphertext`,
`prompt`, `content`, `args` (tool args are logged as a hash + field names), `email` (hashed in analytics logs).

## 4. Traces

```
http.request POST /v1/sdk/messages
├─ auth.verify
├─ tenant.resolve
├─ service.sessions.ingest_message
│  ├─ db.query insert session_messages
│  └─ db.query insert agent_runs
├─ agent.run
│  ├─ ai.classify            provider=gemini model=… tokens=…
│  ├─ ai.plan
│  ├─ retrieval.search       candidates=118 returned=6
│  ├─ ai.generate            fallback=false ttft=680ms
│  └─ db.query persist
└─ sse.stream
```

Rules: span names stable; attributes follow semantic conventions (`db.system`, `http.status_code`,
`gen_ai.provider.name`, `gen_ai.request.model`); sampling 100% for errors, 10% for successful high-volume
streams (adjustable); no prompt text in span attributes.

## 5. Metrics

### 5.1 RED (services)

`http_requests_total{route,status}`, `http_request_duration_ms{route,p}`, `http_errors_total{code}`,
`db_query_duration_ms{op}`, `db_pool_in_use`, `redis_latency_ms`.

### 5.2 Workers

`jobs_queued{queue}`, `jobs_oldest_age_s{queue}`, `jobs_processed_total{queue,status}`,
`job_duration_ms{type}`, `jobs_dead_total`, `worker_heartbeat_age_s`.

### 5.3 AI

`ai_requests_total{provider,model,capability}`, `ai_latency_ms`, `ai_ttft_ms`, `ai_tokens_total{kind}`,
`ai_cost_micros_total`, `ai_fallback_total{reason}`, `ai_errors_total{code}`, `ai_breaker_state`.

### 5.4 Retrieval

`retrieval_duration_ms`, `retrieval_candidates{stage}`, `retrieval_zero_results_total`,
`retrieval_degraded_total`, `citation_validation_failures_total`.

### 5.5 Product

`sessions_active`, `messages_total`, `grounded_ratio`, `guide_completion_ratio`, `tool_verification_failures`,
`approvals_pending`.

## 6. Dashboards (minimum)

1. **Platform health** — availability, 5xx rate, p95 latency by route, DB/Redis status, deploy markers.
2. **Workers** — queue depth/age, throughput, dead jobs, reaper actions.
3. **AI providers** — latency/error/fallback by provider+capability, breaker state, token and cost rate.
4. **Retrieval quality** — zero-result rate, degraded rate, citation failures, p95 latency.
5. **Tenant view** — sessions, messages, grounded rate, cost, errors for one org (support).
6. **Release** — error rate and latency compared to the previous version (canary window).

## 7. Alerts

| Alert | Condition | Severity | Action |
|---|---|---|---|
| API 5xx | > 2% for 5 min | P1 | page |
| API p95 | > 2× baseline for 10 min | P2 | ticket |
| DB unavailable | health check fails 2× | P1 | page |
| Redis down | health degraded 5 min | P2 | ticket (degraded mode) |
| Provider error rate | > 20% for 5 min | P1 | page; check fallback |
| Fallback rate | > 10% for 10 min | P2 | ticket |
| Queue depth | > 1000 for 10 min | P2 | ticket; scale |
| Job dead | > 0 (webhook/ingestion) | P2 | ticket |
| Verification failures | > 0 in 1 h | P1 | page (correctness) |
| Cost anomaly | > 30% DoD per org | P2 | notify |
| Retention job missed | > 26 h since success | P3 | ticket |
| Cert expiry | < 21 days | P3 | ticket |

Every alert has: owner, runbook link, and a documented "what to check first".

## 8. Health endpoints

```
GET /healthz   → 200 {status:"ok"|"degraded", checks:{db,redis,storage,providers}}
GET /readyz    → 200 only when DB and Redis are reachable
GET /metrics   → Prometheus text (internal network only)
```

`/healthz` never returns dependency credentials or internal hostnames; provider checks are cached (60 s) to avoid
cost/rate-limit amplification.

## 9. Log retention and access

| Log | Retention | Access |
|---|---|---|
| Application logs | 30 d hot, 90 d cold | on-call, platform |
| Audit events | 1 y+ | tenant admin, security |
| Traces | 7–14 d | engineering |
| Debug prompt captures | ≤ 7 d, opt-in per org | engineering + tenant consent |

## 10. Failure scenarios

| Scenario | Behavior |
|---|---|
| Log drain down | stdout buffered by platform; no request failure |
| Metrics backend down | OTLP exporter drops with backoff; no blocking |
| Trace sampling misconfigured | error spans still 100% |
| Cardinality explosion | route templates only; no user ids in labels |
| Clock skew | server timestamps from NTP; durations measured with monotonic clock |

## 11. Acceptance criteria

- [ ] Every request has a `request_id` in logs, traces, and error responses.
- [ ] No secret or prompt text appears in logs (pattern test in CI).
- [ ] Every alert in §7 exists with a runbook link.
- [ ] Provider/fallback and verification failures are observable per org.
- [ ] Dashboards load from pre-aggregated data, not raw scans.

## 12. Related documents

[27](../04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) · [48](../07-agents-and-execution/48-AGENT-MEMORY-AND-EXECUTION-TRACES.md) ·
[61](../10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md) · [65](65-PERFORMANCE-AND-SCALABILITY.md) ·
[75](../12-deployment-and-release/75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md)

## 13. References

- OpenTelemetry semantic conventions — https://opentelemetry.io/docs/specs/semconv/
- GenAI semantic conventions — https://opentelemetry.io/docs/specs/semconv/gen-ai/
- Prometheus naming — https://prometheus.io/docs/practices/naming/
