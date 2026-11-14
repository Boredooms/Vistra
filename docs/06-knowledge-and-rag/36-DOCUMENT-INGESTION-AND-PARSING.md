# Document Ingestion and Parsing

**Doc ID:** 36 · **Status:** Approved · **Area:** Knowledge
**Depends on:** [35](35-KNOWLEDGE-ENGINE-ARCHITECTURE.md) · **Related:** [37](37-CHUNKING-AND-METADATA-EXTRACTION.md), [40](40-KNOWLEDGE-SOURCE-CONNECTORS.md), [26](../04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md)

---

## 1. Purpose

Define how raw sources become clean, structured text: supported formats, parser adapters, fetching rules,
extraction fidelity, error taxonomy, and reprocessing. Garbage in, confidently wrong answers out — this is where
quality is won.

## 2. Supported inputs

| Type | Formats | Parser |
|---|---|---|
| Documents | PDF, DOCX, PPTX | `pymupdf` (PDF), `python-docx`, `python-pptx` |
| Text | TXT, MD, HTML | stdlib + `markdown-it-py` (AST), `selectolax` (HTML) |
| Data | CSV, JSON | stdlib with schema inference |
| Web | single URL, sitemap | httpx + `selectolax`, sitemap XML parsing |
| Code/spec | OpenAPI (JSON/YAML), GitHub repo (md/adoc) | `pyyaml`, API traversal |
| Future | Notion, Drive, Confluence | connector adapters (doc 40) |

Unsupported type → rejected at source creation with `FILE_TYPE_NOT_ALLOWED`, before a job is created.

## 3. Job stages

```mermaid
sequenceDiagram
  participant W as ingestion worker
  participant S as Storage/Egress
  participant P as Parser
  participant N as Normalizer
  participant DB as Postgres
  W->>DB: claim job, heartbeat
  W->>S: fetch bytes (size/time caps)
  W->>W: sniff magic bytes; verify claimed type
  W->>DB: stage=fetching→parsing
  W->>P: parse (page/section aware)
  P-->>W: blocks + metadata + assets
  W->>W: normalize whitespace/unicode/boilerplate
  W->>DB: document_version(parse_status, page_count, token_count)
  W->>DB: stage=chunking (see doc 37)
```

Each stage is resumable: `stats` records completed pages/batches so a retry continues rather than restarts.

## 4. Fetching rules (URL sources)

| Control | Value |
|---|---|
| Scheme | `https` only (http allowed with explicit config) |
| DNS check | resolve; reject private, loopback, link-local, CGNAT, multicast, metadata IPs |
| Redirects | max 3; re-validate each hop |
| Size cap | 20 MB per document; 200 pages per sitemap by default |
| Time caps | connect 5 s, read 20 s, total 60 s |
| Content types | `text/html`, `application/pdf`, `text/plain`, `text/markdown`, `application/json`, `application/xml` |
| User agent | `VistraBot/1.0 (+https://vistra.dev/bot)` |
| robots.txt | respected for crawling sources (single explicitly provided URLs are fetched) |
| Auth | optional per-source headers/credentials, encrypted at rest |
| Caching | raw snapshot stored; `If-Modified-Since`/ETag used on re-fetch |

## 5. PDF parsing

- Text layer extraction per page; preserve page numbers for citations.
- Headings inferred from font size/weight heuristics **and** PDF outline (bookmarks) when present; the outline
  wins.
- Tables: detect via ruling lines / text alignment; serialize to markdown; keep page reference.
- Images: extract to `extracted-assets`, record a placeholder `[image: figure-3]` in text; OCR not applied by
  default.
- Columns: detect two-column layouts and read in order; flag low-confidence layouts.
- Scanned PDFs (no text layer): OCR path (`tesseract` or provider OCR), `parse_status=partial`, page image
  retained for visual citation.
- Encrypted/permission-restricted: `FILE_ENCRYPTED` (never attempt to break).
- Page cap: 500 pages per document (configurable); beyond that, split into parts with a shared document id.

## 6. DOCX / PPTX

- Paragraph styles map to headings; list levels preserved.
- Tables → markdown with header row detection.
- Comments/tracked changes: ignored by default (option to include accepted text only).
- PPTX: one "page" per slide; speaker notes included as a separate block; images as assets.

