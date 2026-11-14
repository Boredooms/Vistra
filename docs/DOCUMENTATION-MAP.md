# Documentation Map

**Status:** Living. The index of every document, what each owns, and which documents must change together.

---

## 1. Subsystem router

| If you are working on… | Primary | Supporting |
|---|---|---|
| Vision, requirements, scope | [01](01-product-and-ideation/01-PRODUCT-VISION.md) | [02](01-product-and-ideation/02-PRODUCT-REQUIREMENTS.md), [03](01-product-and-ideation/03-PROBLEM-STATEMENT-AND-MARKET.md) |
| Personas, use cases | [04](01-product-and-ideation/04-USER-PERSONAS-AND-USE-CASES.md) | [60](10-applications-and-experience/60-DEMO-APPLICATION-AND-END-TO-END-SCENARIOS.md) |
| Functional requirements | [05](01-product-and-ideation/05-FUNCTIONAL-REQUIREMENTS.md) | [08](01-product-and-ideation/08-ACCEPTANCE-CRITERIA.md) |
| Performance/reliability targets | [06](01-product-and-ideation/06-NONFUNCTIONAL-REQUIREMENTS.md) | [65](11-quality-security-and-operations/65-PERFORMANCE-AND-SCALABILITY.md) |
| Delivery sequencing | [07](01-product-and-ideation/07-MVP-AND-PRODUCT-ROADMAP.md) | [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) |
| Acceptance criteria | [08](01-product-and-ideation/08-ACCEPTANCE-CRITERIA.md) | [62](11-quality-security-and-operations/62-TESTING-STRATEGY.md) |
| System design, boundaries | [09](02-system-architecture/09-SYSTEM-ARCHITECTURE.md) | [12](02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md) |
| Architectural decisions | [10](02-system-architecture/10-ARCHITECTURE-DECISIONS.md) | all normative docs |
| Repo layout, packages | [11](02-system-architecture/11-REPOSITORY-AND-MONOREPO-STRUCTURE.md) | [14](02-system-architecture/14-TECHNOLOGY-STACK-AND-DEPENDENCIES.md) |
| Data flows, sequences | [13](02-system-architecture/13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md) | [25](04-backend-and-api/25-REALTIME-AND-EVENT-ARCHITECTURE.md) |
| Stack, dependencies | [14](02-system-architecture/14-TECHNOLOGY-STACK-AND-DEPENDENCIES.md) | [68](12-deployment-and-release/68-ENVIRONMENT-AND-SECRETS-MANAGEMENT.md) |
| ERD, data model | [15](03-database-and-identity/15-DATABASE-DESIGN-AND-ERD.md) | [16](03-database-and-identity/16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md) |
| Tables, columns, indexes | [16](03-database-and-identity/16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md) | [19](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) |
| Clerk, tokens, webhooks | [17](03-database-and-identity/17-CLERK-AUTHENTICATION.md) | [18](03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) |
| Roles, permissions, SDK auth | [18](03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) | [54](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) |
| RLS, privileged paths | [19](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) | [41](06-knowledge-and-rag/41-KNOWLEDGE-PERMISSIONS-AND-TENANT-ISOLATION.md) |
| Files, buckets, retention | [20](03-database-and-identity/20-STORAGE-AND-FILE-LIFECYCLE.md) | [36](06-knowledge-and-rag/36-DOCUMENT-INGESTION-AND-PARSING.md) |
| Migrations, backups, DR | [21](03-database-and-identity/21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md) | [71](12-deployment-and-release/71-SUPABASE-AND-REDIS-PRODUCTION-SETUP.md) |
| FastAPI internals | [22](04-backend-and-api/22-BACKEND-ARCHITECTURE.md) | [27](04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) |
| Endpoints, OpenAPI, errors | [23](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) | [27](04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) |
| Conversations, streaming state | [24](04-backend-and-api/24-SESSION-AND-CONVERSATION-MANAGEMENT.md) | [25](04-backend-and-api/25-REALTIME-AND-EVENT-ARCHITECTURE.md) |
| SSE, events, WebSocket | [25](04-backend-and-api/25-REALTIME-AND-EVENT-ARCHITECTURE.md) | [26](04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md) |
| Jobs, workers, retries | [26](04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md) | [43](07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md) |
| Resilience, retries, breakers | [27](04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) | [31](05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) |
| Provider abstraction | [28](05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md) | [31](05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) |
| Gemini | [29](05-ai-and-model-infrastructure/29-GEMINI-PRIMARY-INTEGRATION.md) | [33](05-ai-and-model-infrastructure/33-EMBEDDING-AND-MULTIMODAL-MODELS.md) |
| NVIDIA NIM | [30](05-ai-and-model-infrastructure/30-NVIDIA-NIM-FALLBACK-INTEGRATION.md) | [31](05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) |
| Model selection, fallback | [31](05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) | [28](05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md) |
| Prompts, context, injection | [32](05-ai-and-model-infrastructure/32-PROMPT-AND-CONTEXT-MANAGEMENT.md) | [63](11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md) |
| Embeddings, multimodal | [33](05-ai-and-model-infrastructure/33-EMBEDDING-AND-MULTIMODAL-MODELS.md) | [38](06-knowledge-and-rag/38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) |
| AI eval, cost | [34](05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md) | [66](11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md) |
| Knowledge platform | [35](06-knowledge-and-rag/35-KNOWLEDGE-ENGINE-ARCHITECTURE.md) | [41](06-knowledge-and-rag/41-KNOWLEDGE-PERMISSIONS-AND-TENANT-ISOLATION.md) |
| Parsing, connectors | [36](06-knowledge-and-rag/36-DOCUMENT-INGESTION-AND-PARSING.md) | [40](06-knowledge-and-rag/40-KNOWLEDGE-SOURCE-CONNECTORS.md) |
| Chunking | [37](06-knowledge-and-rag/37-CHUNKING-AND-METADATA-EXTRACTION.md) | [33](05-ai-and-model-infrastructure/33-EMBEDDING-AND-MULTIMODAL-MODELS.md) |
| Retrieval, hybrid search | [38](06-knowledge-and-rag/38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) | [39](06-knowledge-and-rag/39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md) |
| Citations, grounded answers | [39](06-knowledge-and-rag/39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md) | [32](05-ai-and-model-infrastructure/32-PROMPT-AND-CONTEXT-MANAGEMENT.md) |
| Knowledge ACLs | [41](06-knowledge-and-rag/41-KNOWLEDGE-PERMISSIONS-AND-TENANT-ISOLATION.md) | [19](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) |
| RAG quality | [42](06-knowledge-and-rag/42-RAG-EVALUATION-AND-QUALITY.md) | [34](05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md) |
| Agent runtime | [43](07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md) | [44](07-agents-and-execution/44-SPECIALIZED-AGENT-ARCHITECTURE.md) |
| Specialized agents | [44](07-agents-and-execution/44-SPECIALIZED-AGENT-ARCHITECTURE.md) | [32](05-ai-and-model-infrastructure/32-PROMPT-AND-CONTEXT-MANAGEMENT.md) |
| Tools, function calling | [45](07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md) | [47](07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) |
| Workflows | [46](07-agents-and-execution/46-WORKFLOW-ENGINE-AND-STATE-MACHINE.md) | [45](07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md) |
| Policy, approvals, safety | [47](07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) | [63](11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md) |
| Traces, memory | [48](07-agents-and-execution/48-AGENT-MEMORY-AND-EXECUTION-TRACES.md) | [59](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md) |
| Visual context | [49](08-visual-and-ghost-cursor/49-VISUAL-CONTEXT-ENGINE.md) | [50](08-visual-and-ghost-cursor/50-DOM-AND-ACCESSIBILITY-INSPECTION.md) |
| DOM/accessibility | [50](08-visual-and-ghost-cursor/50-DOM-AND-ACCESSIBILITY-INSPECTION.md) | [52](08-visual-and-ghost-cursor/52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md) |
| Ghost Cursor | [51](08-visual-and-ghost-cursor/51-GHOST-CURSOR-ENGINE.md) | [52](08-visual-and-ghost-cursor/52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md) |
| Motion, targeting | [52](08-visual-and-ghost-cursor/52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md) | [50](08-visual-and-ghost-cursor/50-DOM-AND-ACCESSIBILITY-INSPECTION.md) |
| Guide verification | [53](08-visual-and-ghost-cursor/53-VISUAL-GUIDANCE-AND-VERIFICATION.md) | [47](07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) |
| JavaScript/React SDK | [54](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) | [23](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) |
| Widget UI | [55](09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md) | [51](08-visual-and-ghost-cursor/51-GHOST-CURSOR-ENGINE.md) |
| Developer platform | [56](09-sdk-and-integrations/56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md) | [58](09-sdk-and-integrations/58-SDK-VERSIONING-AND-PUBLISHING.md) |
| MCP, webhooks, OAuth | [57](09-sdk-and-integrations/57-MCP-WEBHOOKS-AND-EXTERNAL-INTEGRATIONS.md) | [45](07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md) |
| SDK releases | [58](09-sdk-and-integrations/58-SDK-VERSIONING-AND-PUBLISHING.md) | [72](12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md) |
| Studio | [59](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md) | [61](10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md) |
| Demo app, journeys | [60](10-applications-and-experience/60-DEMO-APPLICATION-AND-END-TO-END-SCENARIOS.md) | [62](11-quality-security-and-operations/62-TESTING-STRATEGY.md) |
| Admin, analytics | [61](10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md) | [66](11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md) |
| Testing | [62](11-quality-security-and-operations/62-TESTING-STRATEGY.md) | [08](01-product-and-ideation/08-ACCEPTANCE-CRITERIA.md) |
| Threat model | [63](11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md) | [19](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) |
| Observability | [64](11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md) | [75](12-deployment-and-release/75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md) |
| Performance | [65](11-quality-security-and-operations/65-PERFORMANCE-AND-SCALABILITY.md) | [38](06-knowledge-and-rag/38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) |
| Cost | [66](11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md) | [34](05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md) |
| Local dev | [67](12-deployment-and-release/67-LOCAL-DEVELOPMENT-ENVIRONMENT.md) | [68](12-deployment-and-release/68-ENVIRONMENT-AND-SECRETS-MANAGEMENT.md) |
| Env vars, secrets | [68](12-deployment-and-release/68-ENVIRONMENT-AND-SECRETS-MANAGEMENT.md) | [17](03-database-and-identity/17-CLERK-AUTHENTICATION.md) |
| Render | [69](12-deployment-and-release/69-RENDER-BACKEND-DEPLOYMENT.md) | [26](04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md) |
| Vercel | [70](12-deployment-and-release/70-VERCEL-FRONTEND-DEPLOYMENT.md) | [59](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md) |
| Supabase/Redis prod | [71](12-deployment-and-release/71-SUPABASE-AND-REDIS-PRODUCTION-SETUP.md) | [21](03-database-and-identity/21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md) |
| CI/CD | [72](12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md) | [74](12-deployment-and-release/74-PRODUCTION-RELEASE-AND-ROLLBACK.md) |
| Domains, CORS, TLS | [73](12-deployment-and-release/73-DOMAIN-CORS-SSL-AND-NETWORKING.md) | [70](12-deployment-and-release/70-VERCEL-FRONTEND-DEPLOYMENT.md) |
| Release, rollback | [74](12-deployment-and-release/74-PRODUCTION-RELEASE-AND-ROLLBACK.md) | [75](12-deployment-and-release/75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md) |
| Incidents | [75](12-deployment-and-release/75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md) | [64](11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md) |

