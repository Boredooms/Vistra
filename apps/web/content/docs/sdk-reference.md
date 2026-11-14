# SDK reference

The package @vistra/sdk-core is framework-free TypeScript that runs in the browser.

## Vistra.init

Vistra.init takes appId, apiUrl and getSessionToken. getSessionToken calls your server route and returns the token, session id and token lifetime. You may also pass targets, a list of controls guides can point at, and cursor options such as the label and theme.

## ask

vistra.ask sends a message and streams events: run.started, token, citation, provider.trace, tool.proposed, approval.required, verification.succeeded, verification.failed, run.completed and run.failed. It resolves with the final answer, citations and which provider served it.

## approve

When an approval.required event arrives, show the arguments and call vistra.approve with the decision. Approval is bound to the argument hash you were shown.

## select

vistra.select with no argument lets the user click any element on the page. VISTRA then answers using the element's role, accessible name and visible text. Password fields, card fields and anything marked data-vistra-private are never captured.

## guide and guideFlow

vistra.guide creates a guided walkthrough for control ids you know exist. The assistant can also propose one in reply to a question and the cursor runs it automatically.

## destroy

vistra.destroy aborts streams, clears timers and removes the cursor and picker from the page.

## Errors

Errors are RFC 9457 problem documents with a stable code such as ORIGIN_NOT_ALLOWED, SESSION_EXPIRED, POLICY_DENIED, APPROVAL_EXPIRED or PROVIDER_UNAVAILABLE.
