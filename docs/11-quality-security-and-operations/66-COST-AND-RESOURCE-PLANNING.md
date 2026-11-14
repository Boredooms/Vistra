# Cost and Resource Planning

**Doc ID:** 66 · **Status:** Approved · **Area:** Operations
**Depends on:** [34](../05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md) · **Related:** [61](../10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md), [65](65-PERFORMANCE-AND-SCALABILITY.md), [71](../12-deployment-and-release/71-SUPABASE-AND-REDIS-PRODUCTION-SETUP.md)

---

## 1. Purpose

Make unit economics explicit and controllable: what each interaction costs, which resources dominate, how budgets
are enforced, and what the infrastructure bill looks like at each stage.

## 2. Cost model

```
monthly_cost =
  inference (tokens + images + embeddings)
+ infrastructure (API/worker compute, DB, storage, cache, egress)
+ platform (Clerk MAU, Vercel, monitoring, email)
+ support/ops (amortized)
```

### 2.1 Per-interaction estimate

| Component | Typical | Notes |
|---|---|---|
| Classify (fast, ~600 in / 40 out) | $0.0002 | every message |
| Retrieve + rerank | $0.0001 | embedding query cached often |
| Answer (3.5k in / 220 out, balanced) | $0.004–0.008 | dominates |
| Vision (1 crop, 1k in / 200 out) | $0.003–0.006 | when enabled |
| Guide plan (1k in / 300 out) | $0.002 | per flow, not per step |
| Embedding (1 page ≈ 600 tokens) | $0.00002 | one-time per chunk |
| Tool call | $0 | compute only |
| Infra allocation per message @ 100k msg/mo | $0.002–0.004 | fixed costs spread |

Target blended: **≤ $0.02 per resolved interaction**, with a p90 of $0.05. Fallback to a free-tier provider
lowers inference cost but must not be relied on for capacity or quality.

> Prices are configuration, not constants. The registry holds per-model pricing (doc 28 §7); this table is a
> planning estimate to be replaced with measured values after the first production month.

## 3. Resource inventory and rough monthly cost

| Resource | Dev/staging | Early production |
|---|---|---|
| Render API (1–2 instances) | $14–50 | $100–400 |
| Render workers (3 services) | $21–75 | $150–600 |
| Supabase (DB + storage) | $0–25 | $25–300 |
| Redis (managed, small) | $0–15 | $30–150 |
| Vercel (3 projects) | $0–20 | $20–200 |
| Clerk | $0–25 | $25–500 (MAU) |
| Model inference | $20–100 | $500–5,000 |
| Monitoring/logs | $0–30 | $50–300 |
| **Total** | **~$80–350** | **~$900–7,500** |

These are planning envelopes; re-forecast after the first month of real usage.

## 4. Cost controls (enforced in code)

| Control | Mechanism | Owner |
|---|---|---|
| Per-call ceiling | `max_output_tokens`, context budget | runtime |
| Per-run ceiling | step/tool/token limits | runtime |
| Per-app daily | soft threshold + tier downgrade if configured | usage module |
| Per-org monthly | soft warn, hard reject at plan cap | usage + billing |
| Ingestion cap | pages/day per plan | ingestion |
| Embedding reuse | content hash | chunker |
| Answer cache | exact query, 5 min | retrieval |
| Fallback cost guard | only when primary is unhealthy, not to save money silently | router |
| Anomaly alert | > 30% day-over-day per org | monitoring |

## 5. Metering

Every model call writes `usage_records` (capability, provider, model, tokens, units, cost_micros). Rollups:
`model_usage` daily per org/provider/model/capability; `usage_rollups` for billing metrics.

Reconciliation: monthly compare provider-reported billing to `sum(cost_micros)`; target within 2%. Discrepancies
indicate missing instrumentation or price drift.

## 6. Budget UX

- Studio → Cost shows spend, forecast to month-end, budget status, top spend drivers.
- Warning at 80% of soft budget (email + in-app).
- Hard cap: new runs rejected with `PLAN_LIMIT_EXCEEDED`, in-flight runs finish, UI explains how to raise it.
- Per-application caps prevent one integration from consuming the org budget.

## 7. Optimization order (measured, not guessed)

1. Reduce evidence tokens (rerank → top 6) — largest lever.
2. Cache answers and embeddings.
3. Tier tasks (`fast` for classify/rewrite/title).
4. Trim conversation history with summaries.
5. Batch embeddings.
6. Compress prompts (remove boilerplate at parse time).
7. Only then consider cheaper models, and only with eval evidence.

## 8. Growth model

| Stage | Messages/mo | Infra shape |
|---|---|---|
| Design partner | 50k | 1 API, 2 workers, small DB |
| Early | 500k | 3 API, 4 workers, 2× DB, pooling tuned |
| Growth | 5M | 10 API, autoscaled workers, partitioned tables, replica |
| Scale | 50M | sharded retrieval by org tier, reserved capacity, negotiated provider pricing |

Cost per message should decline with scale (fixed-cost amortization, caching, negotiation), not rise.

## 9. Failure scenarios

| Scenario | Impact | Response |
|---|---|---|
| Runaway loop in an agent | cost spike | run limits + anomaly alert + per-app throttle |
| Provider price change | margin | update registry pricing, re-forecast, adjust plans |
| Free-tier fallback becomes rate-limited | quality/latency | don't depend on it for SLAs; document |
| Storage bloat (screenshots) | cost | retention enforcement, crop-only default |
| Eval suite cost | budget | sampled live calls; fixtures by default |

## 10. Acceptance criteria

- [ ] Every model call is metered and attributable.
- [ ] Hard budgets are enforced before provider calls.
- [ ] Monthly reconciliation is within 2%.
- [ ] Cost dashboards answer "what did this org cost and why".
- [ ] Optimization claims are backed by before/after measurements.

## 11. Related documents

[28](../05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md) · [34](../05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md) ·
[61](../10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md) · [65](65-PERFORMANCE-AND-SCALABILITY.md) ·
[71](../12-deployment-and-release/71-SUPABASE-AND-REDIS-PRODUCTION-SETUP.md)
