# Implementation Status

**Status:** Living. Updated at the end of every work session that changes state.

**Reading rule:** "Documented" means a normative spec exists. "Implemented" means code exists on the main branch.
"Tests" means the module's automated tests pass in CI. Nothing here is inferred from a merged PR alone — it is
evidence-linked.

---

## 1. Snapshot

| Field | Value |
|---|---|
| Phase | Vertical slice implemented and verified **locally** against live Supabase (Tokyo), Upstash Redis, Clerk dev, Gemini and NVIDIA NIM (see §1.1) |
| Release | none (not deployed; nothing published to npm) |
| Environments live | none. Local: API :8000, website/dashboard :3000, demo app :3001 |
| Open P1/P2 security findings | none known. Credentials were pasted in chat and must be rotated before any deploy |
| Blocking dependencies | Render + Vercel deploy, npm login owning the `@vistra` scope |
| Next milestone | Deploy (Render API, Vercel web + demo), register deployed origins, run smoke |

### 1.1 Implemented slice (2026-11-14), with evidence

Status here means "runs locally with live services". Nothing is deployed.

| Area | What exists | Evidence (command → result) |
|---|---|---|
| Schema + RLS | `supabase/migrations/0001–0007`; 27 public tables, RLS enabled and forced; LangGraph checkpoints in `agent_state` (no tenant-role grants); demo app data in `demo` | `scripts/migrate.py` twice → second run all `skip`; `scripts/rls_check.py` → `missing/unforced RLS: none`, tenant role usage `(False, False)` |
| Tenancy | `tenant_conn` switches to non-bypass role `vistra_app` + `app.organization_id` | `test_rls_blocks_other_tenant_rows`, `test_rls_blocks_cross_tenant_write`, `test_retrieval_never_crosses_tenants`, `test_other_orgs_run_is_404` |
| Identity | Clerk RS256 JWT verified via JWKS (iss, exp, azp, 30 s leeway); org + default app + KB provisioned on first sign-in | `scripts/check_backend.py` with a real Clerk dev session → `/v1/me` 200, app/key/tool-secret created, revoked key → 401 |
| SDK sessions | API key (SHA-256, scopes) → HS256 `aud=sdk` token, 900 s, Origin checked against `application_domains` | wrong origin → 403 `ORIGIN_NOT_ALLOWED`; `test_expired_session_token`, `test_token_wrong_audience_and_signature` |
| Agent runtime | LangGraph `StateGraph` + `AsyncPostgresSaver` (ADR-029); approval is `interrupt()` | `scripts/durable_approval.py`: proposal → **API process killed and restarted** → approve → executed + verified from checkpoint (run `4fc5b381…`) |
| Models | LangChain `ChatGoogleGenerativeAI` (gemini-3.5-flash / -lite), `GoogleGenerativeAIEmbeddings` (gemini-embedding-001, 768-d), `ChatOpenAI` → NVIDIA NIM (nemotron-3.5-lightning-30b-a3b); router owns retry ×2, breaker, fallback, `model_usage` | `scripts/lc_probe.py` live; forced primary failure → answer served by `nvidia` with citation; `test_fallback_on_retryable_failure_is_traced`, `test_invalid_credentials_fail_closed_without_fallback`, `test_no_silent_capability_downgrade` |
| Knowledge | md/txt/html/url (SSRF-checked) + Supabase Storage upload; heading-aware parent/child chunks; hybrid vector+FTS RRF in SQL; citation validation; insufficient-evidence refusal | `scripts/storage_setup.py` → private bucket, presign → upload → indexed, anonymous read 400; `test_sse_happy_path_with_citations_and_persistence`, `test_absent_topic_returns_insufficient_evidence` |
| Redis | Upstash: ingestion queue + embedded/standalone worker (ADR-030), rate limits, approval lock; `/readyz` reports it | `check_backend.py` → source `execution: queued`, job `succeeded` via worker; `/readyz` → `"redis":"ok"` |
| Actions | policy (default deny), approval bound to args SHA-256, HMAC-signed replay-proof tool calls, independent verification | `test_action_requires_approval_then_executes_and_verifies`, `test_verification_failure_is_reported_not_hidden`, `test_changed_arguments_invalidate_approval`, `test_cancelled_run_never_reaches_side_effect` (8/8 action tests pass on the LangGraph path) |
| Ghost Cursor | `packages/ghost-cursor`: normative targeting order, shadow-DOM overlay, reasoning bubble, reduced motion, `destroy()` | `pnpm --filter @boredooms/vistra-ghost-cursor test` → 7 passed |
| SDK | `packages/sdk-core`; builds ESM + CJS + d.ts (tsup) | `pnpm pack --dry-run` OK. **Not published**: npm not logged in |
| Website + dashboard | `apps/web`: landing (GSAP, Lenis, live cursor demo, custom pointer), docs, Clerk auth, dashboard (overview charts, applications, keys, knowledge + retrieval playground, runs, install), corner assistant blob using the real SDK | `pnpm -r typecheck` clean; landing screenshots checked. Signed-in dashboard pages not exercised in a browser (backend calls verified with `check_backend.py`) |
| Demo app | `apps/demo` (Acme Workspace) with signed tool endpoints on its own Postgres schema | Playwright beats 1–5 passed in an earlier run; beat 6 fixed after that run and not re-run |

