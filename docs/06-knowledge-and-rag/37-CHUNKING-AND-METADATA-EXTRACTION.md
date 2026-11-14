# Chunking and Metadata Extraction

**Doc ID:** 37 · **Status:** Approved · **Area:** Knowledge
**Depends on:** [36](36-DOCUMENT-INGESTION-AND-PARSING.md) · **Related:** [33](../05-ai-and-model-infrastructure/33-EMBEDDING-AND-MULTIMODAL-MODELS.md), [38](38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md)

---

## 1. Purpose

Define how parsed content becomes retrieval units: the algorithm, budgets, structure preservation, metadata, and
versioning. Chunk boundaries decide whether retrieval works.

## 2. Design goals

1. **Never break a table, code block, or list.** These lose meaning when split.
2. **Respect hierarchy.** A chunk carries its heading path so it is interpretable alone.
3. **Self-contained.** Each chunk should make sense without its neighbors, but link to its parent for expansion.
4. **Deterministic.** Same input + same config → identical chunks (hashable, idempotent).
5. **Budgeted.** Target 350–500 tokens; hard cap 800.

## 3. Algorithm

```
def chunk(document_version):
    blocks = document_version.blocks            # ordered: heading, paragraph, table, list, code, image
    sections = group_by_heading(blocks)         # stack-based hierarchy
    for section in sections:
        units = split_preserving_atoms(section)  # atoms: table, code block, list, paragraph
        buffer = []
        for unit in units:
            if unit.tokens > MAX_CHUNK:
                emit(buffer); emit_hard_split(unit)   # only tables/code rows split, with headers repeated
            elif sum(buffer) + unit.tokens > TARGET:
                emit(buffer); buffer = [overlap_tail(buffer), unit]
            else:
                buffer.append(unit)
        emit(buffer)
    return chunks
```

Parameters (per knowledge base, defaults):

| Param | Default | Range |
|---|---|---|
| `target_tokens` | 420 | 200–700 |
| `max_tokens` | 800 | 400–1200 |
| `min_tokens` | 80 | 40–200 (below → merge with neighbor) |
| `overlap_tokens` | 60 | 0–120 |
| `heading_aware` | true | — |
| `parent_expansion` | true | — |

Overlap is taken from the **tail sentences** of the previous chunk, not raw characters, so it stays readable.

## 4. Structure rules

| Element | Rule |
|---|---|
| Heading | Starts a new chunk; heading path becomes metadata; heading text prepended to the chunk |
| Paragraph | Split at sentence boundaries only; never mid-sentence unless over max |
| Table | Kept whole; if > max, split by rows with the header row repeated; markdown serialization |
| Code block | Kept whole; language tag in metadata; if > max, split at blank lines |
| List | Kept with its parent sentence; nested lists whole |
| Image | Placeholder + alt text + page; asset id in metadata |
| Footnote/ref | Kept with the paragraph that references it where detectable |

## 5. Chunk record

```json
{
  "chunk_index": 14,
  "content": "## Starter plan\n\nThe Starter plan includes 3 projects, ...",
  "token_count": 412,
  "page_from": 2, "page_to": 2,
  "section_path": ["Pricing", "Starter plan"],
  "heading": "Starter plan",
  "parent_chunk_id": "chk_01H…",
  "content_hash": "sha256:…",
  "metadata": { "table": false, "code_language": null, "source_url": "…", "language": "en" }
}
```

## 6. Parent/child expansion

- Section-level parent chunks (`is_parent=true`) hold the full section text but are **not embedded** by default.
- Child chunks store `parent_chunk_id`; retrieval can expand a hit to its parent section (bounded by the context
  budget) to give the model surrounding meaning.
- Expansion is recorded in the trace (`expanded_from_parent: true`) so citations stay precise.

## 7. Metadata extraction

| Field | Source | Used for |
|---|---|---|
| `title` | document | embeddings prefix, citations |
| `section_path` | headings | citations, filtering |
| `page_from/to` | parser | citations |
| `content_hash` | chunk text | dedupe, incremental re-embed |
| `language` | detection | eval, filtering |
| `doc_type` | source/mime | filtering, prompt hints |
| `product_area` / `tags` | front-matter or source config | metadata filters |
| `updated_at` | source metadata | recency boosting, stale warnings |
| `acl` | collection | retrieval filter (never stored per chunk) |

Custom metadata comes from: Markdown front-matter, HTML `<meta>`, OpenAPI `info`/tags, or per-source key/value
config. Values are length-capped and validated (no nested objects beyond one level).

## 8. Deduplication

- Chunk hash = `sha256(normalized_content)`.
- Within a document version, identical hashes collapse (keep the first, record `duplicate_of`).
- Across versions, identical hashes reuse the existing embedding (no provider call).
- Near-duplicates (cosine > 0.98 within the same collection) are flagged in a report; not auto-removed.

## 9. Versioning and change detection

| Change | Effect |
|---|---|
| Document content changes | new `document_version`, re-chunk, reuse embeddings for unchanged chunk hashes |
| Chunking config changes | new index version + re-chunk (documented migration) |
| Parser upgrade | new version with `parser_version` recorded; optional full reprocess |
| Source deleted | chunks/embeddings cascade |

## 10. Quality checks

- No chunk exceeds `max_tokens` (post-tokenizer assertion).
- No chunk is empty or whitespace-only.
- Heading path non-empty for documents with headings.
- Page references monotonic within a document.
- Tables retain a header row.
- Coverage: ≥ 98% of document tokens appear in at least one chunk (detect dropped content).

## 11. Failure scenarios

| Scenario | Behavior |
|---|---|
| Huge single table | split by rows, headers repeated, flagged `table_split` |
| No headings (scanned doc) | flat chunking with page boundaries; lower confidence metadata |
| Encoding garbage | reject at parse; never chunk mojibake |
| Chunk > max after hard split | force sentence split, log a warning metric |
| Overlap creates duplicate citations | citation dedupe by `(document_id, page, section)` |

## 12. Testing

- Golden fixtures: each doc type → expected chunk count ±10%, expected heading paths, no split tables.
- Property test: concatenated chunk text ≈ normalized document text (coverage ≥ 98%).
- Determinism: two runs produce identical hashes.
- Token budget: all chunks ≤ max, none < min unless document is tiny.
- Re-embed reuse: unchanged chunk → zero provider calls.

## 13. Acceptance criteria

- [ ] Tables, code blocks, and lists are never split mid-structure.
- [ ] Every chunk carries a heading path or an explicit "no heading" marker.
- [ ] Chunking is deterministic and hash-stable.
- [ ] Coverage check passes on the fixture corpus.
- [ ] Config changes create a new index version rather than mixing chunk shapes.

## 14. Related documents

[33](../05-ai-and-model-infrastructure/33-EMBEDDING-AND-MULTIMODAL-MODELS.md) · [36](36-DOCUMENT-INGESTION-AND-PARSING.md) ·
[38](38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) · [39](39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md) ·
[42](42-RAG-EVALUATION-AND-QUALITY.md)

## 15. References

- Tokenization for budgets: provider tokenizer or `tiktoken` approximation (documented in the chunker config)
- Markdown AST — https://github.com/executablebooks/markdown-it-py