## 2. Full index

### Control
| # | Document | Owns |
|---|---|---|
| — | [README.md](README.md) | Entry point, terminology, reading paths |
| — | [DOCUMENTATION-MAP.md](DOCUMENTATION-MAP.md) | This index |
| — | [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) | Build order, gates |
| — | [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) | Living status |
| — | [REQUIREMENT-TRACEABILITY.md](REQUIREMENT-TRACEABILITY.md) | Requirement chains |
| — | [EXECUTION-PROMPT-5H.md](EXECUTION-PROMPT-5H.md) | 5-hour vertical slice: build, deploy, demo |

### Steering
| # | Document | Owns |
|---|---|---|
| S1 | [AGENTS.md](steering/AGENTS.md) | Normative rules for all coding agents |
| S2 | [CLAUDE.md](steering/CLAUDE.md) | Claude Code workflow + context routing |
| S3 | [CURSOR-RULES.md](steering/CURSOR-RULES.md) | IDE conventions and constraints |
| S4 | [ENGINEERING-PRINCIPLES.md](steering/ENGINEERING-PRINCIPLES.md) | Twelve non-negotiables |
| S5 | [DEFINITION-OF-DONE.md](steering/DEFINITION-OF-DONE.md) | Completion evidence per work type |

### Product (01)
| # | Document | Owns |
|---|---|---|
| 01 | [PRODUCT-VISION](01-product-and-ideation/01-PRODUCT-VISION.md) | Thesis, capability model, metrics |
| 02 | [PRODUCT-REQUIREMENTS](01-product-and-ideation/02-PRODUCT-REQUIREMENTS.md) | `PR-01…PR-35` |
| 03 | [PROBLEM-STATEMENT-AND-MARKET](01-product-and-ideation/03-PROBLEM-STATEMENT-AND-MARKET.md) | Problem, market, moats, risks |
| 04 | [USER-PERSONAS-AND-USE-CASES](01-product-and-ideation/04-USER-PERSONAS-AND-USE-CASES.md) | P1–P5, UC-01…UC-10 |
| 05 | [FUNCTIONAL-REQUIREMENTS](01-product-and-ideation/05-FUNCTIONAL-REQUIREMENTS.md) | `FR-*` by module |
| 06 | [NONFUNCTIONAL-REQUIREMENTS](01-product-and-ideation/06-NONFUNCTIONAL-REQUIREMENTS.md) | Budgets and quality attributes |
| 07 | [MVP-AND-PRODUCT-ROADMAP](01-product-and-ideation/07-MVP-AND-PRODUCT-ROADMAP.md) | MVP boundary, phases, milestones |
| 08 | [ACCEPTANCE-CRITERIA](01-product-and-ideation/08-ACCEPTANCE-CRITERIA.md) | `AC-001…AC-102` |