| Configurable agents | `agents` / `agent_versions` (0008), versioned editor, publish/rollback, per-run `agent_version_id`, capability gating, per-tool policy, strictness thresholds (ADR-031) | `scripts/check_agents.py` → v2 with `create_project: deny` published → live run `POLICY_DENIED "Agent policy denies create_project"`, run recorded v2; unknown tool → 422; rollback to v1 |
| Dashboard (redesign) | Collapsible sidebar (sections + icon rail, Ctrl/Cmd+B, mobile drawer), topbar with period, refresh and CSV export; Overview, Analytics, Agents (+ live playground through the SDK), Knowledge, Applications, Runs, Logs (events + audit), API keys, Install | `node tests/e2e/dashboard-flow.mjs` → **29/29**: Clerk sign-in, every page, origin add, key created and used to mint a session (201), source indexed via worker, agent version published and answered in playground with citation, logs show `run.completed` + `agent.published`, CSV export, rail 68px, drawer, 0 console errors |
| Website | Route group `(home)`: `/`, `/features`, `/packages`, `/security`, `/docs`; GSAP word reveal, Lenis, custom pointer, live Ghost Cursor section, corner assistant | `next build` → 17 routes compiled; e2e pages all 200 |
| Clerk | `@clerk/nextjs` 7.10 (Core 3), `<Show>`, provider inside `<body>`, `auth.protect()` in dashboard layout (ADR-032) | sign-up/in pages render; ticket sign-in lands on `/dashboard` in e2e |
| Load | `scripts/stress.py` | 30 health, 40 mints, 30 searches, 20 cross-tenant probes (all 404), 10 bad origins (all 403), 12 concurrent agent runs all `run.completed` (p50 40 s from this machine to the Tokyo pooler; first token p50 36 s). Latency is dominated by ~0.3–0.7 s DB round trips from the dev machine |
| Observability | Structured JSON logs per graph node (start/done/fail + ms), provider call, policy decision, retrieval, ingestion stage; SSE event persistence moved to an ordered background writer | stress p50 improved 57 s → 40 s after the writer change |

Not done: deployment (Render/Vercel), npm publish (blocked on npm browser 2FA approval; tarballs verified with `pnpm pack`), Studio-lite beyond the dashboard run view, screenshot/vision capture, reranker,
webhooks, MCP, voice, checkpoint retention cleanup, the full test suite re-run after the LangGraph migration (only the
action/approval/fallback subset and the unit tests were re-run).

## 2. Module status

Legend: **C** = complete · **P** = partial · **—** = not started · **N/A** = not applicable yet.

