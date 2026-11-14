# Acceptance Criteria

**Doc ID:** 08 · **Status:** Approved · **Area:** Product / QA
**Depends on:** [02](02-PRODUCT-REQUIREMENTS.md), [05](05-FUNCTIONAL-REQUIREMENTS.md) · **Related:** [62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md), [../REQUIREMENT-TRACEABILITY.md](../REQUIREMENT-TRACEABILITY.md)

---

## 1. Purpose

Convert requirements into checkable criteria (`AC-*`). Each criterion is a test that can fail. This is the
contract QA, CI, and review use to decide whether a requirement is met.

## 2. Scope

Platform-level acceptance. Unit-level assertions live in module tests; the E2E journey suite is in
[62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md).

## 3. Format

```
AC-### (PR-xx / FR-xxx) Given <precondition> when <action> then <observable outcome>.
```
"Observable" means: an HTTP response, a database row, a DOM state, a recorded event, or a metric — never
"the UI looks right".

---

## 4. Criteria

### Identity and tenancy

**AC-001** (PR-01/FR-IDN-001) Given a valid Clerk token, when calling `GET /v1/me`, then 200 with the
projected user and memberships.
**AC-002** (PR-01/FR-IDN-001) Given an expired token, when calling any protected route, then 401
`AUTH_INVALID_TOKEN` and no database query is executed (assert via query counter).
**AC-003** (PR-02/FR-IDN-003) Given user A in org A and a resource in org B, when A calls
`GET /v1/applications/{orgB_id}`, then 404 `NOT_FOUND` and an `audit_events` security row exists.
**AC-004** (PR-03/FR-IDN-004) Given a `viewer` role, when calling `POST /v1/applications`, then 403
`INSUFFICIENT_ROLE`.
**AC-005** (PR-02/FR-IDN-002) Given a Clerk `organizationMembership.created` webhook delivered twice with
the same event id, then exactly one membership row exists.
**AC-006** (PR-02/FR-IDN-006) Given a member is removed in Clerk, when they call the API after webhook
processing, then 403/404 and their live session is revoked.

### Applications and SDK auth

**AC-010** (PR-06/FR-APP-001) Given an org owner, when creating an application, then the API key is
returned once, the DB stores only a hash, and `GET /v1/applications/{id}` never returns the key.
**AC-011** (PR-06/FR-APP-002) Given an allowed origin, when the SDK requests a session token, then 200;
given an unlisted origin, then 403 `ORIGIN_NOT_ALLOWED` with a security event.
**AC-012** (PR-04/FR-SES-001) Given a valid app key and end-user reference, when minting a session token,
then the token audience is `sdk`, TTL ≤ 15 min, and it cannot call organization-admin endpoints (403).
**AC-013** (PR-26/FR-APP-003) Given a rotated key, then the old key works until the overlap window ends and
is rejected afterwards.

### Visual context

**AC-020** (PR-10/FR-VIS-001) Given a page with a password input and a `data-vistra-private` region, when
capturing context, then neither value appears in the payload (assert on serialized JSON).
**AC-021** (PR-11/FR-VIS-003) Given a selected button, when asking a question, then the request contains
role, accessible name, and bbox, and the answer references the accessible name.
**AC-022** (PR-12/FR-VIS-005) Given an embedded cross-origin iframe, when capturing, then the response
reports `capture_limited: ["cross_origin_iframe"]` and no iframe content is transmitted.
**AC-023** (PR-10/FR-VIS-004) Given a 5k-node page, when capturing, then the serialized summary is ≤ 20 KB
and capture duration ≤ 50 ms (performance mark asserted).

### Knowledge and RAG

