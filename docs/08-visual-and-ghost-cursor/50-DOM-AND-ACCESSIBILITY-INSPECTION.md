# DOM and Accessibility Inspection

**Doc ID:** 50 · **Status:** Approved (normative) · **Area:** Visual
**Depends on:** [49](49-VISUAL-CONTEXT-ENGINE.md) · **Related:** [52](52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md), [55](../09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md)

---

## 1. Purpose

Define how VISTRA reads the page: the accessibility summary, the DOM landmark summary, element descriptors,
stability checks, and the performance and privacy constraints on reading a customer's DOM.

## 2. Principles

1. **Accessibility first.** The accessible role and name are the primary identifiers — they match what users see
   and hear, and they survive styling changes.
2. **Read-only.** VISTRA never mutates host DOM except its own overlay nodes.
3. **Bounded.** Summaries are capped; the raw DOM is never uploaded.
4. **Deterministic.** Same DOM → same summary ordering.
5. **Unstable by default.** Anything can change; treat every reference as provisional.

## 3. Accessibility summary

Computed in-browser (not via a server-side DOM parser):

```
walk(document.body):
  skip: [aria-hidden=true], [data-vistra-ignore], script/style/noscript/template
  for each element:
    role = explicit role || implicit role (button, link, heading, textbox, checkbox, img, list, row, dialog…)
    name = accessible name (aria-labelledby → aria-label → label[for] → alt → text content (trimmed))
    include if: interactive, heading, landmark, img with name, form field, table, dialog, alert
    depth limit: 12; node limit: 400
```

Name computation follows the accessible-name algorithm in order: `aria-labelledby`, `aria-label`, native label
(`<label for>`, wrapping label), `alt`, `title`, then text content (collapsed, ≤ 80 chars). Hidden nodes are
excluded; `display:none`/`visibility:hidden`/`aria-hidden` are all hidden.

Output per node:

```json
{ "role": "button", "name": "Invite member", "level": null,
  "state": { "disabled": false, "expanded": null, "checked": null },
  "bbox": [1180, 64, 132, 36], "in_viewport": true }
```

## 4. Element descriptor (selection and targets)

```json
{
  "role": "button",
  "name": "Invite member",
  "tag": "button",
  "type": "button",
  "target_id": "invite-member",            // data-vistra-target
  "attrs": { "data-testid": "invite-btn", "aria-expanded": "false" },
  "text": "Invite member",
  "bbox": [1180, 64, 132, 36],
  "path": "main > section.team > header > button:nth-of-type(2)",
  "selector": "[data-vistra-target=\"invite-member\"]",
  "stability": 0.94,
  "in_viewport": true,
  "obscured": false
}
```

`attrs` is an allowlist (`id`, `name`, `type`, `role`, `data-*` except private, `aria-*`, `href` origin-stripped).
Never include `value` for inputs, `style`, or full class lists (unstable).

## 5. Selector strategy

Order (also used by the cursor, doc 52):

1. `data-vistra-target="<id>"` (host-declared, stable by contract)
2. role + accessible name (asserted unique at resolution time)
3. `label[for]` / wrapping label for inputs
4. stable attribute: `data-testid`, `name`, `id` (if not generated-looking), `aria-label`
5. validated CSS path (`nth-of-type` chain), re-validated immediately before use
6. coordinates (last resort, flagged `coordinate_only: true`)

Generated-looking ids (`:r1:`, `ember1234`, `mui-42`, UUIDs) are rejected as unstable.

## 6. Stability scoring

```
stability = 1.0
  - 0.3 if selector relies on nth-of-type
  - 0.3 if id looks generated
  - 0.2 if name is empty
  - 0.2 if element is inside a virtualized list
  + 0.1 if data-vistra-target present
clamp [0,1]
```

Targets with `stability < 0.5` are allowed but flagged; guide plans prefer higher-stability targets.

## 7. Visibility and interactability

