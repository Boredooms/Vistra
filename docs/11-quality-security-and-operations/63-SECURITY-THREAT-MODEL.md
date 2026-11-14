# Security Threat Model

**Doc ID:** 63 · **Status:** Approved (normative) · **Area:** Security
**Depends on:** [18](../03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md), [19](../03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) · **Related:** [40](../06-knowledge-and-rag/40-KNOWLEDGE-SOURCE-CONNECTORS.md), [47](../07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md), [75](../12-deployment-and-release/75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md)

---

## 1. Purpose

Enumerate what can go wrong, who can cause it, and which control prevents or detects it. VISTRA reads customer
screens, stores their documents, and can act in their products; the threat model is not optional.

## 2. Assets

| Asset | Impact if compromised |
|---|---|
| Tenant documents/chunks/embeddings | Confidential data disclosure |
| Conversations/screenshots | PII, credentials on screen, business data |
| Tool credentials / OAuth tokens | Acting as the customer |
| API keys / session tokens | Unauthorized usage, cost, data access |
| Agent policy configuration | Unauthorized actions |
| Audit log | Loss of accountability |
| Provider keys | Financial abuse, model access |
| Service-role DB credentials | Total data compromise |

## 3. Trust boundaries

Browser (untrusted) → API (trusted) → DB (trusted, RLS) → providers (external) → customer systems (external).
Model output, retrieved text, tool output, and webhook payloads are **untrusted input** at every boundary.

## 4. STRIDE analysis

| Category | Threat | Control |
|---|---|---|
| Spoofing | Forged Clerk token; forged SDK token | JWKS + `iss`/`aud`/`azp`; SDK tokens signed with a dedicated key |
| Spoofing | Webhook forgery | HMAC + timestamp + event-id dedupe |
| Tampering | Modified tool args after approval | Frozen args snapshot; re-validation at execution |
| Tampering | Modified migration | Immutable files + checksums |
| Repudiation | Denied action | Append-only audit with actor + request id |
| Info disclosure | Cross-tenant read via API/SQL/retrieval | RLS + org predicates + SQL-level retrieval filters |
| Info disclosure | Secret in client bundle/log | Env separation, log redaction, bundle scans |
| Info disclosure | Screenshot captures passwords | Client-side redaction; capture opt-in |
| DoS | Token/cost exhaustion | Rate limits, budgets, concurrency caps, breakers |
| DoS | Huge upload/PDF bomb | Size caps, zip-ratio checks, timeouts |
| Elevation | End-user token calls admin API | Audience separation; role checks |
| Elevation | Model grants itself permission | Policy engine server-side; model output is a proposal |
| Elevation | SSRF to metadata/private network | Egress filter with DNS pinning + redirect revalidation |

## 5. Threat catalogue

### T1 — Cross-tenant data access

**Vector:** guessed ids, manipulated `X-Organization-Id`, retrieval query, citation injection, export.
**Controls:** tenant resolution from verified token; 404 on mismatch; RLS forced; SQL filters; citation validation;
tests A1–A16. **Detect:** audit `security.cross_tenant_attempt`; alert on spikes.

### T2 — Prompt injection via documents/web/tools

**Vector:** a PDF or page instructing the model to ignore rules, exfiltrate, or call a tool.
**Controls:** fenced evidence, instruction hierarchy, no policy authority in the model, tool policy server-side,
output schema validation, adversarial corpus. **Detect:** unexpected tool proposals, citation failures.

### T3 — Data exfiltration through answers

**Vector:** user asks for another tenant's data or the model volunteers it.
**Controls:** retrieval scope; no cross-tenant ids in context; output validation against evidence; refusal.
**Detect:** citation outside evidence set (hard fail + alert).

### T4 — Unauthorized action execution

**Vector:** model proposes destructive tool; policy misconfigured; approval replay.
**Controls:** default deny; always-approve classes (delete/external/payment); frozen args; single-use approvals;
idempotency; verification. **Detect:** `policy_denied`, `APPROVAL_STALE`, verification failures.

### T5 — Credential compromise

**Vector:** leaked API key in a browser bundle; service-role key in logs; OAuth token theft.
**Controls:** server-only keys; hashed storage; encryption at rest; rotation; secret scanning; least-privilege
scopes; no secrets in errors. **Detect:** usage anomalies per key; last-used alerts; key revocation.

### T6 — SSRF / malicious fetch

**Vector:** source URL pointing at `169.254.169.254`, internal admin panels, redirect chains.
**Controls:** resolver checks, IP pinning, redirect revalidation, allowlist, no non-HTTP schemes.
**Detect:** `EGRESS_BLOCKED` events; egress proxy logs.

### T7 — Upload abuse