**AC-030** (PR-13/FR-KNW-002) Given a 10 MB PDF upload, when the request returns, then a job id exists and
ingestion reaches `ready` within the published budget.
**AC-031** (PR-14/FR-KNW-003) Given a corrupted PDF, then the job ends `failed` with `PARSE_ERROR`, the
source shows the failure, and no partial vectors exist.
**AC-032** (PR-15/FR-KNW-005) Given 1M chunks across two orgs, when org A searches a term that exists only
in org B's documents, then zero results and no chunk content in the response.
**AC-033** (PR-16/FR-KNW-006) Given an answer, when inspecting citations, then every citation id exists in
the retrieval result set for that run; a fabricated citation causes 500 `RESPONSE_VALIDATION_FAILED`
in the eval harness and is never returned to a user.
**AC-034** (PR-16) Given a question with no supporting chunk above the threshold, then the response has
`grounded=false`, an insufficient-evidence message, and no invented facts.
**AC-035** (PR-13/FR-KNW-008) Given a source URL resolving to `169.254.169.254` or `127.0.0.1`, then the job
fails with `EGRESS_BLOCKED` before any request is made.
**AC-036** (PR-14/FR-KNW-004) Given the same document uploaded twice, then one document with one version
and no duplicated chunks/vectors.

### Agents and execution

**AC-040** (PR-17/FR-AGT-001) Given "what does the Starter plan include?", then intent is `knowledge_query`
and the plan selects the knowledge agent (assert on the persisted plan).
**AC-041** (PR-17/FR-AGT-003) Given a run in progress, when the worker is killed and restarted, then the run
resumes from the last persisted step and completes with no duplicate side effects.
**AC-042** (PR-18/FR-TOL-003) Given a tool with no policy allowing it, when proposed, then the decision is
`deny`, no HTTP call is made, and the run records `policy_denied`.
**AC-043** (PR-18/FR-TOL-005) Given `require_approval`, when the user rejects, then the tool is not executed
and the run ends `rejected` with the approver recorded.
**AC-044** (PR-18/FR-TOL-004) Given the same `(run, step, tool)` executed twice, then the host API receives
one call (or the second is short-circuited) and the response equals the first.
**AC-045** (PR-19/FR-TOL-006) Given a successful tool response, when verification fails, then the run is
`failed_verification` and the user is told nothing was confirmed.
**AC-046** (PR-17/FR-AGT-007) Given cancellation during a multi-step plan, then no further side effect
occurs and the run is `cancelled`.
**AC-047** (PR-20/FR-WRK-002) Given a two-step workflow where step 2 fails, then step 1 remains committed,
the workflow reports `partial` with the completed step list.

### Provider infrastructure

**AC-050** (PR-30/FR-*) Given Gemini returns 503 twice, when the capability is `text.reasoning` and an
NVIDIA model advertises it, then the response succeeds with `fallback_used=true` in the trace.
**AC-051** (PR-30/FR-*) Given the capability is `vision.image` and no fallback provider advertises it, then
the error is `CapabilityUnavailable` and no text-only model is called.
**AC-052** (PR-30/FR-*) Given invalid Gemini credentials, then the error is
`PROVIDER_CONFIGURATION_ERROR`, no retries, no fallback.
**AC-053** (PR-31/FR-*) Given a model-id config change, then routing uses the new model without a code
change (assert request payload).
**AC-054** (PR-32/FR-*) Given a structured-output request, when the model returns extra fields or wrong
types, then validation fails and one repair attempt is made, then a typed error.

### Ghost Cursor

**AC-060** (PR-21/FR-*) Given a target with `data-vistra-target="invite-member"`, when guiding, then the
resolved element is that node (assert by id).
**AC-061** (PR-21) Given only role+name, when guiding, then the resolver picks the single matching element;
with two matches it emits `TARGET_AMBIGUOUS` rather than guessing.
**AC-062** (PR-22) Given a target below the fold inside a nested scroll container, when guiding, then it is
scrolled into view and the cursor's final coordinates intersect the element's rect.
**AC-063** (PR-22) Given the DOM replaces the target during motion, then the step re-resolves within budget
and otherwise emits `TARGET_MISSING` with a text fallback.
**AC-064** (PR-22) Given `prefers-reduced-motion: reduce`, then no motion animation occurs, the highlight is
applied instantly, and completion is still reported correctly.
**AC-065** (PR-23) Given a completed guide flow, then no business record was created and the run/step type is
`guide` (not `action`).
**AC-066** (PR-22) Given a flow cancelled by the user, then the cursor is removed, listeners/observers are
disconnected, and `CANCELLED` is recorded.

### SDK and widget

