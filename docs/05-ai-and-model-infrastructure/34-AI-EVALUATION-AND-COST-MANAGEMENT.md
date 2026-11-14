# AI Evaluation and Cost Management

**Doc ID:** 34 · **Status:** Approved · **Area:** AI / Quality
**Depends on:** [28](28-AI-PROVIDER-ABSTRACTION.md) · **Related:** [42](../06-knowledge-and-rag/42-RAG-EVALUATION-AND-QUALITY.md), [62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md), [66](../11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md)

---

## 1. Purpose

Make model behavior measurable and spend bounded. Prompt/model changes ship with evidence; costs are attributable
and controlled before they become an incident.

## 2. Evaluation dimensions

| Dimension | Metric | Target |
|---|---|---|
| Intent accuracy | exact match on taxonomy | ≥ 95% |
| Plan validity | schema-valid + all steps executable | ≥ 98% |
| Tool selection | correct tool, no extra calls | ≥ 90% |
| Tool args validity | schema-valid first attempt | ≥ 95% |
| Structured output validity | valid on first or repaired attempt | ≥ 99% |
| Answer groundedness | claims supported by cited chunks | ≥ 95% |
| Citation accuracy | cited chunk actually supports claim | ≥ 95% |
| Vision grounding | referenced elements exist and are described correctly | ≥ 90% (fixture set) |
| Refusal correctness | out-of-scope refused, in-scope answered | ≥ 95% |
| Injection resistance | adversarial cases do not change behavior | 100% on corpus |
| Latency | p50/p95 per capability | within NFR |
| Cost per task | micros per successful task | within budget |

## 3. Datasets

| Suite | Size (initial) | Contents |
|---|---|---|
| `agent.intent` | 200 | labeled requests incl. ambiguous, multilingual |
| `agent.plan` | 120 | expected step kinds and tool choices |
| `tools.selection` | 150 | tool + args expectations, negative cases |
| `structured.schema` | 80 | complex schemas, edge values, adversarial extras |
| `vision.elements` | 100 | screenshots + expected element descriptors |
| `rag.answer` | 250 | question → expected answer facts + citation docs |
| `rag.unanswerable` | 60 | no evidence; must refuse/insufficient |
| `rag.conflict` | 30 | conflicting documents; must surface conflict |
| `rag.permissions` | 40 | cross-tenant/ACL probes; must return nothing |
| `injection` | 40 | malicious docs/pages/messages |
| `providers.parity` | 100 | same cases run against primary and fallback |

Datasets live in `datasets/` (storage) with a version; cases are seeded into `evaluation_cases` for the suite
that runs them. No real customer PII.

## 4. Harness

```
POST /v1/evaluation-suites/{id}/runs
{ "agent_version_id": "...", "prompt_version_ids": {...}, "providers": ["gemini","nvidia"],
  "sample": 1.0, "concurrency": 4 }
```

- Runs in `evaluation-worker`; results in `evaluation_results` (one row per case × variant).
- Deterministic settings: temperature 0 where the task allows; recorded seed/config on each result.
- Scoring: rule-based for structure/citations, LLM-judge for faithfulness (with a fixed judge prompt version and
  a human-audited sample), exact match for labels.
- Diffing: compare two runs by case, metric, and provider; show regressions and improvements.

## 5. Gates

| Gate | Condition |
|---|---|
| Prompt change | no metric drops > 2% absolute; no injection regression |
| Model upgrade | all capabilities pass; cost within +20% |
| Provider fallback enablement | parity suite ≥ 90% of primary on text tasks |
| Release | rag answer + citation ≥ thresholds; agent plan ≥ 98% |

A failing gate blocks merge/deploy unless an ADR documents the accepted regression and its expiry.

## 6. Cost model

```
cost_micros = (in_tokens × input_price + out_tokens × output_price) / 1e6 × 1e6
              + image_units × image_price
              + embedding_tokens × embedding_price / 1e6
```

| Cost bucket | Attribution |
|---|---|
| Chat answer | session → application → org |
| Classification/rewriting | run → org (sub-capability) |
| Embeddings | ingestion job → knowledge base → org |
| Vision | run → org |
| Tool calls | free (host-side), but counted as units |
| Ingestion compute | job minutes (worker) |

Prices live in the model registry and are versioned. Historical usage is never repriced.

## 7. Budgets and guardrails

| Level | Default | Action on exceed |
|---|---|---|
| Org monthly soft | plan-based | warn, notify owner, `usage.threshold.reached` |
| Org monthly hard | plan-based | reject new runs with `PLAN_LIMIT_EXCEEDED` (existing runs finish) |
| App daily | 20% of org budget | throttle to `text.fast` tier where configured, else reject |
| Per-request ceiling | 50k output tokens | clamp and flag |
| Ingestion daily pages | plan-based | pause ingestion with a clear status |
| Anomaly | > 30% day-over-day | alert, no automatic block |

## 8. Cost optimization levers (in order)

1. **Retrieval budget** — send 6–10 chunks, not 30; rerank before generation (biggest saving).
2. **Model tiering** — `text.fast` for classification, rewriting, titles; reasoning only for answers/plans.
3. **Answer caching** — exact-query cache (5 min) per knowledge version; invalidated on content change.
4. **Embedding reuse** — content hashing prevents re-embedding unchanged chunks.
5. **Prompt compression** — shorter evidence blocks, strip navigation boilerplate at parse time.
6. **Output limits** — `max_output_tokens` per task type.
7. **Provider choice** — cheaper eligible model for low-stakes tasks (flag, default off).

## 9. Reporting

Studio → Cost & Usage: spend by day, provider, model, capability, application; cost per resolved interaction;
top spenders; fallback share; cache hit rate; budget status. Export CSV/Parquet for finance.

## 10. Failure scenarios

| Scenario | Behavior |
|---|---|
| Eval provider outage | suite marked `blocked`, not `failed`; retried |
| Judge model drift | judge prompt version pinned; human audit sample each month |
| Cost spike from a bug | anomaly alert; per-app throttle; run-level ceiling |
| Dataset contamination (seen in prompt) | holdout split; rotate cases |
| Fallback quality drop | parity suite gate; fallback disabled for that capability |

## 11. Acceptance criteria

- [ ] Every prompt/model change has an eval run linked in the PR.
- [ ] Cost is recorded per call and reconcilable within 2% of provider billing.
- [ ] Hard budgets prevent unbounded spend without breaking in-flight work.
- [ ] Injection corpus passes 100%.
- [ ] Fallback parity is measured before it is enabled.

## 12. Related documents

[31](31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) · [42](../06-knowledge-and-rag/42-RAG-EVALUATION-AND-QUALITY.md) ·
[62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md) ·
[66](../11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md) ·
[59](../10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md)
