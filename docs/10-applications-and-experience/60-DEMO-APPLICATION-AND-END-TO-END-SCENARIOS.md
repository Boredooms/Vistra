# Demo Application and End-to-End Scenarios

**Doc ID:** 60 · **Status:** Approved · **Area:** Experience
**Depends on:** [54](../09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) · **Related:** [62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md), [45](../07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md), [08](../01-product-and-ideation/08-ACCEPTANCE-CRITERIA.md)

---

## 1. Purpose

Define "Acme Workspace", the reference SaaS application that embeds VISTRA, and the end-to-end scenarios that
prove the platform works. The demo is the integration test for the whole product.

## 2. Why a real app

- It forces the backend contracts to be usable by an ordinary product team.
- It exercises DOM complexity (tables, charts, dialogs, forms) that fixtures cannot fake.
- It is the Playwright target for journeys that must verify real state changes.
- It is the public proof that Guide and Do modes work on a real interface.

## 3. Application scope

A small project-management SaaS (Next.js) with its own database tables (schema `acme`, separate from VISTRA's):

| Page | Contents |
|---|---|
| `/dashboard` | KPI cards, recent activity, revenue chart (SVG), task table |
| `/projects` | Project list with filters, create dialog |
| `/projects/{id}` | Project detail, members, tasks, activity |
| `/team` | Members table, invite dialog, roles |
| `/analytics` | Churn-risk chart, cohort table, export button |
| `/billing` | Plan card, invoice list, upgrade CTA |
| `/settings` | Workspace settings, API keys, danger zone |
| `/docs` | In-app documentation (also a knowledge source) |
| `/support` | Contact form + the VISTRA widget launcher |

Key UI affordances for VISTRA (documented in the demo README):
`data-vistra-target` on nav links, primary buttons, table rows, and dialogs; `data-vistra-ignore` on decorative
chart internals.

## 4. Demo data

Seeded, realistic, deterministic:

- 1 workspace ("Acme Inc"), 6 users with roles, 12 projects, ~200 tasks, 24 invoices, 8 months of analytics.
- Documents: pricing.md, onboarding.md, api-guide.md, security.md, 2 PDFs (plan comparison, SLA).
- One "conflicting" doc pair (old pricing v2 vs current pricing) to exercise conflict handling.
- One restricted collection ("Internal runbooks") available only to the `admin` role.

## 5. Host tools (the customer API)

| Tool | Method/path | Side effect | Verification |
|---|---|---|---|
| `projects_create` | POST `/api/acme/projects` | write | GET by name |
| `projects_list` | GET `/api/acme/projects` | read | — |
| `projects_delete` | DELETE `/api/acme/projects/{id}` | external | GET 404 |
| `team_invite` | POST `/api/acme/team/invites` | external | GET member by email |
| `team_get_member` | GET `/api/acme/team/members?email=` | read | — |
| `billing_get_plan` | GET `/api/acme/billing/plan` | read | — |

All are real endpoints backed by the demo DB, authenticated with a service token that VISTRA stores as a
credential. No tool is mocked in the demo.

## 6. Canonical journeys

### J1 — Grounded answer with citation

1. Open `/billing`, open the widget, ask "What's included in the Starter plan?"
2. Expected: answer states 3 projects / 3 members / 5 GB, with a citation to `pricing.md` §Starter.
3. Assert: `message_citations` row exists, `grounded=true`, citation page/section matches the seed document.

### J2 — Element question

1. On `/analytics`, select the "Churn risk by cohort" chart, ask "What does this show?"
2. Expected: answer names the element, explains the metric, cites `onboarding.md` or `api-guide.md` if relevant.
3. Assert: the request contained the element descriptor (role `img`, accessible name), and the answer text
   includes that name.

### J3 — Guide flow

1. Ask "Show me how to invite a teammate."
2. Expected: cursor points to Team → Invite member; user clicks; dialog appears; flow completes.
3. Assert: `guide_flows.status=completed`, three `guide_steps` with `completed`, no project/member created
   (Guide Mode does not act).

### J4 — Approved action

1. Ask "Create a project called Website Redesign."
2. Expected: approval card with the exact name; approve; success card; project visible in `/projects`.
3. Assert: `tool_invocations.verified=true`, `projects` row exists, audit event for the approval, and a second
   identical request does not create a duplicate.

### J5 — Multi-step workflow

1. Ask "Create a project called Q1 Launch and invite sam@acme.test."
2. Expected: two approvals (or one per policy), project created, invite sent, membership verified.
3. Assert: both records exist; the trace shows two tool invocations and a verification step.

### J6 — Insufficient evidence

1. Ask "What is Acme's refund policy for enterprise contracts?"
2. Expected: explicit "couldn't find this" with suggested sources; no invented policy.
3. Assert: `grounded=false`, no citations, `rag.insufficient_evidence` recorded.

### J7 — Permission-aware retrieval

1. As an end user whose session lacks the `internal` tag, ask "What's the incident escalation process?"
2. Expected: no answer from the restricted collection; suggests contacting an admin.
3. Assert: zero chunks from `Internal runbooks`; no citation ids from that collection.

### J8 — Provider fallback

1. Force the primary provider to fail (test flag).
2. Ask a knowledge question.
3. Expected: answer arrives with a subtle degraded notice; trace shows `fallback_used=true`.

### J9 — Guide failure

1. Rename the "Invite member" button in the DOM (test route `/analytics?brokenGuide=1`).
2. Ask for the guide.
3. Expected: `TARGET_MISSING`, text fallback lists the steps; no cursor movement to a wrong element.

## 7. Acceptance assertions

Each journey has a Playwright test that:

1. Signs in through Clerk (test user).
2. Performs the UI actions.
3. Asserts the API/database state via a test-only admin endpoint (read-only).
4. Asserts the trace fields (intent, grounded, fallback, verified).
5. Cleans up created records.

"Success" never means only that the message rendered.

## 8. Seeding and reset

```bash
pnpm --filter acme-workspace seed      # deterministic; idempotent
pnpm --filter acme-workspace reset     # drops and reseeds the acme schema
```

Seeds create the VISTRA application, agent, tools, collections, and publish a version, so the demo is runnable
without manual Studio clicks. The seed script is idempotent (`ON CONFLICT DO NOTHING` keyed by slugs).

## 9. Failure scenarios in the demo

| Scenario | Demo behavior |
|---|---|
| VISTRA API down | widget shows "can't connect" with retry; the app itself keeps working |
| Knowledge not ready | assistant says docs are still indexing |
| Tool host returns 500 | action card shows failure, no false success |
| User lacks a role for an action | approval card explains the missing role |
| Session expires | silent refresh via the demo's mint endpoint |

## 10. What the demo must not do

- Hardcode AI answers or "simulate" the agent.
- Bypass policy for convenience.
- Use a separate API from the real one.
- Ship demo credentials to production environments.

## 11. Acceptance criteria

- [ ] J1–J9 pass in CI against the local stack.
- [ ] Every host tool is a real endpoint with verification.
- [ ] Seeds are idempotent and produce a working agent.
- [ ] Guide Mode never mutates data (asserted).
- [ ] The demo can be reset to a known state in < 60 s.

## 12. Related documents

[08](../01-product-and-ideation/08-ACCEPTANCE-CRITERIA.md) · [45](../07-agents-and-execution/45-TOOL-REGISTRY-AND-FUNCTION-CALLING.md) ·
[53](../08-visual-and-ghost-cursor/53-VISUAL-GUIDANCE-AND-VERIFICATION.md) ·
[54](../09-sdk-and-integrations/54-JAVASCRIPT-AND-REACT-SDK.md) ·
[62](../11-quality-security-and-operations/62-TESTING-STRATEGY.md)
