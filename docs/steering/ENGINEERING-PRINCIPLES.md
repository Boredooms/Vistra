# VISTRA Engineering Principles

Twelve non-negotiable principles. Each states the rule, the failure it prevents, and the concrete
mechanism that enforces it. When a principle and a deadline conflict, the deadline loses or the
exception becomes a written, time-boxed ADR.

---

## P1 — Explicit contracts

**Rule.** Every boundary (HTTP, worker job, tool call, SDK method, provider adapter, DB view) has a
declared, versioned, typed contract. Implicit behavior is a bug.

**Prevents.** Frontends guessing shapes; agents inventing fields; silent breakage on deploy.

**Mechanism.** Pydantic v2 models → OpenAPI 3.1 → generated `@vistra/api-client` types; JSON Schema for
tool arguments and provider structured output; contract tests in CI that fail on schema drift.

---

## P2 — Single responsibility

**Rule.** One module owns one reason to change. A router does not compute policy; a repository does not
call a model; a React page does not implement retrieval.

**Prevents.** God-services, merge conflicts, untestable code, security logic duplicated in three places.

**Mechanism.** The layering in `AGENTS.md` §5, enforced by import-linter rules:
`router → service → repository`, and `service → providers` (never the reverse).

---

## P3 — Modular boundaries with one direction of dependency

**Rule.** Dependencies point inward toward domain services. Modules may call another module's *service
interface*, never its repository or tables.

**Prevents.** The "everything imports everything" monolith that cannot be split later.

**Mechanism.** Module map in `../02-system-architecture/12-SERVICE-BOUNDARIES-AND-MODULE-MAP.md`;
domain events for cross-module side effects; CI check for forbidden imports.

---

## P4 — Secure defaults

**Rule.** Deny by default, allow explicitly. RLS on by default. CORS closed by default. Egress blocked by
default. Tool execution denied unless policy allows. Retention explicit, not infinite.

**Prevents.** The single most common class of platform breach: a permissive default nobody revisited.

**Mechanism.** RLS enabled+forced on all tables; policy engine `deny` fallback; allowlist configuration
that must be filled per environment to function.

---

## P5 — Tenant isolation is structural, not procedural

**Rule.** Tenant identity is carried in the token, resolved server-side, and enforced in SQL. It is never
a parameter a caller can choose, and never a filter added "if we remember".

**Prevents.** Cross-tenant data leakage — the platform-ending failure mode for a multi-tenant AI product.

**Mechanism.** `organization_id` on every scoped row; RLS policies using `auth.jwt()`; mandatory
cross-tenant denial tests; `404` on mismatch to avoid existence leaks.

---

## P6 — Observable execution

**Rule.** Every request, job, agent run, step, tool call, provider call, retrieval, and fallback is
recorded with correlation IDs, timings, and outcome — queryable by support without reading code.

**Prevents.** "It didn't work" with no evidence; unmeasurable cost; unauditable autonomous actions.

**Mechanism.** `request_id` propagation, `agent_runs`/`agent_run_steps`/`tool_invocations` tables,
provider telemetry rows, structured JSON logs, OpenTelemetry traces (doc 64).

---

## P7 — Idempotent operations

**Rule.** Every mutating operation is safe to retry, or explicitly refuses retry. Side effects carry an
idempotency key derived from stable identity.

**Prevents.** Double-created projects, duplicate invites, duplicate charges, duplicate webhook deliveries.

**Mechanism.** `Idempotency-Key` header storage; `(run_id, step_id, tool_id)` tool keys; unique
constraints as the last line of defense; webhook `event_id` dedupe.

---

## P8 — Reproducible builds and environments

**Rule.** The same commit produces the same artifact and behaves the same in local, preview, staging, and
production, modulo configuration.

**Prevents.** "Works on my machine"; undebuggable production-only failures; undocumented manual steps.

**Mechanism.** Locked dependencies (`uv.lock`, `pnpm-lock.yaml`), digest-pinned base images, migrations as
versioned SQL, config validated at boot (fail fast, never default a secret), environment parity matrix in
doc 68.

---

## P9 — Testable by construction

**Rule.** If a module cannot be tested without the network, it is designed wrong. External systems sit
behind ports with fakes.

**Prevents.** Test suites that only run on one laptop; provider outages blocking CI; untested fallback paths.

**Mechanism.** Ports/adapters for providers, storage, and egress; recorded fixtures; local Supabase;
dependency injection via FastAPI `Depends`.

---

## P10 — No fake implementations

**Rule.** A mock, seed, or hardcoded response is never presented as a working feature. Demos use real
APIs. Fixtures exist only in tests and explicitly-labelled seed scripts.

**Prevents.** Fake completion — the failure mode this project's documentation repeatedly calls out:
working frontends on fake backends, cursors that animate without acting, providers that are wired but
never called.

**Mechanism.** Definition of Done requires evidence; `IMPLEMENTATION-STATUS.md` distinguishes
`implemented / blocked / mocked`; PR review rejects mock data in shipped paths.

---

## P11 — No undocumented architectural change

**Rule.** Moving a boundary (identity, datastore, provider, queue, deploy target) requires an ADR before
code. Adding a mechanism that duplicates an existing one is refused.

**Prevents.** Architecture drift by accretion — two auth systems, three retrieval paths, four ways to call
a model.

**Mechanism.** ADR log in `../02-system-architecture/10-ARCHITECTURE-DECISIONS.md`; the red-flag list in
`CLAUDE.md` §8; reviewer checklist in `DEFINITION-OF-DONE.md`.

---

## P12 — Least privilege, everywhere, including the model

**Rule.** The model proposes; the platform disposes. Tokens, service credentials, tool permissions,
retrieval scope, and screen capture scope are all minimized. Humans approve irreversible or
externally-visible actions.

**Prevents.** Prompt-injected exfiltration, autonomous destructive actions, over-broad data capture.

**Mechanism.** Policy engine decisions (`allow|deny|require_approval`), approval records bound to frozen
arguments, capability-scoped session tokens, redaction before capture, SSRF-controlled egress.

---

## Trade-off policy

When principles conflict — e.g. speed vs. P10 — the resolution order is:

1. Tenant isolation and security (P4, P5, P12)
2. Data integrity and idempotency (P7)
3. Contract correctness (P1)
4. Observability (P6)
5. Delivery speed

Honest partial delivery beats dishonest completion: ship the backend contract with real tests and mark the
UI as blocked, rather than shipping a UI on mocks.

---

## Related documents

`./AGENTS.md` · `./DEFINITION-OF-DONE.md` · `../02-system-architecture/10-ARCHITECTURE-DECISIONS.md` ·
`../11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md` ·
`../11-quality-security-and-operations/62-TESTING-STRATEGY.md`