**Vector:** zip bomb, malformed PDF exploiting a parser, HTML/SVG with script.
**Controls:** size/ratio caps, magic-byte validation, parser sandboxing (worker process), sanitize before render,
quarantine. **Detect:** parse failures, quarantine counts.

### T8 — Session/token attacks

**Vector:** stolen browser token, token replay across apps, long-lived tokens.
**Controls:** audience-scoped tokens, 15-min TTL, origin binding, refresh via host, revocation.
**Detect:** origin mismatch, token reuse from a new origin.

### T9 — Cost/resource exhaustion

**Vector:** scripted sessions, huge context, embedding spam.
**Controls:** per-key/session/org rate limits, budgets, max steps/tokens, ingestion caps, breakers.
**Detect:** cost anomaly alerts, 429 rates.

### T10 — Supply chain

**Vector:** compromised npm/PyPI package in the SDK (runs on customer pages).
**Controls:** lockfiles, minimal deps (cursor has zero), license allowlist, dependency review, SRI for CDN,
provenance. **Detect:** Dependabot/audit alerts; bundle diff review.

### T11 — Insider/support misuse

**Vector:** staff reading tenant data without cause.
**Controls:** break-glass with reason, time-boxed read-only, audit, no credential access.
**Detect:** access review, alert on break-glass.

### T12 — Realtime abuse

**Vector:** opening thousands of streams; hijacking another session's stream; slow consumer.
**Controls:** one stream per session, auth on connect, ticket-based WS, backpressure, per-instance caps.

### T13 — Data retention violations

**Vector:** content kept beyond policy; screenshots retained indefinitely.
**Controls:** retention jobs, TTL columns, deletion verification, tenant-configurable windows.
**Detect:** retention sweep reports; storage audit.

## 6. Adversarial test corpus (must run in CI)

| Suite | Cases |
|---|---|
| Tenancy | 16 cases (doc 18 §10) + 9 RLS cases (doc 19 §8) |
| Injection | 40 documents/pages/messages with embedded instructions |
| SSRF | 20 URL forms incl. decimal/octal IPs, IPv6-mapped, redirect chains |
| Auth | 12 token variants (expired, wrong aud, wrong iss, alg=none, tampered) |
| Upload | 10 malicious/broken files |
| Webhooks | signature, timestamp skew, replay, duplicate |
| Tools | policy bypass attempts, arg injection, approval replay |
| Retrieval | cross-tenant query, citation injection, ACL bypass |

## 7. Security requirements traceability

| Requirement | Where enforced | Test |
|---|---|---|
| Every request authenticated | `core/auth` dependency | auth suite |
| Tenant isolation | RLS + org predicates | tenancy + RLS suites |
| No secrets in client | build + review | bundle scan |
| SSRF blocked | egress adapter | SSRF suite |
| Prompt injection cannot change policy | architecture + prompt | injection suite |
| Actions require policy + approval | executor pipeline | tool suite |
| Audit coverage | `audit_events` | audit completeness test |
| Retention enforced | sweeper | retention test |

## 8. Incident response (security)

1. Contain: revoke keys/tokens, disable the affected tool/application, isolate the worker.
2. Assess: scope (tenants, records), via audit + traces.
3. Notify: per contract and law; document timeline.
4. Eradicate: patch, rotate, re-test.
5. Recover: restore from backup if integrity is affected (doc 21).
6. Postmortem within 48 h; add regression tests.

## 9. Residual risks (accepted, documented)

- Cross-origin iframes cannot be inspected (limitation surfaced, not a vulnerability).
- A malicious host application controls its own DOM and could mislead guidance; the host is trusted for its own
  page.
- Provider-side data handling is governed by provider terms; no training on VISTRA data by contract.
- Browser extensions with page access can observe the widget; out of scope.

## 10. Acceptance criteria

- [ ] Every threat in §5 has at least one control and one test.
- [ ] Adversarial corpus passes 100% on main.
- [ ] Secrets scanning is enabled in CI and blocks.
- [ ] Break-glass access is audited and time-boxed.
- [ ] Incident runbook references this document's containment steps.

## 11. Related documents

[18](../03-database-and-identity/18-TENANCY-RBAC-AND-AUTHORIZATION.md) ·
[19](../03-database-and-identity/19-SUPABASE-RLS-AND-DATABASE-SECURITY.md) ·
[40](../06-knowledge-and-rag/40-KNOWLEDGE-SOURCE-CONNECTORS.md) ·
[47](../07-agents-and-execution/47-APPROVALS-POLICY-AND-SAFE-EXECUTION.md) ·
[62](62-TESTING-STRATEGY.md) · [75](../12-deployment-and-release/75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md)

## 12. References

- OWASP ASVS — https://owasp.org/www-project-application-security-verification-standard/
- OWASP Top 10 for LLM Applications — https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OWASP SSRF prevention — https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