### Architecture (02)
| # | Document | Owns |
|---|---|---|
| 09 | [SYSTEM-ARCHITECTURE](02-system-architecture/09-SYSTEM-ARCHITECTURE.md) | Containers, trust zones, persistence map, failure points |
| 10 | [ARCHITECTURE-DECISIONS](02-system-architecture/10-ARCHITECTURE-DECISIONS.md) | ADR-001…ADR-028 + open questions |
| 11 | [REPOSITORY-AND-MONOREPO-STRUCTURE](02-system-architecture/11-REPOSITORY-AND-MONOREPO-STRUCTURE.md) | Target tree, ownership, toolchain |
| 12 | [SERVICE-BOUNDARIES-AND-MODULE-MAP](02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md) | Modules, interfaces, events |
| 13 | [DATA-FLOW-AND-SEQUENCE-DIAGRAMS](02-system-architecture/13-DATA-FLOW-AND-SEQUENCE-DIAGRAMS.md) | Critical paths and failure injection |
| 14 | [TECHNOLOGY-STACK-AND-DEPENDENCIES](02-system-architecture/14-TECHNOLOGY-STACK-AND-DEPENDENCIES.md) | Choices, rejections, references |

### Data and identity (03)
| # | Document | Owns |
|---|---|---|
| 15 | [DATABASE-DESIGN-AND-ERD](03-database-and-identity/15-DATABASE-DESIGN-AND-ERD.md) | Domains, ERD, sizing, lifecycle |
| 16 | [DATABASE-SCHEMA-AND-RELATIONSHIPS](03-database-and-identity/16-DATABASE-SCHEMA-AND-RELATIONSHIPS.md) | Column-level DDL contract |
| 17 | [CLERK-AUTHENTICATION](03-database-and-identity/17-CLERK-AUTHENTICATION.md) | Tokens, webhooks, Supabase TPA |
| 18 | [TENANCY-RBAC-AND-AUTHORIZATION](03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) | Identity types, matrix, API keys |
| 19 | [SUPABASE-RLS-AND-DATABASE-SECURITY](03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) | Policies, privileged paths, tests |
| 20 | [STORAGE-AND-FILE-LIFECYCLE](03-database-and-identity/20-STORAGE-AND-FILE-LIFECYCLE.md) | Buckets, keys, signing, deletion |
| 21 | [MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY](03-database-and-identity/21-MIGRATIONS-BACKUPS-AND-DISASTER-RECOVERY.md) | Migration policy, RPO/RTO, restore |

