# Ghost Cursor Motion and Target Resolution

**Doc ID:** 52 · **Status:** Approved (normative) · **Area:** Visual
**Depends on:** [51](51-GHOST-CURSOR-ENGINE.md) · **Related:** [50](50-DOM-AND-ACCESSIBILITY-INSPECTION.md), [53](53-VISUAL-GUIDANCE-AND-VERIFICATION.md)

---

## 1. Purpose

Specify exactly how the cursor finds a target and how it moves: resolution priority, ambiguity handling,
coordinate math across scroll/zoom/iframes, motion curves, timing, and cancellation. Vague motion specs produce
cursors that feel wrong; vague targeting produces cursors that point at the wrong thing.

## 2. Target resolution priority

| # | Strategy | Match rule | Stability |
|---|---|---|---|
| 1 | Host target id | `[data-vistra-target="<id>"]` unique | Highest — contract with host |
| 2 | Role + accessible name | computed role === and normalized name === | High |
| 3 | Label association | `label[for]` / wrapping label text for form controls | High |
| 4 | Stable attribute | `data-testid`, `name`, `aria-label`, non-generated `id` | Medium |
| 5 | Validated selector | CSS path supplied by the host/plan, re-validated now | Medium-low |
| 6 | Text match | exact visible text of an interactive element | Low |
| 7 | Coordinates | `{x, y}` supplied by host | Lowest — flagged `coordinate_only` |

Normalization for names: trim, collapse whitespace, case-insensitive, strip trailing punctuation and
decorative icons' alt text. Never fuzzy-match silently; fuzzy is used only to produce a suggestion in the
failure event.

**Ambiguity rule:** if a strategy yields > 1 match, stop and try the next strategy. If all strategies are
ambiguous, emit `TARGET_AMBIGUOUS` with the candidate list (role/name/bbox) — never pick the first.

## 3. Resolution algorithm

```ts
async function resolve(target, opts): Promise<ResolvedTarget> {
  const strategies = [byTargetId, byRoleAndName, byLabel, byStableAttr, bySelector, byText, byCoords]
  for (const s of strategies) {
    const matches = s(target).filter(isAttached)
    if (matches.length === 1) return validate(matches[0])
    if (matches.length > 1) continue          // ambiguous → next strategy
  }
  throw new TargetMissing(target)
}

function validate(el) {
  assert visible(el)
  assert interactable(el)                      // skipped for non-interactive highlight targets
  assert notObscured(el)                       // skipped for highlight-only
  assert stablePosition(el)                    // 2 consecutive frames, < 2px delta
  return { el, rect: el.getBoundingClientRect(), stability: score(el) }
}
```

## 4. Coordinate mapping

```
viewportPoint = elementRect.center                       // CSS px, viewport-relative
if inside iframe: viewportPoint += frameOffsetChain      // offsets accumulated per frame
overlayPoint  = viewportPoint                              // overlay is fixed to viewport
if page zoom != 1: overlayPoint *= zoom                    // visual viewport compensation
```

- Use `getBoundingClientRect()` (viewport-relative) — never `offsetTop` chains.
- Clamp the final point to the viewport minus a 24 px margin so the cursor is always visible.
- `visualViewport` events (pinch zoom, on-screen keyboard) trigger recomputation.
- After scrolling, wait one frame + `scrollend` (or 100 ms fallback) before measuring.

## 5. Scroll handling

| Case | Behavior |
|---|---|
| Target below/above viewport | Smooth scroll the nearest scrollable ancestor (or window) so the target sits at 35% viewport height |
| Nested scroll containers | Scroll innermost first, then ancestors, verifiably (max 3 containers) |
| Sticky headers | Add offset so the target is not hidden (measure header height) |
| Horizontal scroll | Scroll into view on x as well |
| Scroll settles | Verify position after `scrollend`/timeout; re-measure before moving |
| `scroll-behavior: smooth` on host | Use `behavior: "smooth"` then wait; fall back to instant if > 400 ms |

## 6. Motion model

Travel path: a cubic Bézier from the cursor's current point `P0` to the target center `P3`, with control points
that produce a natural arc:

```
d = |P3 - P0|
P1 = P0 + (0.30 * d) * normalize(P3 - P0) + perpendicular(0.18 * d)
P2 = P3 - (0.25 * d) * normalize(P3 - P0) + perpendicular(0.10 * d)
```

- Distance-based duration: `duration = clamp(280 + 0.35 * d, 280, 900)` ms.
- Easing: custom cubic-bézier approximating `ease-in-out` with a fast start
  (`cubic-bezier(0.22, 0.61, 0.36, 1)`), sampled per frame.
