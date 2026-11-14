# Requirement Traceability Matrix

**Status:** Living. Every product requirement traces to architecture, module, data, API, test, and documentation.
**Use:** before marking work done, find the requirement's row and confirm each column has a real target.

Chain:

```text
PRODUCT REQUIREMENT → ARCHITECTURE → MODULE → DATABASE → API → TEST → DOCUMENT
```

---

## 1. How to read

- **PR** — requirement id from [02](01-product-and-ideation/02-PRODUCT-REQUIREMENTS.md).
- **Module** — code owner from [12](02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md).
- **Tables** — from [16](03-database-and-identity/16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md); every tenant table carries
  `organization_id`.
- **API** — from [23](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md).
- **Test** — suite path from [62](11-quality-security-and-operations/62-TESTING-STRATEGY.md).
- **AC** — acceptance criteria range from [08](01-product-and-ideation/08-ACCEPTANCE-CRITERIA.md).

---

## 2. Identity, tenancy, security

| PR | Requirement (short) | Architecture | Module | Tables | API | Tests | AC | Doc |
|---|---|---|---|---|---|---|---|---|
| PR-01 | Clerk sign-in → usable session | [09](02-system-architecture/09-SYSTEM-ARCHITECTURE.md) §4 | `core/auth`, `users` | `users` | all user routes (`Authorization: Bearer`) | `tests/auth/*` | AC-001–003 | [17](03-database-and-identity/17-CLERK-AUTHENTICATION.md) |
| PR-02 | Organization = tenant boundary | [09](02-system-architecture/09-SYSTEM-ARCHITECTURE.md) §5 | `core/tenancy` | `organizations`, `organization_members` | `X-Organization-Id` on every user route | `tests/rls/tenant_*` | AC-004–005 | [18](03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |
| PR-03 | Roles confer testable permissions | [12](02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md) §6 | `core/security`, `organizations` | `organization_members` | permission per route (§4 of 23) | `tests/auth/permissions_*` | AC-005–006 | [18](03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |
| PR-04 | API key (server) + short-lived sdk token (browser) | [13](02-system-architecture/13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md) §3 | `identity`, `applications` | `api_keys`, `application_sessions` | `POST /v1/sdk/sessions`, `/refresh`, `/revoke` | `tests/auth/sdk_token_*` | AC-007 | [54](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md), [18](03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |
| PR-05 | Cross-tenant access impossible | [19](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) §3 | all | all tenant tables | all | `tests/rls/adversarial_a1_a16` | AC-006 | [19](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md), [63](11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md) |
| PR-26 | API keys scoped, rotatable, hashed | [17](03-database-and-identity/17-CLERK-AUTHENTICATION.md) §9 | `applications` | `api_keys` | `GET/POST /v1/applications/{id}/keys`, `.../rotate` | `tests/applications/keys_*` | AC-012 | [18](03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |

## 3. Applications and SDK

| PR | Requirement | Architecture | Module | Tables | API | Tests | AC | Doc |
|---|---|---|---|---|---|---|---|---|
| PR-06 | Register app, allowlist origins | [09](02-system-architecture/09-SYSTEM-ARCHITECTURE.md) §5 | `applications` | `applications`, `application_domains` | `/v1/projects`, `/v1/applications`, `/domains` | `tests/applications/*` | AC-010–011 | [56](09-sdk-and-integrations/56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md) |
| PR-07 | JS/React SDK init → stream → teardown | [13](02-system-architecture/13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md) §4 | `packages/sdk-core` | `application_sessions`, `sessions`, `session_messages` | `/v1/sdk/*` | `packages/sdk-core/tests` | AC-070–072 | [54](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) |
| PR-08 | Vanilla + React parity | [12](02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md) §8 | `sdk-core`, `sdk-react` | — | same | `packages/sdk-react/tests` | AC-073 | [54](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) |
| PR-09 | Widget isolated, accessible, no CLS | [09](02-system-architecture/09-SYSTEM-ARCHITECTURE.md) §7 | `packages/widget` | — | `/v1/sdk/config` | `tests/visual/widget_*`, a11y suite | AC-074 | [55](09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md) |

## 4. Visual context and guidance

| PR | Requirement | Architecture | Module | Tables | API | Tests | AC | Doc |
|---|---|---|---|---|---|---|---|---|
| PR-10 | Authorized visual context + redaction | [13](02-system-architecture/13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md) §5 | `visual` | `session_events` (context refs), storage `screenshots` | `POST /v1/sdk/context` | `apps/api/tests/visual/redaction_*` | AC-020 | [49](08-visual-and-ghost-cursor/49-VISUAL-CONTEXT-ENGINE.md) |
| PR-11 | Select element → contextual answer | [13](02-system-architecture/13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md) §5 | `visual`, `orchestration` | `session_events`, `agent_runs` | `POST /v1/sdk/messages` (+ `context_ref`) | `tests/e2e/element_question` | AC-021–022 | [50](08-visual-and-ghost-cursor/50-DOM-AND-ACCESSIBILITY-INSPECTION.md) |
| PR-12 | Vision never silently downgraded | [31](05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) §5 | `core/ai` router | `model_usage` | internal | `apps/api/tests/providers/capability_deny` | AC-023 | [31](05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) |
| PR-21 | Semantic target resolution order | [13](02-system-architecture/13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md) §7 | `packages/ghost-cursor` targeting | `guide_flows` | `POST /v1/sdk/guides` | `packages/ghost-cursor/tests/targeting_*` | AC-060–062 | [52](08-visual-and-ghost-cursor/52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md) |
| PR-22 | Scroll/DOM/resize/cancel/reduced-motion + states | [13](02-system-architecture/13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md) §7 | `ghost-cursor` state machine | `guide_flows` | `POST /v1/sdk/guides/{id}/steps/{i}` | `ghost-cursor/tests/states_*` | AC-063–065 | [51](08-visual-and-ghost-cursor/51-GHOST-CURSOR-ENGINE.md) |
| PR-23 | Guide ≠ Do; no inferred action | [53](08-visual-and-ghost-cursor/53-VISUAL-GUIDANCE-AND-VERIFICATION.md) §4 | `visual`, `tools` | `guide_flows`, `tool_invocations` | guide vs tool endpoints | `tests/e2e/guide_no_action` | AC-066 | [53](08-visual-and-ghost-cursor/53-VISUAL-GUIDANCE-AND-VERIFICATION.md) |

## 5. Knowledge and RAG

| PR | Requirement | Architecture | Module | Tables | API | Tests | AC | Doc |
|---|---|---|---|---|---|---|---|---|
| PR-13 | Create KBs, add all source types | [35](06-knowledge-and-rag/35-KNOWLEDGE-ENGINE-ARCHITECTURE.md) §4 | `knowledge`, `ingestion` | `knowledge_bases`, `knowledge_collections`, `knowledge_sources`, `documents` | `/v1/knowledge-bases`, `/collections/{id}/sources` | `services/ingestion/tests/formats_*` | AC-030–031 | [36](06-knowledge-and-rag/36-DOCUMENT-INGESTION-AND-PARSING.md), [40](06-knowledge-and-rag/40-KNOWLEDGE-SOURCE-CONNECTORS.md) |
| PR-14 | Async, resumable, reprocessable ingestion | [26](04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md) §4 | `ingestion` worker | `ingestion_jobs`, `document_versions` | `GET /v1/ingestion-jobs/{id}`, `POST /v1/sources/{id}/reingest` | `services/ingestion/tests/resume_*` | AC-032–033 | [36](06-knowledge-and-rag/36-DOCUMENT-INGESTION-AND-PARSING.md) |
| PR-15 | Hybrid, permission-filtered, reranked retrieval | [13](02-system-architecture/13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md) §6 | `retrieval` | `document_chunks`, `embeddings` | `POST /v1/knowledge/search` | `apps/api/tests/knowledge/hybrid_*` | AC-034–035 | [38](06-knowledge-and-rag/38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) |
| PR-16 | Citations, uncited rejected, insufficient evidence | [39](06-knowledge-and-rag/39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md) §6 | `retrieval`, `orchestration` | `session_messages` (citations), `evaluation_results` | `POST /v1/sdk/messages` response | `tests/e2e/citation_validity` | AC-036 | [39](06-knowledge-and-rag/39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md) |

## 6. Agents and execution

| PR | Requirement | Architecture | Module | Tables | API | Tests | AC | Doc |
|---|---|---|---|---|---|---|---|---|
| PR-17 | Classify → plan → route, persisted & resumable | [13](02-system-architecture/13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md) §4 | `orchestration`, `agent-worker` | `agent_runs`, `agent_run_steps`, `agents`, `agent_versions` | `GET /v1/runs/{id}`, `/steps`, `/resume` | `services/agent-worker/tests/orchestrator_*` | AC-040–042 | [43](07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md), [44](07-agents-and-execution/44-SPECIALIZED-AGENT-ARCHITECTURE.md) |
| PR-18 | Tool registry, policy gate, approval | [12](02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md) §5 | `tools`, `approvals` | `tools`, `tool_versions`, `agent_policies`, `approvals` | `/v1/applications/{app}/tools`, `/v1/approvals/{id}/decide` | `agent-worker/tests/policy_*`, `approval_*` | AC-043–045 | [45](07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md), [47](07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) |
| PR-19 | Idempotent, independently verified side effects | [13](02-system-architecture/13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md) §4 | `tools` executor + verifier | `tool_invocations` | internal | `agent-worker/tests/verify_*`, `idempotency_*` | AC-046–047 | [47](07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) |
| PR-20 | Multi-step workflows, compensation | [46](07-agents-and-execution/46-WORKFLOW-ENGINE-AND-STATE-MACHINE.md) §5 | `workflows` | `workflows`, `workflow_steps`, `agent_run_steps` | `/v1/applications/{app}/workflows`, `POST /v1/workflows/{id}/runs` | `agent-worker/tests/workflow_*` | AC-048 | [46](07-agents-and-execution/46-WORKFLOW-ENGINE-AND-STATE-MACHINE.md) |
| PR-28 | Runs inspectable end-to-end | [48](07-agents-and-execution/48-AGENT-MEMORY-AND-EXECUTION-TRACES.md) §5 | `analytics`, `sessions` | `agent_runs`, `agent_run_steps`, `tool_invocations`, `audit_events` | `GET /v1/sessions/{id}/events` | `tests/e2e/studio_run_view` | AC-090 | [48](07-agents-and-execution/48-AGENT-MEMORY-AND-EXECUTION-TRACES.md) |

## 7. Developer platform

| PR | Requirement | Architecture | Module | Tables | API | Tests | AC | Doc |
|---|---|---|---|---|---|---|---|---|
| PR-24 | Versioned REST + OpenAPI 3.1 + typed client | [23](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) §3 | `api/v1`, `packages/shared-types` | — | all `/v1/*` | `apps/api/tests/contract/*` | AC-080–082 | [23](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md), [56](09-sdk-and-integrations/56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md) |
| PR-25 | Outbound webhooks + MCP | [25](04-backend-and-api/25-REALTIME-AND-EVENT-ARCHITECTURE.md) §6 | `webhooks`, `mcp` | `webhook_endpoints`, `webhook_deliveries`, `integrations` | `/v1/webhook-endpoints`, `/v1/webhook-deliveries`, `/v1/mcp-servers` | `services/webhook-worker/tests/*`, `mcp_*` | AC-083–084 | [57](09-sdk-and-integrations/57-MCP-WEBHOOKS-AND-EXTERNAL-INTEGRATIONS.md) |

## 8. AI infrastructure

| PR | Requirement | Architecture | Module | Tables | API | Tests | AC | Doc |
|---|---|---|---|---|---|---|---|---|
| PR-30 | Provider abstraction, capability routing, observable fallback | [28](05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md) §4 | `core/ai` | `model_usage` | internal | `apps/api/tests/providers/fallback_*` | AC-050–053 | [28](05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md), [31](05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) |
| PR-31 | Versioned models/prompts/config | [32](05-ai-and-model-infrastructure/32-PROMPT-AND-CONTEXT-MANAGEMENT.md) §3 | `core/ai` registry | `agent_versions` (prompt ref) | internal | `providers/registry_*`, prompt snapshot tests | AC-054 | [32](05-ai-and-model-infrastructure/32-PROMPT-AND-CONTEXT-MANAGEMENT.md) |
| PR-32 | Evaluation before release | [34](05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md) §6 | `evaluations` worker | `evaluation_suites`, `evaluation_results` | `/v1/evaluation-suites`, `POST /v1/evaluation-suites/{id}/runs` | `eval.yml` gates, `tests/eval/*` | AC-051 | [34](05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md), [42](06-knowledge-and-rag/42-RAG-EVALUATION-AND-QUALITY.md) |
| PR-29 | Metering per org/app/provider/model | [66](11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md) §5 | `usage`, `billing` | `usage_records`, `model_usage` | `GET /v1/usage`, `GET /v1/usage/export` | `tests/ops/usage_reconcile_*` | AC-091 | [61](10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md) |

## 9. Studio, demo, operations

| PR | Requirement | Architecture | Module | Tables | API | Tests | AC | Doc |
|---|---|---|---|---|---|---|---|---|
| PR-27 | Studio pages on real APIs | [59](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md) §4 | `apps/studio` | reads all | §4 of 23 | `apps/studio/tests`, `tests/e2e/studio_*` | AC-090–093 | [59](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md) |
| PR-35 | Demo exercises the full loop | [60](10-applications-and-experience/60-DEMO-APPLICATION-AND-END-TO-END-SCENARIOS.md) §5 | `apps/demo` | `projects`, `sessions`, `agent_runs`, `tool_invocations` | SDK + user routes | `tests/e2e/j1_j9` | AC-092 | [60](10-applications-and-experience/60-DEMO-APPLICATION-AND-END-TO-END-SCENARIOS.md) |
| PR-33 | Deploy + CI/CD + migrations + rollback | [69](12-deployment-and-release/69-RENDER-BACKEND-DEPLOYMENT.md) §10 | infra | — | `/healthz`, `/readyz` | `tests/ops/deploy_smoke` | AC-100–101 | [69](12-deployment-and-release/69-RENDER-BACKEND-DEPLOYMENT.md), [72](12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md) |
| PR-34 | Observable, alerting, runbook | [64](11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md) §5 | `core/observability` | `error_events`, `audit_events` | `/metrics` (internal) | `tests/ops/alerts_*`, alert drill | AC-102 | [64](11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md), [75](12-deployment-and-release/75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md) |

---

## 10. Acceptance-criteria coverage

| AC range | Requirements | Primary suite |
|---|---|---|
| AC-001–006 | PR-01, 02, 03, 05 | `tests/auth`, `tests/rls` |
| AC-007 | PR-04 | `tests/auth/sdk_*` |
| AC-010–013 | PR-06, 26 | `tests/applications` |
| AC-020–023 | PR-10, 11, 12 | `tests/visual`, `providers` |
| AC-030–036 | PR-13, 14, 15, 16 | `services/ingestion`, `tests/knowledge` |
| AC-040–048 | PR-17, 18, 19, 20 | `services/agent-worker` |
| AC-050–054 | PR-30, 31, 32 | `tests/providers`, `tests/eval` |
| AC-060–066 | PR-21, 22, 23 | `packages/ghost-cursor` |
| AC-070–074 | PR-07, 08, 09 | `packages/sdk-*`, `tests/visual` |
| AC-080–084 | PR-24, 25 | `tests/contract`, `webhook-worker` |
| AC-090–093 | PR-27, 28, 29 | `tests/e2e`, `tests/ops` |
| AC-100–102 | PR-33, 34, 35 | `tests/ops`, CI workflows |

## 11. Functional-requirement index

`FR-*` items in [05](01-product-and-ideation/05-FUNCTIONAL-REQUIREMENTS.md) are grouped by module and each carries a
`PR-*` parent. When a `FR-*` has no row here, it inherits its parent's row; when it deviates (extra behavior,
different table), add a row.

| FR prefix | Area | Parent PRs | Owner doc |
|---|---|---|---|
| `FR-IDN-*` | identity/auth | PR-01, 04, 26 | [17](03-database-and-identity/17-CLERK-AUTHENTICATION.md) |
| `FR-ORG-*` | orgs/tenancy | PR-02, 03 | [18](03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |
| `FR-APP-*` | applications | PR-06 | [56](09-sdk-and-integrations/56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md) |
| `FR-SDK-*` | SDK/widget | PR-07, 08, 09 | [54](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) |
| `FR-VIS-*` | visual context | PR-10, 11, 12 | [49](08-visual-and-ghost-cursor/49-VISUAL-CONTEXT-ENGINE.md) |
| `FR-GUI-*` | cursor/guidance | PR-21, 22, 23 | [51](08-visual-and-ghost-cursor/51-GHOST-CURSOR-ENGINE.md) |
| `FR-KNW-*` | knowledge | PR-13, 14, 15, 16 | [35](06-knowledge-and-rag/35-KNOWLEDGE-ENGINE-ARCHITECTURE.md) |
| `FR-AGT-*` | agents/tools/workflows | PR-17, 18, 19, 20 | [43](07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md) |
| `FR-API-*` | public API/integrations | PR-24, 25 | [23](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) |
| `FR-AI-*` | providers/routing | PR-30, 31, 32 | [28](05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md) |
| `FR-ADM-*` | studio/admin/usage | PR-27, 28, 29 | [59](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md) |
| `FR-OPS-*` | deploy/observe | PR-33, 34, 35 | [69](12-deployment-and-release/69-RENDER-BACKEND-DEPLOYMENT.md) |

## 12. Nonfunctional coverage

| NFR area | Requirement | Verified by | Doc |
|---|---|---|---|
| Latency (first token) | [06](01-product-and-ideation/06-NONFUNCTIONAL-REQUIREMENTS.md) | k6 + provider histograms | [65](11-quality-security-and-operations/65-PERFORMANCE-AND-SCALABILITY.md) |
| Retrieval recall | [06](01-product-and-ideation/06-NONFUNCTIONAL-REQUIREMENTS.md) | golden set in CI | [42](06-knowledge-and-rag/42-RAG-EVALUATION-AND-QUALITY.md) |
| Tenant isolation | [06](01-product-and-ideation/06-NONFUNCTIONAL-REQUIREMENTS.md) | RLS suite | [19](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) |
| Availability | [06](01-product-and-ideation/06-NONFUNCTIONAL-REQUIREMENTS.md) | error budget + alerts | [64](11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md) |
| Cost per conversation | [06](01-product-and-ideation/06-NONFUNCTIONAL-REQUIREMENTS.md) | usage reconciliation | [66](11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md) |
| Accessibility | [06](01-product-and-ideation/06-NONFUNCTIONAL-REQUIREMENTS.md) | axe + manual | [55](09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md) |
| Recoverability | [06](01-product-and-ideation/06-NONFUNCTIONAL-REQUIREMENTS.md) | restore drill | [21](03-database-and-identity/21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md) |

## 13. Gaps and rules

- Every PR must have at least one automated test that fails when the requirement regresses. A row with no test is
  an open gap; note it in [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) §4.
- When a requirement is split, add new PR ids to [02](01-product-and-ideation/02-PRODUCT-REQUIREMENTS.md) first,
  then rows here.
- When a table or endpoint is renamed, update this matrix in the same change as [16](03-database-and-identity/16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md)
  or [23](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md).
- Deferred requirements (PR-36+) are listed in [02](01-product-and-ideation/02-PRODUCT-REQUIREMENTS.md) §5 and must
  not appear in implementation code.

## Related documents

[02](01-product-and-ideation/02-PRODUCT-REQUIREMENTS.md) · [05](01-product-and-ideation/05-FUNCTIONAL-REQUIREMENTS.md) ·
[08](01-product-and-ideation/08-ACCEPTANCE-CRITERIA.md) · [12](02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md) ·
[IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) · [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md)