### Backend (04)
| # | Document | Owns |
|---|---|---|
| 22 | [BACKEND-ARCHITECTURE](04-backend-and-api/22-BACKEND-ARCHITECTURE.md) | Process model, layering, config |
| 23 | [API-DESIGN-AND-OPENAPI-CONTRACTS](04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) | Endpoints, envelope, pagination |
| 24 | [SESSION-AND-CONVERSATION-MANAGEMENT](04-backend-and-api/24-SESSION-AND-CONVERSATION-MANAGEMENT.md) | Session lifecycle, budgets |
| 25 | [REALTIME-AND-EVENT-ARCHITECTURE](04-backend-and-api/25-REALTIME-AND-EVENT-ARCHITECTURE.md) | SSE/WS, events, replay |
| 26 | [BACKGROUND-JOBS-AND-WORKERS](04-backend-and-api/26-BACKGROUND-JOBS-AND-WORKERS.md) | Job model, claiming, DLQ |
| 27 | [ERROR-HANDLING-AND-RESILIENCE](04-backend-and-api/27-ERROR-HANDLING-AND-RESILIENCE.md) | Codes, retries, breakers |

### AI (05)
| # | Document | Owns |
|---|---|---|
| 28 | [AI-PROVIDER-ABSTRACTION](05-ai-and-model-infrastructure/28-AI-PROVIDER-ABSTRACTION.md) | Ports, registry, router, telemetry |
| 29 | [GEMINI-PRIMARY-INTEGRATION](05-ai-and-model-infrastructure/29-GEMINI-PRIMARY-INTEGRATION.md) | SDK, interactions, structured, vision |
| 30 | [NVIDIA-NIM-FALLBACK-INTEGRATION](05-ai-and-model-infrastructure/30-NVIDIA-NIM-FALLBACK-INTEGRATION.md) | OpenAI-compatible adapter, probing |
| 31 | [MODEL-ROUTING-AND-CAPABILITY-MATRIX](05-ai-and-model-infrastructure/31-MODEL-ROUTING-AND-CAPABILITY-MATRIX.md) | Capability gating, eligibility |
| 32 | [PROMPT-AND-CONTEXT-MANAGEMENT](05-ai-and-model-infrastructure/32-PROMPT-AND-CONTEXT-MANAGEMENT.md) | Prompts, budgets, injection defense |
| 33 | [EMBEDDING-AND-MULTIMODAL-MODELS](05-ai-and-model-infrastructure/33-EMBEDDING-AND-MULTIMODAL-MODELS.md) | Dimensions, versioning, batching |
| 34 | [AI-EVALUATION-AND-COST-MANAGEMENT](05-ai-and-model-infrastructure/34-AI-EVALUATION-AND-COST-MANAGEMENT.md) | Datasets, gates, budgets |

