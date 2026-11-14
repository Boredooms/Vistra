# Widget and Embedding Architecture

**Doc ID:** 55 · **Status:** Approved · **Area:** SDK / UI
**Depends on:** [54](54-JAVASCRIPT-AND-REACT-SDK.md) · **Related:** [51](../08-visual-and-ghost-cursor/51-GHOST-CURSOR-ENGINE.md), [49](../08-visual-and-ghost-cursor/49-VISUAL-CONTEXT-ENGINE.md), [56](56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md)

---

## 1. Purpose

Define the embeddable UI: isolation strategy, layout, states, theming, accessibility, performance, and the
hosted/iframe variant. The widget is the customer's first impression and the most common source of integration
bugs.

## 2. Isolation strategy

| Concern | Approach |
|---|---|
| CSS | Single Shadow DOM root (`attachShadow({ mode: "open" })`), `:host { all: initial }` |
| JS globals | No global variables; IIFE build; single registered custom element optional |
| z-index | Configurable, default `2147483000`; documented collision strategy |
| Fonts | System stack; no downloads |
| Events | Listeners on `window` are namespaced and removed on destroy |
| Host page mutation | None (except the overlay/host node it owns) |

Iframe mode is used only for the **hosted** variant (customers without a build step who need strict isolation);
the embedded SDK variant uses Shadow DOM to keep layout/scroll behavior natural.

## 3. Layout

```
┌─────────────────────────────┐
│ Header: title, agent, close │
├─────────────────────────────┤
│ Messages (virtualized)      │
│  ├ assistant text           │
│  ├ citation chips           │
│  ├ tool proposal card       │
│  └ approval card            │
├─────────────────────────────┤
│ Composer: input, send, mic? │
└─────────────────────────────┘
```

- Panel: 380×560 px desktop, full-screen sheet on mobile (<640 px).
- Launcher: 48 px circular button, 16 px inset, bottom-right by default; configurable corner.
- Max panel height: `min(80vh, 720px)`; respects `env(safe-area-inset-*)`.
- Message list uses `ResizeObserver` + `scrollIntoView({ block: "end" })` only when the user is pinned to bottom.
- No layout shift: the host node is fixed-position and zero-size until opened.

## 4. States

| State | UI |
|---|---|
| Idle | Launcher only |
| Open, empty | Greeting + 3 suggested questions (from agent config; neutral defaults otherwise) |
| Streaming | Token-by-token text, typing indicator only before first token, input disabled with cancel |
| Citations | Numbered chips under the message; opens a source card with title/page/snippet |
| Tool proposed | Card with tool name, human summary, "Approve"/"Cancel" (if required) |
| Tool running | Spinner + "Working…" + cancel |
| Tool verified | Success card with the verified fact ("Project 'Website Redesign' was created") |
| Tool failed | Error card with retry (only if safe) and `request_id` |
| Insufficient evidence | Neutral message + suggested sources |
| Degraded (provider) | Subtle banner: "Reduced capability — answers may be less detailed" |
| Guide active | Step indicator + text fallback list |
| Error | Inline card, retry, request id, support link |

## 5. Theming

```ts
createVistra({
  theme: {
    accent: "#5B5BD6",
    mode: "auto",              // auto | light | dark
    radius: 14,
    fontFamily: "inherit",     // default system stack
    position: "bottom-right",
    launcherLabel: "Ask Vistra",
    logoUrl: "https://…/logo.svg",
    zIndex: 2147483000,
  },
});
```

Tokens are CSS custom properties (`--vistra-accent`, `--vistra-surface`, `--vistra-text`, `--vistra-radius`,
`--vistra-shadow`). Contrast is validated at runtime: if the accent fails 4.5:1 with the chosen text color, the
widget falls back to the accessible default and warns in debug mode.

## 6. Accessibility

- Launcher is a `<button>` with `aria-label` and `aria-expanded`.
- Panel is `role="dialog" aria-modal="false"` with a labelled heading; `Esc` closes.
- Focus is moved into the panel on open and returned to the launcher on close.
- Streaming text container is `aria-live="polite" aria-atomic="false"`; the whole answer is announced once at
  completion, not per token.
- All controls are reachable and operable with a keyboard; visible focus ring.
- Citations are links/buttons with accessible names including the source title.
- Approval cards require an explicit button press (never auto-focus the confirm button).
- Reduced motion: no panel slide, no typing dots animation.
- Screen reader fallback for guides: the step list is in the message stream.