| Module | Documentation | Implementation | Tests | Status | Owner doc |
|---|---|---|---|---|---|
| Repository & toolchain | C | — | — | Not started | [11](02-system-architecture/11-REPOSITORY-AND-MONOREPO-STRUCTURE.md) |
| Shared types / API client | C | — | — | Not started | [14](02-system-architecture/14-TECHNOLOGY-STACK-AND-DEPENDENCIES.md) |
| Supabase schema & migrations | C | — | — | Not started | [16](03-database-and-identity/16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md) |
| RLS & privileged paths | C | — | — | Not started | [19](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) |
| Clerk authentication | C | — | — | Not started | [17](03-database-and-identity/17-CLERK-AUTHENTICATION.md) |
| Tenancy & RBAC | C | — | — | Not started | [18](03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |
| Storage & lifecycle | C | — | — | Not started | [20](03-database-and-identity/20-STORAGE-AND-FILE-LIFECYCLE.md) |
| Backend core (API v1) | C | — | — | Not started | [22](04-backend-and-api/22-BACKEND-ARCHITECTURE.md) |
| API contracts / OpenAPI | C | — | — | Not started | [23](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) |
| Sessions & conversations | C | — | — | Not started | [24](04-backend-and-api/24-SESSION-AND-CONVERSATION-MANAGEMENT.md) |
| Realtime (SSE/WS) | C | — | — | Not started | [25](04-backend-and-api/25-REALTIME-AND-EVENT-ARCHITECTURE.md) |
| Jobs & workers | C | — | — | Not started | [26](04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md) |
| Error handling & resilience | C | — | — | Not started | [27](04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) |
| Provider abstraction | C | — | — | Not started | [28](05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md) |
| Gemini adapter | C | — | — | Not started | [29](05-ai-and-model-infrastructure/29-GEMINI-PRIMARY-INTEGRATION.md) |
| NVIDIA fallback | C | — | — | Not started | [30](05-ai-and-model-infrastructure/30-NVIDIA-NIM-FALLBACK-INTEGRATION.md) |
| Model routing | C | — | — | Not started | [31](05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) |
| Prompt & context | C | — | — | Not started | [32](05-ai-and-model-infrastructure/32-PROMPT-AND-CONTEXT-MANAGEMENT.md) |
| Embeddings | C | — | — | Not started | [33](05-ai-and-model-infrastructure/33-EMBEDDING-AND-MULTIMODAL-MODELS.md) |
| AI evaluation & cost | C | — | — | Not started | [34](05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md) |
| Knowledge ingestion | C | — | — | Not started | [36](06-knowledge-and-rag/36-DOCUMENT-INGESTION-AND-PARSING.md) |
| Chunking | C | — | — | Not started | [37](06-knowledge-and-rag/37-CHUNKING-AND-METADATA-EXTRACTION.md) |
| Hybrid retrieval | C | — | — | Not started | [38](06-knowledge-and-rag/38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) |
| Citations & grounding | C | — | — | Not started | [39](06-knowledge-and-rag/39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md) |
| Knowledge ACLs | C | — | — | Not started | [41](06-knowledge-and-rag/41-KNOWLEDGE-PERMISSIONS-AND-TENANT-ISOLATION.md) |
| Agent runtime | C | — | — | Not started | [43](07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md) |
| Specialized agents | C | — | — | Not started | [44](07-agents-and-execution/44-SPECIALIZED-AGENT-ARCHITECTURE.md) |
| Tool registry | C | — | — | Not started | [45](07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md) |
| Workflow engine | C | — | — | Not started | [46](07-agents-and-execution/46-WORKFLOW-ENGINE-AND-STATE-MACHINE.md) |
| Policy & approvals | C | — | — | Not started | [47](07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) |
| Traces & memory | C | — | — | Not started | [48](07-agents-and-execution/48-AGENT-MEMORY-AND-EXECUTION-TRACES.md) |
| Visual context engine | C | — | — | Not started | [49](08-visual-and-ghost-cursor/49-VISUAL-CONTEXT-ENGINE.md) |
| DOM/a11y inspection | C | — | — | Not started | [50](08-visual-and-ghost-cursor/50-DOM-AND-ACCESSIBILITY-INSPECTION.md) |
| Ghost Cursor package | C | — | — | Not started | [51](08-visual-and-ghost-cursor/51-GHOST-CURSOR-ENGINE.md) |
| Cursor motion & targeting | C | — | — | Not started | [52](08-visual-and-ghost-cursor/52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md) |
| Guide verification | C | — | — | Not started | [53](08-visual-and-ghost-cursor/53-VISUAL-GUIDANCE-AND-VERIFICATION.md) |
| Core SDK | C | — | — | Not started | [54](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) |
| React SDK | C | — | — | Not started | [54](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) |
| Widget | C | — | — | Not started | [55](09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md) |
| Public API/developer platform | C | — | — | Not started | [56](09-sdk-and-integrations/56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md) |
| MCP/webhooks | C | — | — | Not started | [57](09-sdk-and-integrations/57-MCP-WEBHOOKS-AND-EXTERNAL-INTEGRATIONS.md) |
| SDK publishing | C | — | — | Not started | [58](09-sdk-and-integrations/58-SDK-VERSIONING-AND-PUBLISHING.md) |
| Studio | C | — | — | Not started | [59](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md) |
| Demo application | C | — | — | Not started | [60](10-applications-and-experience/60-DEMO-APPLICATION-AND-END-TO-END-SCENARIOS.md) |
| Analytics/admin | C | — | — | Not started | [61](10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md) |
| Test infrastructure | C | — | — | Not started | [62](11-quality-security-and-operations/62-TESTING-STRATEGY.md) |
| Observability | C | — | — | Not started | [64](11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md) |
| CI/CD | C | — | — | Not started | [72](12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md) |
| Deployments | C | — | — | Not started | [69](12-deployment-and-release/69-RENDER-BACKEND-DEPLOYMENT.md), [70](12-deployment-and-release/70-VERCEL-FRONTEND-DEPLOYMENT.md) |
| Documentation system | C | N/A | C (validator) | Complete | [README.md](README.md) |

## 3. Blocking dependencies

| Dependency | Blocks | Needed for |
|---|---|---|
| Clerk project (dev + prod) | auth, tenancy | Phase 3 |
| Supabase project (dev + prod) | everything data | Phase 2 |
| Gemini API key | AI, embeddings, vision | Phase 6 |
| NVIDIA API key | fallback verification | Phase 6 |
| Managed Redis | jobs, rate limits, cache | Phase 5 |
| Render + Vercel accounts | deployment | Phase 13 |
| Domain + DNS control | CORS, callbacks | Phase 13 |
| Customer test host API | tool verification | Phase 7, 11 |

## 4. Known technical debt (documentation-level)

| Item | Impact | Resolution |
|---|---|---|
| Provider model IDs are placeholders | routing config must be validated at boot | verify against live catalogs before Phase 6 |
| Render plan limits (timeouts, streaming) quoted generically | capacity planning uncertainty | confirm exact plan limits at Phase 13 |
| Reranker defaults unmeasured | retrieval quality tuning pending | tune in Phase 8 with golden set |
| Cost constants are estimates | budget accuracy | replace with measured values after Phase 6 |
| Studio page-by-page wireframes out of scope | UI detail left to design | design pass before Phase 12 |
| Open questions Q1–Q6 in doc 10 | possible rework | resolve in Phase 0 |

## 5. Security risks to re-check at each phase

- [ ] RLS enabled and forced on every tenant table.
- [ ] No service-role key in any client bundle.
- [ ] Origin allowlisting enforced server-side.
- [ ] Tool execution gated by policy + verification.
- [ ] SSRF filtering on all ingestion/webhook/MCP egress.
- [ ] Prompt-injection corpus in CI.
- [ ] Retention jobs actually deleting bytes.

## 6. Update protocol

When you finish work:

1. Change the row's Implementation/Tests cells with evidence (PR, workflow run, test name).
2. Never mark "complete" without passing tests in CI.
3. Add new blockers or debt immediately.
4. Update the snapshot at the top.
5. If a phase gate is met, update [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) status.

## Related documents

[IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) · [steering/DEFINITION-OF-DONE.md](steering/DEFINITION-OF-DONE.md) ·
[steering/AGENTS.md](steering/AGENTS.md) · [DOCUMENTATION-MAP.md](DOCUMENTATION-MAP.md)