### Knowledge (06)
| # | Document | Owns |
|---|---|---|
| 35 | [KNOWLEDGE-ENGINE-ARCHITECTURE](06-knowledge-and-rag/35-KNOWLEDGE-ENGINE-ARCHITECTURE.md) | Components, lifecycle, interfaces |
| 36 | [DOCUMENT-INGESTION-AND-PARSING](06-knowledge-and-rag/36-DOCUMENT-INGESTION-AND-PARSING.md) | Formats, parsers, fetching, errors |
| 37 | [CHUNKING-AND-METADATA-EXTRACTION](06-knowledge-and-rag/37-CHUNKING-AND-METADATA-EXTRACTION.md) | Algorithm, budgets, dedupe |
| 38 | [VECTOR-SEARCH-AND-HYBRID-RETRIEVAL](06-knowledge-and-rag/38-VECTOR-SEARCH-AND-HYBRID-RETRIEVAL.md) | SQL, RRF, thresholds, scaling |
| 39 | [RERANKING-CITATIONS-AND-GROUNDED-ANSWERS](06-knowledge-and-rag/39-RERANKING-CITATIONS-AND-GROUNDED-ANSWERS.md) | Citation contract, validation |
| 40 | [KNOWLEDGE-SOURCE-CONNECTORS](06-knowledge-and-rag/40-KNOWLEDGE-SOURCE-CONNECTORS.md) | Connectors, egress, SSRF |
| 41 | [KNOWLEDGE-PERMISSIONS-AND-TENANT-ISOLATION](06-knowledge-and-rag/41-KNOWLEDGE-PERMISSIONS-AND-TENANT-ISOLATION.md) | ACLs, leakage vectors |
| 42 | [RAG-EVALUATION-AND-QUALITY](06-knowledge-and-rag/42-RAG-EVALUATION-AND-QUALITY.md) | Metrics, gates, drift |

