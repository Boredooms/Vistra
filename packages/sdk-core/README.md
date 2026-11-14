# @boredooms/vistra-sdk

Browser SDK for VISTRA. Answers come from your own documents with citations, guides move a visible cursor to real controls, and actions run only after approval and are verified afterwards.

```bash
npm install @boredooms/vistra-sdk
```

```ts
import { Vistra } from "@boredooms/vistra-sdk";

const vistra = Vistra.init({
  appId: "app_...",
  apiUrl: "https://api.your-vistra-host.com",
  // your server route exchanges your secret API key for a 15 minute session token
  getSessionToken: (prev) =>
    fetch("/api/vistra/session", { method: "POST", body: JSON.stringify({ session_id: prev?.session_id }) }).then((r) => r.json()),
  targets: [{ id: "nav.team", role: "link", name: "Team", route: "*" }],
});

vistra.on("token", (e) => render(e.text));
vistra.on("approval.required", (a) => showApproval(a)); // then vistra.approve(a, "approve")
const result = await vistra.ask("What does the Starter plan include?");
```

- The browser only ever holds a short-lived session token, refreshed automatically at 80 % of its lifetime.
- `vistra.select()` lets the user click an element to ask about it. Password, card (`autocomplete="cc-*"`) and `data-vistra-private` fields are never captured.
- `vistra.destroy()` aborts streams and removes every listener, timer and DOM node the SDK created.

Errors are RFC 9457 problem documents with stable codes (`ORIGIN_NOT_ALLOWED`, `SESSION_EXPIRED`, `POLICY_DENIED`, `APPROVAL_EXPIRED`, `PROVIDER_UNAVAILABLE`).
