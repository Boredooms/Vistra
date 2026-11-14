# VISTRA — Engineering Documentation

**Understand. Guide. Execute.**

This directory is the complete engineering foundation for VISTRA: an embeddable visual intelligence, knowledge
retrieval, and autonomous execution platform. It is written to be executed against — by engineers and by coding
agents — module by module, without re-deciding the architecture.

**Status:** Documentation complete, implementation not started. See
[IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md).

---

## 1. What is here

| Group | Documents | Start with |
|---|---|---|
| Steering (normative rules) | 5 | [steering/AGENTS.md](steering/AGENTS.md) |
| Product and ideation | 8 | [01-PRODUCT-VISION.md](01-product-and-ideation/01-PRODUCT-VISION.md) |
| System architecture | 6 | [09-SYSTEM-ARCHITECTURE.md](02-system-architecture/09-SYSTEM-ARCHITECTURE.md) |
| Database and identity | 7 | [15-DATABASE-DESIGN-AND-ERD.md](03-database-and-identity/15-DATABASE-DESIGN-AND-ERD.md) |
| Backend and API | 6 | [22-BACKEND-ARCHITECTURE.md](04-backend-and-api/22-BACKEND-ARCHITECTURE.md) |
| AI and model infrastructure | 7 | [28-AI-PROVIDER-ABSTRACTION.md](05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md) |
| Knowledge and RAG | 8 | [35-KNOWLEDGE-ENGINE-ARCHITECTURE.md](06-knowledge-and-rag/35-KNOWLEDGE-ENGINE-ARCHITECTURE.md) |
| Agents and execution | 6 | [43-AGENT-RUNTIME-AND-ORCHESTRATION.md](07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md) |
| Visual and Ghost Cursor | 5 | [51-GHOST-CURSOR-ENGINE.md](08-visual-and-ghost-cursor/51-GHOST-CURSOR-ENGINE.md) |
| SDK and integrations | 5 | [54-JAVASCRIPT-AND-REACT-SDK.md](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) |
| Applications and experience | 3 | [59-VISTRA-STUDIO-ARCHITECTURE.md](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md) |
| Quality, security, operations | 5 | [62-TESTING-STRATEGY.md](11-quality-security-and-operations/62-TESTING-STRATEGY.md) |
| Deployment and release | 9 | [67-LOCAL-DEVELOPMENT-ENVIRONMENT.md](12-deployment-and-release/67-LOCAL-DEVELOPMENT-ENVIRONMENT.md) |

**75 numbered technical documents + 5 steering documents + 6 control documents = 86 files.**

Control documents:

- [DOCUMENTATION-MAP.md](DOCUMENTATION-MAP.md) — the full index and subsystem routing.
- [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) — the build order with gates.
- [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) — what exists, what is blocked.
- [REQUIREMENT-TRACEABILITY.md](REQUIREMENT-TRACEABILITY.md) — requirement → design → test chains.
- [EXECUTION-PROMPT-5H.md](EXECUTION-PROMPT-5H.md) — timeboxed end-to-end build + deploy + demo prompt.

## 2. Reading paths

**New engineer, day one**
1. [01-PRODUCT-VISION.md](01-product-and-ideation/01-PRODUCT-VISION.md)
2. [09-SYSTEM-ARCHITECTURE.md](02-system-architecture/09-SYSTEM-ARCHITECTURE.md)
3. [10-ARCHITECTURE-DECISIONS.md](02-system-architecture/10-ARCHITECTURE-DECISIONS.md)
4. [67-LOCAL-DEVELOPMENT-ENVIRONMENT.md](12-deployment-and-release/67-LOCAL-DEVELOPMENT-ENVIRONMENT.md)
5. [steering/AGENTS.md](steering/AGENTS.md)

**Backend engineer**
[22](04-backend-and-api/22-BACKEND-ARCHITECTURE.md) → [16](03-database-and-identity/16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md) →
[19](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) → [23](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) →
[27](04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) → [26](04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md)

**AI / retrieval engineer**
[28](05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md) → [31](05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) →
[35](06-knowledge-and-rag/35-KNOWLEDGE-ENGINE-ARCHITECTURE.md) → [37](06-knowledge-and-rag/37-CHUNKING-AND-METADATA-EXTRACTION.md) →
[38](06-knowledge-and-rag/38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) → [39](06-knowledge-and-rag/39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md)

**Agent / safety engineer**
[43](07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md) → [45](07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md) →
[47](07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) → [63](11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md)

**Frontend / SDK engineer**
[54](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) → [55](09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md) →
[51](08-visual-and-ghost-cursor/51-GHOST-CURSOR-ENGINE.md) → [52](08-visual-and-ghost-cursor/52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md) →
[59](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md)

