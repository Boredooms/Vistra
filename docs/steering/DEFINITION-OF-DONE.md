# Definition of Done

Completion is evidence-based. Each work type below lists **required artifacts** and the **evidence** that
must exist before the item is marked done in `../IMPLEMENTATION-STATUS.md`.

A universal gate applies to everything:

- [ ] `docs/tools/validate-docs.py` passes (docs links, required files, front-matter).
- [ ] The owning document is updated, or explicitly confirmed unchanged.
- [ ] No new lint/type errors in touched packages.
- [ ] The status row in `IMPLEMENTATION-STATUS.md` references the evidence (test name, command, PR, URL).
- [ ] No secrets, mocks, or TODOs hidden in shipped paths.

---

## 1. A documentation task

**Required**
- [ ] Correct location, filename, and `Doc ID` matching the numbering scheme.
- [ ] Purpose/Scope/Non-goals so a reader knows the boundary.
- [ ] Architecture/design section with real decisions, not restatement of the title.
- [ ] Contracts: schemas, tables, endpoints, types, or event names the implementer must honor.
- [ ] Failure modes and error behavior.
- [ ] Security/tenancy implications.
- [ ] Testing strategy.
- [ ] Acceptance criteria that are checkable.
- [ ] Implementation checklist ordered for execution.
- [ ] Related documents + official references (real URLs).

**Evidence**
- [ ] `python docs/tools/validate-docs.py` passes; links resolve; Mermaid fences balanced.
- [ ] Named entities (tables, endpoints, env vars) match the canonical docs — no contradictions.
- [ ] `DOCUMENTATION-MAP.md` row exists for the document.

**Not done if:** it is a placeholder, restates the prompt, has diagrams with no corresponding written
design, or invents API/SDK names that official docs do not contain.

---

## 2. A database change

**Required**
- [ ] Forward-only migration `NNNN_*.sql`; no edits to applied migrations.
- [ ] `organization_id` + FK + leading index on every tenant-scoped table.
- [ ] RLS enabled **and forced**; policies for `select/insert/update/delete` as applicable.
- [ ] Constraints: PK, FKs with explicit `ON DELETE`, `CHECK`s, unique keys.
- [ ] Indexes justified by a query pattern (documented in the schema doc).
- [ ] Rollback/back-out note (and data-retention implication if destructive).
- [ ] Schema doc (`../03-database-and-identity/16-...`) updated with the table/columns.
- [ ] Generated DB types regenerated.

**Evidence**
- [ ] Migration applies cleanly to an empty database **and** to a snapshot of the previous schema.
- [ ] Cross-tenant denial test: org B cannot read/write org A's rows (select/insert/update/delete).
- [ ] Service-role path test: privileged query is still org-scoped.
- [ ] Constraint tests (duplicate key, FK violation, check violation) fail as expected.
- [ ] Query plan sanity for the primary access path on seeded data.

---

## 3. A backend feature

**Required**
- [ ] Module layering respected: `router → service → repository`; policy in `policies.py`.
- [ ] Pydantic request/response models; no `Any` in the public surface.
- [ ] OpenAPI operation documented (auth, scopes, errors, pagination, idempotency).
- [ ] Typed domain errors with stable codes; problem+json envelope.
- [ ] Audit event emitted for privileged/administrative/subject-access operations.
- [ ] Structured logs with `request_id`, `organization_id`, `actor_type`.
- [ ] Unit + integration tests, including 401/403/404/422 and cross-tenant cases.

**Evidence**
- [ ] `pytest` output for the module (pass counts shown, not summarized from memory).
- [ ] Coverage ≥ 80% on changed service/policy files.
- [ ] `mypy --strict` clean on changed files; `ruff` clean.
- [ ] Manual or automated verification of one real request against a local DB.

---

## 4. An AI integration

**Required**
- [ ] Implemented behind the provider port; capability registered in the matrix (doc 31).
- [ ] Model IDs from the registry/config, never literals in logic.
- [ ] Structured output validated against a VISTRA schema; retries bounded; failures classified.
- [ ] Fallback path declared and capability-gated (no vision→text downgrade).
- [ ] Token/latency/cost recorded per call; `fallback_used` and `provider` surfaced in traces.
- [ ] Prompt versioned; prompt-injection defenses applied where external text enters.
- [ ] Eval fixtures added for the new capability.

**Evidence**
- [ ] Adapter tests: success, timeout, 5xx, 429, malformed JSON, invalid schema, auth failure.
- [ ] Fallback test: primary forced to fail → secondary serves **and** the trace records it.
- [ ] Unsupported-capability test: explicit `CapabilityUnavailable`, no silent degradation.
- [ ] Live smoke test optional and explicitly reported as not run when keys are absent.

---

## 5. An agent capability

**Required**
- [ ] Agent definition + version row; configuration validated and versioned.
- [ ] Tool(s) registered with JSON Schema arguments and permission requirement.
- [ ] Policy rule: default deny; explicit allow/approval; argument constraints where relevant.
- [ ] Run/step persistence at every transition; resumable after worker restart.
- [ ] Idempotency key on side-effecting tools; duplicate-invocation protection.
- [ ] Independent verification step for side effects (state check, not model claim).
- [ ] User-safe execution events; no private reasoning exposed.