- Velocity is continuous at arrival (no dead stop) followed by a 120 ms settle with a 2 px overshoot damping.
- Micro-jitter of ±0.6 px at 8 Hz while idle for a "living" feel; disabled under reduced motion.
- The pointer rotates slightly (≤ 8°) toward the direction of travel; rotation is interpolated, not snapped.

| Property | Value |
|---|---|
| Frame rate | target 60 fps; time-based interpolation (delta time), not frame counting |
| Max frame step | 32 ms (tab throttling → jump to target rather than slide) |
| Travel distance | straight-line Bézier, no pathfinding around elements |
| Arrival tolerance | 1 px |
| Click animation | 90 ms scale 1 → 0.82 → 1 + 6 px ripple |
| Trail | 3 ghost points at 40/80/120 ms, opacity 0.18/0.10/0.04 |
| Idle | micro-jitter only; no rAF when fully idle |

## 7. Dynamic DOM

`MutationObserver` on the document (childList + attributes for `disabled`/`aria-hidden`) and
`ResizeObserver` on the target:

- If the target is replaced: re-resolve once immediately; if that fails, retry with backoff
  `[50, 150, 400]` ms within a 2 s budget.
- If the target moves (layout shift): recompute coordinates; if the cursor is en route, re-target mid-flight
  (smooth join, no teleport).
- If the target is removed and re-added elsewhere: treat as a new target (re-validate).
- Exceeding the budget → `TARGET_STALE` or `TARGET_MISSING` with a text fallback.

## 8. Cancellation

`cancel()` aborts immediately: rAF cancelled, tooltip removed, highlight faded over 120 ms (or instantly under
reduced motion), state → `CANCELLED`, and a single `flow.cancelled` event. Cancellation must be safe at any
frame, including mid-scroll and mid-verification.

## 9. Reduced motion

When `prefers-reduced-motion: reduce` (or config `always`):

- No travel animation: pointer appears at the target with a 100 ms fade.
- No trail, no jitter, no overshoot.
- Highlight appears instantly, no scale animation.
- Step text is announced via the live region, and the text step list is shown by default.

## 10. Numeric contracts

| Contract | Value |
|---|---|
| Hotspot offset | `(3.5, 2.5)` CSS px inside the pointer SVG |
| Arrival tolerance | 1 px |
| Min/max travel duration | 280 / 900 ms |
| Scroll settle timeout | 600 ms |
| Re-resolution budget | 2,000 ms total |
| Highlight inset | −4 px around the target rect |
| Tooltip gap | 12 px from the hotspot, 8 px from viewport edges |
| z-index default | 2147483000 |

## 11. Failure scenarios

| Scenario | Behavior |
|---|---|
| Target inside a closed shadow root | `TARGET_UNRESOLVABLE` (host must expose a target id) |
| Target inside cross-origin iframe | point at the iframe element only; `TARGET_IN_SUBFRAME_LIMITED` |
| Zero-size target | `TARGET_NOT_VISIBLE` |
| Target covered by an overlay | `TARGET_OBSCURED` |
| Page scrolls during travel | re-target mid-flight |
| Viewport resized during travel | recompute immediately, no restart |
| Two steps target the same element | second step highlights without re-travel |

## 12. Testing

- Resolution: a fixture per strategy; ambiguity, generated-id rejection, and duplicate-name cases.
- Geometry: scroll offsets, nested containers, iframe offsets, zoom 0.8/1.25/2.
- Motion: duration within bounds, arrival tolerance, mid-flight re-target, cancellation at 3 phases.
- Dynamic DOM: replace/remove/move the target during each state.
- Reduced motion: no transitions, same events.

## 13. Acceptance criteria

- [ ] Target priority is implemented exactly as §2 and tested per strategy.
- [ ] Ambiguity never resolves silently to the first match.
- [ ] Coordinates are correct under scroll, zoom, and iframes.
- [ ] Motion is time-based, cancellable, and within the duration bounds.
- [ ] Reduced motion changes presentation, not semantics.

## 14. Related documents

[50](50-DOM-AND-ACCESSIBILITY-INSPECTION.md) · [51](51-GHOST-CURSOR-ENGINE.md) ·
[53](53-VISUAL-GUIDANCE-AND-VERIFICATION.md) · [49](49-VISUAL-CONTEXT-ENGINE.md)

## 15. References

- `getBoundingClientRect` — https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
- `visualViewport` — https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
- `scrollend` event — https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollend_event
- CSS easing — https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function