**SRE**
[64](11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md) →
[69](12-deployment-and-release/69-RENDER-BACKEND-DEPLOYMENT.md) → [74](12-deployment-and-release/74-PRODUCTION-RELEASE-AND-ROLLBACK.md) →
[75](12-deployment-and-release/75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md)

**Coding agent**
[steering/AGENTS.md](steering/AGENTS.md) → [steering/CLAUDE.md](steering/CLAUDE.md) →
[DOCUMENTATION-MAP.md](DOCUMENTATION-MAP.md) → the subsystem documents for the task →
[steering/DEFINITION-OF-DONE.md](steering/DEFINITION-OF-DONE.md)

## 3. Terminology (canonical)

These words have exactly one meaning across all documents. A document that uses them differently is wrong.

| Term | Meaning |
|---|---|
| **Organization** | The tenant. Id = Clerk org id (`org_…`). Every scoped row carries `organization_id`. |
| **Project** | A grouping inside an organization. Not an authorization boundary. |
| **Application** | A customer's embedded product. Owns API keys, domains, sessions, agents, tools. |
| **End user** | A user of the customer's application. No VISTRA account. Identified by an opaque `end_user_ref`. |
| **Application session** | An authenticated end-user session (`application_sessions`), with a short-lived token. |
| **Conversation / session** | A thread of messages (`sessions`) inside an application session. |
| **Agent** | A configured behavior (kind + version + prompt + tools + limits). |
| **Agent version** | Immutable configuration referenced by every run. |
| **Run** | One execution of an agent for one request (`agent_runs`). |
| **Step** | An ordered unit inside a run (`agent_run_steps`). |
| **Tool** | A typed, authorized API call the platform can propose (`tools`/`tool_versions`). |
| **Invocation** | One execution attempt of a tool, with idempotency and verification (`tool_invocations`). |
| **Policy** | A rule mapping (agent, tool, actor, args) → allow / deny / require_approval. |
| **Approval** | A human consent record bound to frozen arguments. |
| **Guide flow** | A cursor walkthrough over real elements (`guide_flows`). |
| **Guide Mode / Do Mode** | Visual guidance only / policy-governed execution. Never conflated. |
| **Knowledge base** | Embedding model + index version boundary. |
| **Collection** | A retrieval unit with an ACL. |
| **Document / version / chunk / embedding** | Content, its immutable snapshot, retrieval unit, vector. |
| **Index version** | The embedding model + dimension generation that vectors belong to. |
| **Capability** | A model ability (`text.reasoning`, `vision.image`, …) used for routing. |
| **Fallback** | Capability-compatible secondary provider use, recorded and visible. |
| **Cursor** | The Ghost Cursor package; also the on-screen pointer. |

## 4. Conventions used in these documents

- **Doc ID** in the header matches the file number; cross-links use relative paths.
- **Requirements:** `PR-*` (product), `FR-*` (functional), `NFR-*` (quality), `AC-*` (acceptance), `UC-*` (use case).
- **Normative** documents define contracts; **Living** documents are updated continuously; **Proposed** marks
  layouts/plans not yet created.
- Code blocks are illustrative-but-authoritative for shapes (schemas, payloads, DDL); exact library calls must be
  verified against the version in the registry at implementation time.
- Tables marked "target" are goals measured in doc 62/65, not claims.

## 5. Validation

```bash
python docs/tools/validate-docs.py
```

Checks: every expected document exists and is substantive, relative links resolve, code fences are balanced,
Mermaid blocks are non-empty, numbered documents carry a Doc ID, and no placeholder markers remain.

CI must run this on any change under `docs/` (see [72](12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md)).

## 6. How to change documentation

1. Find the owning document in [DOCUMENTATION-MAP.md](DOCUMENTATION-MAP.md).
2. If you change a contract, update every document that references it (the map lists dependents).
3. If you move an architectural boundary, add an ADR in [10](02-system-architecture/10-ARCHITECTURE-DECISIONS.md) first.
4. Update [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) and, if a requirement is satisfied,
   [REQUIREMENT-TRACEABILITY.md](REQUIREMENT-TRACEABILITY.md).
5. Run the validator.

## 7. Non-negotiables (summary)

- Clerk owns identity; Supabase owns data; Gemini is primary, NVIDIA NIM is capability-gated fallback.
- Tenant isolation is enforced in Postgres, not just in Python.
- The model proposes; the policy engine decides; approvals bind to frozen arguments; verification is independent.
- A cursor animation is not a business action.
- No secret, mock, or fabricated citation ships.
- Evidence over claims in every status update.

Full rules: [steering/AGENTS.md](steering/AGENTS.md) · [steering/ENGINEERING-PRINCIPLES.md](steering/ENGINEERING-PRINCIPLES.md)