**Evidence**
- [ ] Tests: happy path, missing tool, invalid args, policy deny, approval required/approved/rejected,
      timeout, retry, duplicate request, verification failure, cancellation.
- [ ] Resume test: kill mid-run → restart → completes without duplicate side effect.
- [ ] Trace inspection showing plan → policy → approval → execution → verification.

**Not done if:** the model's own "success" text is the only verification, or the tool executed without a
policy decision record.

---

## 6. A Ghost Cursor feature

**Required**
- [ ] Target resolution implements the documented priority order (doc 52), with a stable target contract.
- [ ] Pre-move validation: exists, visible, interactable, stable, not obscured.
- [ ] State machine transitions implemented; terminal states reachable.
- [ ] Scroll container handling (nested), viewport resize, dynamic DOM retry budget.
- [ ] Cancellation and teardown remove listeners, observers, and injected nodes.
- [ ] `prefers-reduced-motion` degrades to non-motion highlight.
- [ ] Guide Mode vs Do Mode separation preserved.

**Evidence**
- [ ] Tests: target found/missing/ambiguous/hidden, mid-scroll, DOM replaced, resize, cancel, reduced
      motion, multi-step completion.
- [ ] Manual verification in the demo app on at least one real page (recorded, with target name).
- [ ] No global CSS leakage (verified by inspecting `document.styleSheets` / shadow root boundary).

**Not done if:** animation runs on hardcoded coordinates only, or completion is inferred from the
animation finishing.

---

## 7. An SDK feature

**Required**
- [ ] Public TypeScript types exported; no `any`; TSDoc on every public member.
- [ ] Config validated with actionable errors; defaults documented.
- [ ] `destroy()`/cleanup releases timers, listeners, DOM nodes, sockets, and object URLs.
- [ ] No secrets; only public app id, session token, and host context.
- [ ] Versioning impact assessed (semver), changelog entry.
- [ ] Works in ESM and the documented script-tag bundle.

**Evidence**
- [ ] Type-level tests for the public surface; runtime tests for lifecycle and error paths.
- [ ] Playwright embedding test in the demo app: init → session → ask → guide → destroy → no leaks.
- [ ] Bundle size delta reported; tree-shaking verified for unused exports.

---

## 8. A frontend feature

**Required**
- [ ] Uses the generated API client; no hand-written fetch/response types.
- [ ] Real backend data — no mocks in shipped paths.
- [ ] Loading, empty, error, and permission-denied states implemented.
- [ ] Auth via Clerk session token; tenant context server-derived.
- [ ] Accessibility: keyboard path, focus management, `aria-live` for streaming, contrast.
- [ ] Responsive at documented breakpoints; no layout shift on stream.

**Evidence**
- [ ] `tsc --noEmit` and component tests pass.
- [ ] One Playwright journey covering the user-visible flow against the real local stack.
- [ ] Screenshot or recording of the verified state (when UI review is requested).

**Not done if:** the page renders seeded/static JSON instead of calling the API.

---

## 9. A deployment

**Required**
- [ ] Environment variables enumerated and set per environment; no defaults for secrets.
- [ ] Migrations applied and verified against the target database.
- [ ] Health/readiness endpoints respond; worker heartbeat visible.
- [ ] CORS, redirect URLs, and auth callbacks updated for the target origin.
- [ ] Rollback procedure documented and rehearsed (image tag or Vercel deployment).
- [ ] Alerts configured for error rate, latency, queue depth, provider failures.

**Evidence**
- [ ] Build log and deploy log captured.
- [ ] `GET /healthz` and one authenticated read verified on the deployed origin.
- [ ] Error rate and p95 latency observed for the release window (with numbers).
- [ ] Rollback executed once in staging, or explicitly reported as unrehearsed.

**Not done if:** "deployed" means only that CI turned green, or the health check was never called.

---

## 10. Release gate (whole platform)

A release candidate is done when:

- [ ] All P0 requirements in `../REQUIREMENT-TRACEABILITY.md` are implemented with passing tests.
- [ ] Security suite green: cross-tenant denials, auth bypass attempts, SSRF, upload abuse, prompt
      injection, webhook replay.
- [ ] Provider fallback demonstrated under induced primary failure.
- [ ] RAG golden set meets thresholds in `../06-knowledge-and-rag/42-RAG-EVALUATION-AND-QUALITY.md`.
- [ ] E2E journeys in `../10-applications-and-experience/60-...` pass against the real stack.
- [ ] Documentation validation green; no unresolved contradictions in the canonical list (doc 19 of the
      README checklist).
- [ ] `IMPLEMENTATION-STATUS.md` reflects reality, including known gaps and blocked items.
- [ ] Runbook reviewed (`../12-deployment-and-release/75-PRODUCTION-RUNBOOK-AND-INCIDENT-RESPONSE.md`).

---

## Related documents

`./AGENTS.md` · `./ENGINEERING-PRINCIPLES.md` · `../IMPLEMENTATION-STATUS.md` ·
`../REQUIREMENT-TRACEABILITY.md` · `../11-quality-security-and-operations/62-TESTING-STRATEGY.md`