## 7. HTML and Markdown

- Strip `script`, `style`, `nav`, `footer`, cookie banners (configurable selectors).
- Preserve heading hierarchy (`h1..h6`), lists, tables, code blocks, and link text.
- Resolve relative links against the base URL; keep absolute URLs as metadata (future crawl seeds).
- Markdown: parse to AST so code fences and tables are not corrupted by chunking.
- Boilerplate detection: repeated blocks across pages of the same sitemap are dropped (hash frequency).

## 8. CSV / JSON / OpenAPI

- CSV: detect delimiter/quote/encoding; header row required; each row becomes a "record"; chunking keeps header
  context per window; column names are part of every chunk text.
- JSON: flatten to key paths; large arrays windowed; retain `$` paths in metadata for citation.
- OpenAPI: one document per operation (method + path) plus an overview; schemas summarized, not dumped raw.

## 9. Normalization

| Step | Rule |
|---|---|
| Unicode | NFKC; remove zero-width and bidi control chars |
| Whitespace | collapse runs; preserve paragraph boundaries |
| Line breaks | de-hyphenate line-wrapped words |
| Encoding | detect (utf-8 with replacement); reject binary garbage |
| Language | detect; store `language` |
| Duplicates | content hash; identical hash → link version, no new vectors |
| PII (optional) | redact emails/phones/card-like patterns when the org enables it |

## 10. Metadata extracted

`title, authors, created_at, modified_at, page_count, language, section_path, headings[], tables[], links[],
images[], source_url, checksum, parser, parser_version, parse_confidence`.

## 11. Error taxonomy

| Code | Cause | Retry | User-visible |
|---|---|---|---|
| `FILE_TYPE_NOT_ALLOWED` | Unsupported/mismatched type | no | yes |
| `FILE_CORRUPTED` | Parser exception | no | yes |
| `FILE_ENCRYPTED` | Password/permissions | no | yes |
| `FILE_TOO_LARGE` | Caps exceeded | no | yes |
| `SOURCE_UNREACHABLE` | DNS/connect/4xx/5xx | yes (5xx) | yes |
| `EGRESS_BLOCKED` | SSRF policy | no | yes |
| `PARSE_ERROR` | Structural failure | no | yes |
| `PARSE_PARTIAL` | OCR/columns/tables degraded | no | warning flag |
| `PARSE_TIMEOUT` | Page/time cap | yes once | yes |
| `EMBEDDING_FAILED` | Provider | yes | yes |

## 12. Reprocessing

`POST /v1/sources/{id}/reingest` creates a new job; if content hash is unchanged and `force=false`, the job
short-circuits with `DUPLICATE_DOCUMENT` and reports "no changes". `force=true` re-parses (useful after parser
upgrades) and creates a new document version, reusing embeddings for identical chunk hashes.

## 13. Testing

- Fixture corpus: 40+ files (text PDF, scanned PDF, two-column, table-heavy, DOCX with styles, PPTX, HTML with
  nav, Markdown with code, CSV, JSON, OpenAPI, broken PDF, encrypted PDF, 30 MB file).
- Assertions per fixture: page count, heading detection, table preservation, no script text, page references.
- SSRF suite: private IP, redirect to metadata, DNS rebinding, `file://`, gopher.
- Idempotency: reprocess unchanged → no duplicate chunks.

## 14. Acceptance criteria

- [ ] Every supported format has a contract test with a real fixture.
- [ ] Page/section references survive into chunks and citations.
- [ ] No fetched content is executed or rendered unsanitized.
- [ ] Every failure maps to a code in §11 and is visible in Studio.
- [ ] Reprocessing is idempotent unless forced.

## 15. Related documents

[35](35-KNOWLEDGE-ENGINE-ARCHITECTURE.md) · [37](37-CHUNKING-AND-METADATA-EXTRACTION.md) ·
[38](38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) · [40](40-KNOWLEDGE-SOURCE-CONNECTORS.md) ·
[63](../11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md)

## 16. References

- PyMuPDF — https://pymupdf.readthedocs.io/ · python-docx — https://python-docx.readthedocs.io/
- HTML parsing — https://github.com/rushter/selectolax
- SSRF guidance — https://owasp.org/www-community/attacks/Server_Side_Request_Forgery
