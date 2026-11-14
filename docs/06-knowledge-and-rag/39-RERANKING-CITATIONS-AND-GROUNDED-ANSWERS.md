# Reranking, Citations, and Grounded Answers

**Doc ID:** 39 · **Status:** Approved (normative) · **Area:** Retrieval
**Depends on:** [38](38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) · **Related:** [32](../05-ai-and-model-infrastructure/32-PROMPT-AND-CONTEXT-MANAGEMENT.md), [42](42-RAG-EVALUATION-AND-QUALITY.md), [24](../04-backend-and-api/24-SESSION-AND-CONVERSATION-MANAGEMENT.md)

---

## 1. Purpose

Define how evidence becomes an answer: reranking, context framing, the citation contract, post-generation
validation, insufficient-evidence behavior, and conflict handling. This is where hallucination is prevented or
shipped.

## 2. Reranking

| Property | Value |
|---|---|
| Input | top 30 fused candidates |
| Output | top 10 with calibrated scores |
| Primary | provider `rerank` capability if configured |
| Fallback | local cross-encoder or heuristic blend (relevance + heading match + recency) |
| Latency budget | ≤ 120 ms p95 |
| Determinism | same inputs → same order (temperature 0 / local model) |

Heuristic blend (fallback): `0.55*vector + 0.30*lexical + 0.10*heading_match + 0.05*recency`.

Reranking never promotes a chunk that was filtered out by tenant/ACL — it only reorders candidates.

## 3. Answer construction

```mermaid
sequenceDiagram
  participant O as Orchestrator
  participant C as Context assembler
  participant M as Model
  participant V as Validator
  O->>C: top-k chunks + parent expansion
  C-->>O: budgeted, fenced evidence + citation index
  O->>M: grounded prompt (evidence ids only)
  M-->>O: answer text + citation ids
  O->>V: validate citations ⊆ evidence; claims ↔ citations
  V-->>O: grounded=true/false, violations[]
```

Prompt requirements (doc 32 §6): answer only from evidence; cite with `[^chk_id]`; say "I couldn't find this"
when evidence is insufficient; surface conflicts rather than choosing; keep the answer within 120 words unless
asked for detail.

## 4. Citation contract

```json
{
  "message_id": "msg_01H…",
  "grounded": true,
  "citations": [
    { "chunk_id": "chk_01H…", "document_id": "doc_01H…", "document_version_id": "dv_01H…",
      "title": "Acme Pricing", "version": 3, "page_from": 2, "page_to": 2,
      "section": "Starter plan", "quote": "The Starter plan includes 3 projects…", "score": 0.87 }
  ]
}
```

Rules:
- `chunk_id` **must** be in the evidence set of that run. A citation to anything else invalidates the response.
- `quote` must be a verbatim substring of the chunk (case-insensitive whitespace-normalized), ≤ 240 chars.
- Page/section come from the chunk metadata, not from the model.
- Citations appear in text order; duplicates by `(document_id, page, section)` are collapsed.

## 5. Validation (post-generation)

| Check | Failure action |
|---|---|
| Every `[^chk]` resolves to an evidence id | repair once, then `RESPONSE_VALIDATION_FAILED` |
| At least one citation when `grounded=true` | force `grounded=false` + insufficient-evidence text |
| Quote is a substring | drop the quote, keep the citation |
| No citation to a filtered/other-tenant chunk | hard fail (security event) |
| Answer does not contradict a cited number (heuristic numeric check) | flag for eval, not user-visible |
| PII echoes from redacted content | redact and flag |

Validation runs in the orchestrator, not in the model, and its result is stored on the message.

## 6. Insufficient evidence

Triggered when: no chunk above threshold, all candidates filtered, or retrieval degraded beyond usefulness.

Response contract:

```json
{ "grounded": false,
  "text": "I couldn't find this in Acme's documentation. The closest sources are: …",
  "suggestions": [{ "document_id": "…", "title": "Billing overview", "score": 0.19 }] }
```

- Never fabricate an answer to satisfy the user.
- Suggestions are labeled as "related, not confirmed".
- The event `rag.insufficient_evidence` is recorded for the content-gap report (doc 61).

## 7. Conflicting sources

If two chunks disagree on a fact (different numbers, statuses):

- State both with citations and dates: "Pricing v2 says X; the current pricing page says Y."
- Prefer the newer `document.updated_at` only when the user asks for "current"; state the basis.
- Never silently pick one.

## 8. Multi-hop and follow-ups

- Follow-ups resolve pronouns using the last user turn and the last cited evidence (not the whole history).
- Multi-hop questions may trigger a second retrieval with a rewritten sub-query; both retrievals' evidence is
  unioned and deduped before generation (budget permitting).
- Each hop is recorded as a separate `retrieval` step in the run trace.

## 9. Formatting for the widget

- Citations render as numbered superscripts linking to a source card (title, page, snippet).
- Source cards open a signed URL only for files the user may access; otherwise they show the snippet.
- Code/tables in answers are preserved as structured segments, not flattened.

## 10. Failure scenarios

| Scenario | Behavior |
|---|---|
| Model invents a citation id | repair once → replace with insufficient-evidence response; eval failure recorded |
| Model answers without citing | force regeneration with stricter instruction once, then grounded=false |
| Quote mismatch | citation kept, quote dropped |
| Reranker unavailable | fused order + `rerank_degraded` flag |
| Evidence includes injected instructions | ignored by prompt hierarchy; validator flags suspicious patterns |
| Retrieval returns another tenant's chunk (bug) | hard fail + security alert (should be impossible) |

## 11. Testing

- Golden set: 250 questions with expected facts and source documents → assert citation document match ≥ 95%.
- Fabricated citation test: model stub returns a fake id → response rejected.
- Insufficient-evidence set: 60 questions → `grounded=false` in ≥ 95%.
- Conflict set: 30 pairs → answer mentions both.
- Quote extraction: substring property test over fixtures.

## 12. Acceptance criteria

- [ ] Every returned citation was retrieved for that run.
- [ ] `grounded=true` implies ≥1 valid citation.
- [ ] Insufficient evidence is explicit and actionable.
- [ ] Conflicts are surfaced, not resolved silently.
- [ ] Validation failures never reach the user as raw output.

## 13. Related documents

[32](../05-ai-and-model-infrastructure/32-PROMPT-AND-CONTEXT-MANAGEMENT.md) · [38](38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) ·
[42](42-RAG-EVALUATION-AND-QUALITY.md) · [55](../09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md) ·
[61](../10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md)