### Agents (07)
| # | Document | Owns |
|---|---|---|
| 43 | [AGENT-RUNTIME-AND-ORCHESTRATION](07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md) | Run loop, states, limits |
| 44 | [SPECIALIZED-AGENT-ARCHITECTURE](07-agents-and-execution/44-SPECIALIZED-AGENT-ARCHITECTURE.md) | Agent contracts |
| 45 | [TOOL-REGISTRY-AND-FUNCTION-CALLING](07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md) | Schemas, execution, verification |
| 46 | [WORKFLOW-ENGINE-AND-STATE-MACHINE](07-agents-and-execution/46-WORKFLOW-ENGINE-AND-STATE-MACHINE.md) | Steps, compensation, partial |
| 47 | [APPROVALS-POLICY-AND-SAFE-EXECUTION](07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) | Decisions, consent, invariants |
| 48 | [AGENT-MEMORY-AND-EXECUTION-TRACES](07-agents-and-execution/48-AGENT-MEMORY-AND-EXECUTION-TRACES.md) | Memory scopes, trace schema |

### Visual (08)
| # | Document | Owns |
|---|---|---|
| 49 | [VISUAL-CONTEXT-ENGINE](08-visual-and-ghost-cursor/49-VISUAL-CONTEXT-ENGINE.md) | Signals, redaction, budgets |
| 50 | [DOM-AND-ACCESSIBILITY-INSPECTION](08-visual-and-ghost-cursor/50-DOM-AND-ACCESSIBILITY-INSPECTION.md) | A11y summary, descriptors |
| 51 | [GHOST-CURSOR-ENGINE](08-visual-and-ghost-cursor/51-GHOST-CURSOR-ENGINE.md) | Package, visuals, API, states |
| 52 | [GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION](08-visual-and-ghost-cursor/52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md) | Targeting, geometry, motion |
| 53 | [VISUAL-GUIDANCE-AND-VERIFICATION](08-visual-and-ghost-cursor/53-VISUAL-GUIDANCE-AND-VERIFICATION.md) | Step verification, Guide vs Do |

### SDK (09)
| # | Document | Owns |
|---|---|---|
| 54 | [JAVASCRIPT-AND-REACT-SDK](09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) | Public SDK surface |
| 55 | [WIDGET-AND-EMBEDDING-ARCHITECTURE](09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md) | Isolation, UI, performance |
| 56 | [PUBLIC-API-AND-DEVELOPER-PLATFORM](09-sdk-and-integrations/56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md) | Keys, quotas, onboarding |
| 57 | [MCP-WEBHOOKS-AND-EXTERNAL-INTEGRATIONS](09-sdk-and-integrations/57-MCP-WEBHOOKS-AND-EXTERNAL-INTEGRATIONS.md) | MCP, webhooks, OAuth |
| 58 | [SDK-VERSIONING-AND-PUBLISHING](09-sdk-and-integrations/58-SDK-VERSIONING-AND-PUBLISHING.md) | Semver, releases, deprecation |

### Applications (10)
| # | Document | Owns |
|---|---|---|
| 59 | [VISTRA-STUDIO-ARCHITECTURE](10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md) | Pages, data deps, roles |
| 60 | [DEMO-APPLICATION-AND-END-TO-END-SCENARIOS](10-applications-and-experience/60-DEMO-APPLICATION-AND-END-TO-END-SCENARIOS.md) | Acme app, J1–J9 |
| 61 | [ADMINISTRATION-AND-ANALYTICS](10-applications-and-experience/61-ADMINISTRATION-AND-ANALYTICS.md) | Admin, audit, metrics |