**AC-070** (PR-07/FR-SDK-001) Given an invalid app id, then `createVistra` rejects with
`INVALID_CONFIG` before any network call.
**AC-071** (PR-07/FR-SDK-003) Given 50 init/destroy cycles, then DOM node count, listener count, and heap
return to baseline within 5%.
**AC-072** (PR-08/FR-SDK-004) Given Next.js SSR, then importing the React package does not touch `window` at
module scope and renders without hydration mismatch.
**AC-073** (PR-09/FR-SDK-005) Given keyboard-only navigation, then the widget is fully operable, focus is
never stolen from the page outside the modal, and streamed text is announced politely.
**AC-074** (PR-07/FR-SES-003) Given a streamed answer, then events arrive in order and the persisted message
equals the concatenated deltas.

### API and integrations

**AC-080** (PR-24/FR-API-001) Given the OpenAPI document, when running the generator, then the client builds
and its types match the runtime responses (contract test).
**AC-081** (PR-24/FR-API-002) Given a validation error, then the response is `application/problem+json` with
`code`, `request_id`, and `errors[]` keyed by field.
**AC-082** (PR-24/FR-API-003) Given 10k applications, when listing with `limit=100`, then the response is
≤ 100 rows with `next_cursor`, and page 2 has no overlap.
**AC-083** (PR-25/FR-API-004) Given a webhook receiver, when validating the signature with the documented
scheme, then tampered body/timestamp is rejected and replay is blocked.
**AC-084** (PR-25/FR-API-005) Given an MCP server registration, when discovery runs, then its tools appear
with schemas and require an explicit policy mapping before use.

### Studio and demo

**AC-090** (PR-27/FR-STU-001) Given a fresh organization, when opening Studio, then every page in doc 59 §4
loads real data and no mock module is imported (build-time assertion).
**AC-091** (PR-28/FR-STU-002) Given a run in progress, then Studio's live view receives streamed updates
within 2 s.
**AC-092** (PR-28) Given a completed run, then the trace shows intent, plan, retrieval chunks, provider,
model, tokens, latency, cost, policy decision, approval, tool call, and verification.
**AC-093** (PR-35) Given the demo application, when executing the five canonical journeys, then each
verifies a real state change (record created, membership exists, source cited).

### Operations

**AC-100** (PR-33) Given a release, then migrations apply, `/healthz` returns 200 with dependency detail,
and one authenticated read succeeds on the deployed origin.
**AC-101** (PR-34) Given an induced worker failure, then an alert fires within 5 min and the runbook step is
applicable.
**AC-102** (PR-29/FR-OPS-002) Given 24 h of traffic, then usage rollups reconcile with provider-reported
token counts within 2%.

---

## 5. Traceability

| AC range | Requirements | Primary test location |
|---|---|---|
| AC-001–006 | PR-01..05 | `apps/api/tests/auth`, `tests/rls` |
| AC-010–013 | PR-04, 06, 26 | `apps/api/tests/applications` |
| AC-020–023 | PR-10..12 | `packages/sdk-core/tests`, `apps/api/tests/visual` |
| AC-030–036 | PR-13..16 | `services/ingestion/tests`, `apps/api/tests/knowledge` |
| AC-040–047 | PR-17..20 | `services/agent-worker/tests` |
| AC-050–054 | PR-30..32 | `apps/api/tests/providers` |
| AC-060–066 | PR-21..23 | `packages/ghost-cursor/tests` |
| AC-070–074 | PR-07..09 | `packages/sdk-*/tests`, `tests/e2e` |
| AC-080–084 | PR-24..25 | `apps/api/tests/contract`, `tests/e2e` |
| AC-090–093 | PR-27, 28, 35 | `tests/e2e`, `apps/studio` |
| AC-100–102 | PR-33, 34, 29 | `tests/ops`, CI workflow |

## 6. Definition of "passing"

A criterion passes only when the test runs in CI (or is explicitly marked manual with a recorded result),
fails if the behavior regresses, and asserts the observable outcome — not that no exception was thrown.

## 7. Related documents

[02](02-PRODUCT-REQUIREMENTS.md) · [05](05-FUNCTIONAL-REQUIREMENTS.md) ·
[62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md) ·
[../steering/DEFINITION-OF-DONE.md](../steering/DEFINITION-OF-DONE.md) ·
[../REQUIREMENT-TRACEABILITY.md](../REQUIREMENT-TRACEABILITY.md)
