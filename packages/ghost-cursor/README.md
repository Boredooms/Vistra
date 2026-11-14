# @boredooms/vistra-ghost-cursor

A visible guide cursor for web apps. It finds real controls, travels to them with eased motion, shows a short reasoning bubble beside the pointer, and waits for the user. It never clicks or types for the user. Zero dependencies, styles isolated in a shadow root.

```bash
npm install @boredooms/vistra-ghost-cursor
```

```ts
import { GhostCursor } from "@boredooms/vistra-ghost-cursor";

const cursor = new GhostCursor({ label: "Guide", onEvent: (e) => console.log(e.type) });
const result = await cursor.runFlow([
  { target: { id: "nav.team" }, instruction: "Open Team.", action: "click", reason: "Members are managed on Team." },
  { target: { role: "button", name: "Invite member" }, instruction: "Invite someone.", action: "click" },
  { target: { label: "Name" }, instruction: "Type their name.", action: "type" },
]);
// result.status: "completed" | "cancelled" | "interrupted" | "target_missing"
cursor.destroy();
```

Targets resolve in a fixed order: `data-vistra-target`, then role and accessible name, then label or `aria-label`, then a stable data attribute, a validated CSS selector, and visible text. Coordinates are used last and only with `allowCoordinateFallback: true`. Each target must be visible, stable and not covered before the cursor moves. With `prefers-reduced-motion` the cursor jumps and highlights instead of travelling.

Events: `guide.started`, `target.resolved`, `target.missing`, `cursor.moving`, `cursor.hovering`, `step.waiting`, `step.completed`, `step.failed`, `guide.completed`, `guide.cancelled`.
