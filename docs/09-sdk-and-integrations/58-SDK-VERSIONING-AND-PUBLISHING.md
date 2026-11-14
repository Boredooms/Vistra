# SDK Versioning and Publishing

**Doc ID:** 58 · **Status:** Approved · **Area:** DX
**Depends on:** [54](54-JAVASCRIPT-AND-REACT-SDK.md) · **Related:** [23](../04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md), [72](../12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md), [74](../12-deployment-and-release/74-PRODUCTION-RELEASE-AND-ROLLBACK.md)

---

## 1. Purpose

Define how packages are versioned, released, documented, and kept compatible with each other and with the API.
Customers embed the SDK in production pages; a careless release breaks their product.

## 2. Packages and versioning

| Package | Versioning | Compatibility rule |
|---|---|---|
| `@vistra/sdk` | semver | minor = additive; major = breaking |
| `@vistra/react` | semver, peer `@vistra/sdk` | minor may require a new sdk minor (documented) |
| `@vistra/widget` | semver | independent bundle, pins sdk range |
| `@vistra/ghost-cursor` | semver | zero deps; major for API changes |
| `@vistra/api-client` | follows API `/v1`, `0.x` until stable | regenerated, never hand-edited |
| `@vistra/shared-types` | `0.x`, private or published with api-client | types only |

Workspace `workspace:*` during development; published packages pin caret ranges and use `peerDependencies` for
React.

## 3. Changesets workflow

```bash
pnpm changeset            # describe the change and bump type
pnpm changeset version    # apply versions + changelog
pnpm -r build && pnpm -r test
pnpm changeset publish    # requires explicit authorization
```

Rules:
- Every PR touching a package includes a changeset (CI enforces).
- `internal` packages can be excluded.
- Changelog entries are user-facing: behavior, migration note, and links.

## 4. Release channels

| Tag | Purpose | Published from |
|---|---|---|
| `latest` | Stable | release branch after gates |
| `next` | Pre-release for early customers | main after CI |
| `canary` | Per-commit smoke (internal only) | main, not advertised |

Customers pin major (`@vistra/sdk@1`); the CDN URL is major-pinned (`/sdk/v1/vistra.js`) and serves the latest
1.x.

## 5. Release gates

- [ ] Type check, unit tests, Playwright embedding test green.
- [ ] Bundle budgets within limits.
- [ ] Public API surface diff reviewed (no accidental removals).
- [ ] Changelog and migration guide written for majors.
- [ ] Docs site updated and versioned.
- [ ] Backward compatibility test: previous minor's integration test runs against the new build.
- [ ] Security review for new dependencies (none allowed in `ghost-cursor`).
- [ ] Explicit human authorization to publish (doc 74).

## 6. Compatibility matrix

| SDK | API | Widget | Cursor | Notes |
|---|---|---|---|---|
| 1.0–1.2 | v1 | 1.x | 1.x | initial |
| 1.3 | v1 | 1.3+ | 1.x | streaming resume |
| 2.0 | v1 | 2.x | 2.x | typed errors change `code` casing? no — additive only |

A major SDK release must still work against the supported `/v1` API for its entire support window.

## 7. Deprecation policy

1. Announce in the changelog and docs with a migration example.
2. Keep the old API working for ≥ 2 minor releases or 90 days (whichever is longer).
3. Emit a console warning in development builds only.
4. Remove only in a major.

Server-side deprecations follow doc 23 §11 (`Deprecation`/`Sunset` headers).

## 8. Distribution

| Channel | Artifact |
|---|---|
| npm | `@vistra/*` packages |
| CDN | `https://cdn.vistra.dev/sdk/v1/vistra.js` (IIFE, SRI hash published) |
| Docs | versioned reference per major |
| Source maps | published to a private artifact store, not the CDN |

Every CDN artifact is content-hashed, immutable-cached, and accompanied by an SRI hash in the docs so hosts can
pin integrity.

## 9. Testing across versions

- `tests/compat/` runs the demo integration against the current + previous minor SDK.
- Type tests pin the public surface; a removal fails CI.
- A canary workspace app installs `next` on every merge.

## 10. Failure scenarios

| Scenario | Behavior |
|---|---|
| Bad release published | deprecate the version (`npm deprecate`), publish a patch, CDN rollback to previous artifact |
| CDN serves stale artifact | immutable URLs per version; `/v1/` alias updated atomically |
| Peer dependency mismatch | clear install-time error with the required range |
| Breaking change slips into a minor | revert, publish patch, add a type-level regression test |

## 11. Acceptance criteria

- [ ] No package publishes without a changeset and a green gate.
- [ ] Public API changes are detectable in CI.
- [ ] CDN artifacts are immutable and SRI-published.
- [ ] Deprecations follow the documented window.
- [ ] Publishing requires explicit authorization.

## 12. Related documents

[23](../04-backend-and-api/23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) · [54](54-JAVASCRIPT-AND-REACT-SDK.md) ·
[72](../12-deployment-and-release/72-CI-CD-AND-GITHUB-ACTIONS.md) ·
[74](../12-deployment-and-release/74-PRODUCTION-RELEASE-AND-ROLLBACK.md)