### Quality and ops (11)
| # | Document | Owns |
|---|---|---|
| 62 | [TESTING-STRATEGY](11-quality-security-and-operations/62-TESTING-STRATEGY.md) | Pyramid, environments, gates |
| 63 | [SECURITY-THREAT-MODEL](11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md) | Threats, controls, corpus |
| 64 | [OBSERVABILITY-LOGGING-AND-MONITORING](11-quality-security-and-operations/64-OBSERVABILITY-LOGGING-AND-MONITORING.md) | Logs, metrics, traces, alerts |
| 65 | [PERFORMANCE-AND-SCALABILITY](11-quality-security-and-operations/65-PERFORMANCE-AND-SCALABILITY.md) | Budgets, load model, scaling |
| 66 | [COST-AND-RESOURCE-PLANNING](11-quality-security-and-operations/66-COST-AND-RESOURCE-PLANNING.md) | Unit economics, controls |

### Deployment (12)
| # | Document | Owns |
|---|---|---|
| 67 | [LOCAL-DEVELOPMENT-ENVIRONMENT](12-deployment-and-release/67-LOCAL-DEVELOPMENT-ENVIRONMENT.md) | Bootstrap, ports, troubleshooting |
| 68 | [ENVIRONMENT-AND-SECRETS-MANAGEMENT](12-deployment-and-release/68-ENVIRONMENT-AND-SECRETS-MANAGEMENT.md) | Variables, classification, rotation |
| 69 | [RENDER-BACKEND-DEPLOYMENT](12-deployment-and-release/69-RENDER-BACKEND-DEPLOYMENT.md) | Services, Docker, deploys, rollback |
| 70 | [VERCEL-FRONTEND-DEPLOYMENT](12-deployment-and-release/70-VERCEL-FRONTEND-DEPLOYMENT.md) | Projects, env scoping, caching |
| 71 | [SUPABASE-AND-REDIS-PRODUCTION-SETUP](12-deployment-and-release/71-SUPABASE-AND-REDIS-PRODUCTION-SETUP.md) | Pooling, buckets, backups, Redis |
| 72 | [CI-CD-AND-GITHUB-ACTIONS](12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md) | Workflows, gates, deploy order |
| 73 | [DOMAIN-CORS-SSL-AND-NETWORKING](12-deployment-and-release/73-DOMAIN-CORS-SSL-AND-NETWORKING.md) | DNS, TLS, CORS, boundaries |
| 74 | [PRODUCTION-RELEASE-AND-ROLLBACK](12-deployment-and-release/74-PRODUCTION-RELEASE-AND-ROLLBACK.md) | Release sequence, rollback |
| 75 | [PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE](12-deployment-and-release/75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md) | RB-01…RB-12, postmortems |

## 3. Change-impact groups

When you change something, these documents must move together. A change that touches one and not the others is
incomplete.

| Change | Documents that must be updated |
|---|---|
| Add/alter a table | 16, 19, 21 (migration), 12 (owner), traceability |
| Add/alter an endpoint | 23, 27 (codes), 54/56 if public, traceability |
| Change a role or permission | 18, 59 (UI visibility), 63 (tests) |
| Change auth/token behavior | 17, 18, 54, 68, 73 |
| Add a capability or provider | 28, 29/30, 31, 34, 66 |
| Change retrieval/chunking | 37, 38, 39, 42, 33 |
| Change agent/tool policy | 43, 45, 47, 63, 08 |
| Change cursor behavior | 50, 51, 52, 53, 54 |
| Change SDK surface | 54, 55, 58, 23 |
| Change deployment topology | 09, 69, 70, 71, 72, 74 |
| Change a metric or budget | 06, 61, 64, 65 |
| Move a boundary | 10 (ADR first), then all affected |

## 4. Reading cost

| Path | Documents | Approx. time |
|---|---|---|
| Orientation | 4 | 45 min |
| Backend onboarding | 6 | 2 h |
| AI/retrieval depth | 7 | 3 h |
| Full system | 75 | 2–3 days |

Agents should read only the router row for their task plus [steering/AGENTS.md](steering/AGENTS.md) — not the
whole system.
