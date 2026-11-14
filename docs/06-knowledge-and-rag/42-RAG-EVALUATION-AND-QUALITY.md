# RAG Evaluation and Quality

**Doc ID:** 42 · **Status:** Approved · **Area:** Knowledge / Quality
**Depends on:** [38](38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md), [39](39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md) · **Related:** [34](../05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md), [62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md)

---

## 1. Purpose

Measure retrieval and answer quality with numbers, per knowledge base and per change. Retrieval failures look
like model failures to users; without retrieval metrics, teams tune prompts to compensate for bad chunks.

## 2. Evaluation sets

| Set | Size | Contents | Purpose |
|---|---|---|---|
| `retrieval.core` | 300 queries | query → labeled relevant chunk ids | recall/precision/MRR/NDCG |
| `answer.faithful` | 200 | question → expected facts + allowed sources | groundedness |
| `answer.citation` | 150 | question → expected source doc/page | citation accuracy |
| `answer.unanswerable` | 80 | no supporting evidence exists | refusal correctness |
| `answer.conflict` | 40 | contradictory documents | conflict surfacing |
| `answer.permissions` | 60 | restricted docs vs users | zero leakage |
| `chunking.regression` | 50 docs | expected chunk boundaries | structural integrity |
| `multilingual` | 60 | non-English queries/docs | coverage |

Datasets are versioned artifacts; a change to labels is a reviewable diff.

## 3. Metrics

```
Recall@k        = |relevant ∩ retrieved@k| / |relevant|
Precision@k     = |relevant ∩ retrieved@k| / k
MRR             = mean(1 / rank_first_relevant)
NDCG@k          = DCG@k / IDCG@k          (graded relevance)
Citation acc.   = cited docs that support the claim / cited docs
Faithfulness    = supported claims / total claims   (judge + human audit)
Refusal acc.    = correct refusals / unanswerable cases
Leakage rate    = unauthorized chunks returned / probes   (must be 0)
```

Targets (release gate):

| Metric | Target |
|---|---|
| Recall@10 | ≥ 0.90 |
| Recall@5 | ≥ 0.80 |
| MRR | ≥ 0.75 |
| NDCG@10 | ≥ 0.80 |
| Citation accuracy | ≥ 0.95 |
| Faithfulness | ≥ 0.95 |
| Refusal accuracy | ≥ 0.95 |
| Leakage | 0 |
| p95 retrieval latency | ≤ 350 ms |

## 4. Harness

```
POST /v1/evaluation-suites/{id}/runs
{ "knowledge_base_id": "...", "index_version": 2, "retrieval_config": {...},
  "variants": [{"name":"baseline"},{"name":"no_rerank"},{"name":"hybrid_w0.7"}] }
```

- Runs in `evaluation-worker`; each variant produces `evaluation_results` with scores and the retrieved ids.
- Deterministic: fixed rewrite cache, temperature 0, fixed `ef_search`.
- Judge: pinned prompt version; 10% human-audited; disagreement rate tracked (target < 10%).
- Cost/runtime budget per suite (doc 34 §7); sampling allowed for large sets, recorded.

## 5. Change gating

| Change | Required evidence |
|---|---|
| Chunking config | recall@10 no drop > 0.03; structural checks pass |
| Embedding model/dimension | new index version evaluated; recall no drop; cost delta |
| Reranker change | NDCG/citation no drop; latency within budget |
| Retrieval thresholds | precision/recall trade-off documented |
| Prompt change affecting citations | citation accuracy + faithfulness gates |
| Connector/parser change | chunking regression + 20-query smoke |

## 6. Diagnosis playbook

| Symptom | Likely cause | Check |
|---|---|---|
| Recall low, lexical high | embedding mismatch or chunking too coarse | compare vector vs lexical candidate overlap |
| Recall fine, faithfulness low | too much evidence / weak prompt / conflicts | inspect evidence tokens and conflict cases |
| Citations wrong but chunks right | citation extraction/validation bug | quote substring check |
| Refusals high | thresholds too strict | score distribution on answerable set |
| Latency high | candidate k too large, rerank, filters | EXPLAIN + span breakdown |
| Leakage probe fails | filter missing on a path | audit SQL predicates per path |

## 7. Drift and staleness

- **Content drift:** monthly job detects documents unchanged for > 180 days in collections used to answer
  frequently; reports to Studio as "possibly stale".
- **Quality drift:** weekly eval run on production-retrieved queries (sampled, PII-redacted); alert if
  faithfulness drops > 3 points week over week.
- **Index drift:** coverage job ensures every chunk has an embedding in the active index version.
- **Threshold drift:** score distributions are recorded; if median top score shifts > 0.1, re-calibrate.

## 8. Content gap reporting

Unanswered questions (`grounded=false`) are clustered by embedding similarity into topics weekly and shown in
Studio as "documentation gaps" with example questions and suggested sources. This closes the loop from product
telemetry to content work.

## 9. Failure scenarios

| Scenario | Behavior |
|---|---|
| Eval provider outage | suite `blocked`, retried; no gate bypass |
| Judge drift | human audit sample; re-pin judge prompt |
| Dataset leakage into prompts | holdout rotation; never put eval answers in system prompts |
| Eval set too small for significance | report confidence intervals; require ≥ 100 cases for gates |
| Label disagreement | dual annotation on 10%; adjudicate |

## 10. Acceptance criteria

- [ ] Each metric has a reproducible script and a stored baseline.
- [ ] Release gates are enforced in CI for retrieval-affecting changes.
- [ ] Leakage probes are part of the security suite, not optional.
- [ ] Content-gap reporting exists and is fed by real insufficient-evidence events.
- [ ] Eval results are linked from the PR that changed retrieval.

## 11. Related documents

[33](../05-ai-and-model-infrastructure/33-EMBEDDING-AND-MULTIMODAL-MODELS.md) ·
[38](38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) · [39](39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md) ·
[41](41-KNOWLEDGE-PERMISSIONS-AND-TENANT-ISOLATION.md) ·
[34](../05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md) ·
[62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md)