## 7. Performance

| Constraint | Budget |
|---|---|
| Bundle (widget+cursor, gzip) | ≤ 110 KB |
| Mount → interactive | ≤ 250 ms |
| Launcher render cost | ≤ 3 ms |
| Streaming render | ≤ 16 ms per frame (batched updates) |
| Memory after close | < 2 MB retained |
| No main-thread task > 50 ms | enforced by budget test |

Techniques: lazy-load the panel chunk on first open, lazy-load the cursor on first guide, batch SSE deltas with
`requestAnimationFrame`, virtualize long conversations, avoid re-rendering the composer on stream.

## 8. Host integration requirements

```html
<script src="https://cdn.vistra.dev/sdk/v1/vistra.js" async></script>
<script>
  window.Vistra.init({
    appId: "app_01H…",
    getSessionToken: async () => (await fetch("/api/vistra/session", { method: "POST" })).json().then(r => r.token),
  });
</script>
```

- CSP: the host must allow `connect-src https://api.vistra.dev` and `script-src https://cdn.vistra.dev`
  (documented for customers).
- The host backend must expose a session-minting endpoint (doc 56 §4).
- No cookie access, no `localStorage` writes except a non-identifying UI preference (open state).

## 9. Hosted (iframe) variant

Used when a customer cannot add JS to their app (e.g. CMS page) or requires hard isolation.

- Served from `https://embed.vistra.dev/w/{app_public_id}`; loaded in an iframe with
  `sandbox="allow-scripts allow-forms allow-same-origin"` (same-origin needed for storage; no top navigation).
- Communicates with the host via `postMessage` with an origin allowlist; the host passes the session token and
  context messages through the bridge.
- Cannot inspect the host DOM (cross-origin) — explicitly a knowledge-only experience; the UI states this.
- CSP `frame-ancestors` restricted to the application's allowlisted domains.

## 10. Lifecycle and cleanup

- `init` → validate → mount launcher → (on open) lazy-load panel.
- `destroy` removes the host node, shadow root, listeners, observers, timers, and in-flight fetches.
- Re-init without destroy is rejected (`ALREADY_INITIALIZED`); `Vistra.reinit()` is not provided.
- Route changes in SPA hosts: the widget persists across navigation; visual context is re-collected per message.

## 11. Failure scenarios

| Scenario | Behavior |
|---|---|
| Session mint fails | Launcher shows an error state; retry button; no infinite loop |
| API unreachable | "Can't connect" card with retry |
| Token expires mid-conversation | transparent refresh; if failed, read-only history |
| Host CSP blocks connect | documented error with the required directive in the console |
| z-index collision | configurable; documented fallback |
| Mobile keyboard opens | panel resizes using `visualViewport`; composer stays visible |
| Multiple init calls | second is a no-op with a warning |

## 12. Testing

- Visual regression at 3 viewports, light/dark, RTL.
- Accessibility: axe (no critical issues), keyboard-only journey, screen-reader announcement check.
- Performance: bundle budget, mount timing, stream render budget.
- Playwright: open → ask → stream → citation → approve → close; mobile keyboard; SPA nav.
- Isolation: host CSS cannot affect the widget; widget CSS cannot affect the host (assert computed styles).

## 13. Acceptance criteria

- [ ] Zero style leakage in both directions (tested).
- [ ] Keyboard and screen-reader paths complete the core journey.
- [ ] Streaming does not re-render the composer or shift layout.
- [ ] Every failure state has a recovery action and a request id.
- [ ] Bundle and timing budgets are enforced in CI.

## 14. Related documents

[49](../08-visual-and-ghost-cursor/49-VISUAL-CONTEXT-ENGINE.md) · [51](../08-visual-and-ghost-cursor/51-GHOST-CURSOR-ENGINE.md) ·
[53](../08-visual-and-ghost-cursor/53-VISUAL-GUIDANCE-AND-VERIFICATION.md) · [54](54-JAVASCRIPT-AND-REACT-SDK.md) ·
[56](56-PUBLIC-API-AND-DEVELOPER-PLATFORM.md) · [59](../10-applications-and-experience/59-VISTRA-STUDIO-ARCHITECTURE.md)