| Check | Implementation |
|---|---|
| Attached | `element.isConnected` |
| Visible | non-zero rect, `visibility`, `display`, `opacity > 0` |
| In viewport | rect intersects `innerWidth/innerHeight` after scroll |
| Interactable | not `disabled`, not `aria-disabled=true`, not `pointer-events:none` |
| Not obscured | `document.elementFromPoint(center)` is the element or its descendant |
| Stable position | rect changes < 2 px across two frames |
| In correct container | not inside a closed `<dialog>` or `inert` subtree |

Failing "not obscured" for a legitimate overlay (e.g. a modal is open but the target is behind it) is a real
failure — the guide must not point at something the user cannot click.

## 8. Shadow DOM and iframes

- Open shadow roots: traversed; paths are composed (`host >>> inner`).
- Closed shadow roots: not readable; the host must expose `data-vistra-target` on the host element.
- Same-origin iframes: traversed with a frame prefix; coordinate mapping adds the iframe offset.
- Cross-origin iframes: excluded; `capture_limited` reported. The cursor can point at the iframe element
  itself but not inside it.

## 9. Virtualized lists and dynamic content

- Elements inside virtualized lists (react-window, ag-grid) are re-resolved by role+name after scrolling,
  never by index.
- The cursor's `MutationObserver` handles replacement; a target that disappears triggers re-resolution within a
  retry budget (doc 52 §7).
- Text content used as a name is re-read at resolution time, not cached from capture.

## 10. Performance

| Constraint | Budget |
|---|---|
| A11y summary on 5k nodes | ≤ 50 ms |
| Element descriptor | ≤ 5 ms |
| Full capture (no screenshot) | ≤ 60 ms |
| Layout thrash | zero forced reflows in a loop; batch reads |
| Memory | no retained references to removed nodes (WeakRef where needed) |

Implementation notes: single `TreeWalker` pass, avoid `getComputedStyle` per node (compute visibility from
ancestor chain), use `requestIdleCallback` for non-critical summaries.

## 11. Privacy

- Never read input values (only presence/type/disabled state).
- Never read `data-vistra-private` subtrees.
- Strip query strings from URLs in descriptors.
- Do not serialize `href` beyond origin + path.
- Element text is capped and passed through PII redaction when enabled.

## 12. Failure scenarios

| Scenario | Behavior |
|---|---|
| Huge DOM | node limit + priority trimming; `size_truncated` |
| Detached element selected | `SELECTION_STALE`; ask to reselect |
| Duplicate role+name | resolver returns `TARGET_AMBIGUOUS` |
| Closed shadow root | target id required; otherwise `TARGET_UNRESOLVABLE` |
| Cross-origin iframe | limitation; no traversal |
| Page with CSP blocking inline styles | overlay uses adopted stylesheets/`style` attributes on its own nodes only |

## 13. Testing

- Fixture pages per case in §12, plus ARIA-heavy and malformed-HTML pages.
- Assert accessible names match `@testing-library/dom`'s computation for 40 representative nodes.
- Performance budget test with a synthetic 5k-node DOM.
- Redaction assertions on inputs and private regions.
- Cross-origin iframe: no traversal, correct limitation flag.

## 14. Acceptance criteria

- [ ] Accessible name/role are correct for standard controls (tested against a reference implementation).
- [ ] No input values are ever serialized.
- [ ] Selectors are validated immediately before use.
- [ ] Ambiguity and staleness produce explicit states, never a guess.
- [ ] Capture stays within the performance budget.

## 15. Related documents

[49](49-VISUAL-CONTEXT-ENGINE.md) · [51](51-GHOST-CURSOR-ENGINE.md) ·
[52](52-GHOST-CURSOR-MOTION-AND-TARGET-RESOLUTION.md) ·
[55](../09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md) ·
[63](../11-quality-security-and-operations/63-SECURITY-THREAT-MODEL.md)

## 16. References

- Accessible Name and Description Computation — https://www.w3.org/TR/accname-1.2/
- WAI-ARIA roles — https://www.w3.org/TR/wai-aria-1.2/
- `elementFromPoint` — https://developer.mozilla.org/en-US/docs/Web/API/Document/elementFromPoint
