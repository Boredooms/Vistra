# Realtime and Event Architecture

**Doc ID:** 25 · **Status:** Approved · **Area:** Backend
**Depends on:** [23](23-API-DESIGN-AND-OPENAPI-CONTRACTS.md) · **Related:** [24](24-SESSION-AND-CONVERSATION-MANAGEMENT.md), [26](26-BACKGROUND-JOBS-AND-WORKERS.md), [55](../09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md)

---

## 1. Purpose

Define how state changes reach clients: event envelope, transports, channels, ordering, replay, auth,
fan-out, and degradation. The same event stream feeds the widget, Studio live sessions, and internal
consumers.

## 2. Transport choices

| Need | Transport | Why |
|---|---|---|
| Agent/message streaming, run progress, Studio live view | **SSE** over `fetch` stream | One-way, proxy-friendly, simple reconnect with `Last-Event-ID`, works through Render |
| Live voice (audio uplink/downlink) | **WebSocket** | Bidirectional, low-latency frames |
| Cursor/guide commands | SSE + client pull of the flow | Commands are small, ordered, and server-authored |
| Internal module/worker coordination | Postgres outbox + Redis signals | No direct process coupling |

`EventSource` is not used because it cannot send an `Authorization` header. The SDK uses `fetch` with a
`ReadableStream` reader and parses SSE frames itself.

## 3. Event envelope

```json
{
  "id": "evt_01H…",
  "type": "agent.step.completed",
  "sequence": 42,
  "session_id": "ses_01H…",
  "run_id": "run_01H…",
  "created_at": "2026-11-14T10:00:00.000Z",
  "schema_version": 1,
  "data": { "step_index": 3, "kind": "retrieval", "status": "succeeded", "latency_ms": 214 }
}
```

Rules: `type` is stable; `data` is additive-only within a schema version; unknown types must be ignored by
clients (forward compatibility); `sequence` is monotonic per session.

## 4. Event catalogue (client-facing)

| Type | When | Payload essentials |
|---|---|---|
| `message.started` | User message accepted | `message_id`, `run_id` |
| `content.delta` | Model token chunk | `message_id`, `delta` |
| `content.segment` | Structured part boundary | `kind` (`text`/`code`/`table`), `text` |
| `citation` | Evidence attached | `chunk_id`, `document_title`, `page`, `section`, `score` |
| `tool.proposed` | Model proposes an action | `tool`, `args_preview`, `side_effect` |
| `approval.required` | Policy requires consent | `approval_id`, `expires_at`, `summary` |
| `tool.executing` | Execution started | `invocation_id`, `tool` |
| `tool.completed` | Execution finished + verified | `status`, `verified`, `result_summary` |
| `guide.flow` | Guide plan ready | `flow_id`, `steps[]` |
| `guide.step` | Step state change | `flow_id`, `index`, `status`, `failure_code?` |
| `run.status` | Run transition | `status`, `step_index` |
| `message.completed` | Final | `message_id`, `usage`, `grounded`, `finish_reason` |
| `error` | Terminal error for the stream | `code`, `message`, `retryable` |
| `ping` | Keep-alive every 15 s | — |
| `stream.end` | Server closes | `reason` |

Internal (not client-facing): `agent.step.*`, `tool.invocation.*`, `usage.*`, `approval.*` domain events,
consumed by workers/analytics.

## 5. SSE contract

```
GET /v1/sdk/sessions/{session_id}/events
Authorization: Bearer <sdk token>
Accept: text/event-stream
Last-Event-ID: 41            # optional resume point

HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-store
Connection: keep-alive
X-Accel-Buffering: no

id: 42
event: content.delta
data: {"delta":"The Starter plan includes","message_id":"msg_01H…"}

: ping

```

- One stream per session; a second stream for the same session is rejected with 409 (`STREAM_ALREADY_OPEN`)
  unless `?takeover=true`.
- Server closes after 10 minutes; the client reconnects with `Last-Event-ID` (backoff 0.5/1/2/4 s, capped 15 s).
- Heartbeat comments every 15 s prevent proxy idle timeouts.
- `X-Accel-Buffering: no` and explicit `flush()` after each frame (Render/nginx buffering).
- Compression is disabled for the stream.

## 6. Replay and ordering

- Every client-facing event is persisted in `session_events` with `sequence`.
- Replay: events with `sequence > Last-Event-ID` are read from Postgres and streamed before live events.
- Dedupe: the client tracks the highest seen sequence; duplicates are ignored.
- Gaps: if a requested sequence was purged (retention), the server sends `stream.reset` and the client
  refetches state from REST.
- Ordering guarantee: per session, strict by sequence. Cross-session ordering is not defined.

## 7. Fan-out

```mermaid
flowchart LR
  W[agent-worker] -->|append event| DB[(session_events)]
  W -->|PUBLISH session:{id}| R[(Redis)]
  A1[api instance 1] -->|SUBSCRIBE| R
  A2[api instance 2] -->|SUBSCRIBE| R
  A1 --> S1[SSE client]
  A2 --> S2[SSE client]
  C[client reconnect] -->|replay from DB| A1
```

- The worker writes the event to Postgres first (durability), then publishes to a Redis channel.
- API instances subscribe and forward to their connected clients; if Redis is unavailable, they poll
  `session_events` every 1.5 s (degraded latency, no data loss).
- Fan-out is at-most-once for live delivery; durability/replay is at-least-once via Postgres. Clients must be
  idempotent by sequence.
- Studio live view uses the same mechanism with a different channel scope (`org:{id}:runs`).

## 8. WebSocket contract (live voice)

```
GET /v1/live/sessions/{id}/ws?ticket=<one-time-ticket>
```

- Browser WebSockets cannot set headers on some platforms; the client obtains a **single-use ticket**
  (`POST /v1/live/tickets`, 30 s TTL) and passes it as a query parameter. Tickets are bound to the session and
  audience and consumed on upgrade.
- Frames: JSON control (`start`, `stop`, `interrupt`, `transcript.partial`, `transcript.final`,
  `response.audio`) and binary audio chunks.
- Max frame 64 KB; max session 15 min; heartbeat every 20 s; close codes documented in doc 54.
- Backpressure: if the client buffer exceeds 256 KB, the server drops `transcript.partial` frames (never
  `response.audio` for an active turn) and signals `slow_consumer`.

## 9. Authentication and authorization

- Realtime endpoints require the same token as REST; tenant and session ownership are re-checked on connect.
- A token that expires mid-stream closes the stream with `error SESSION_EXPIRED` after the current frame.
- Studio streams require `run.read`; SDK streams require the session to belong to the token's
  `application_session`.
- Cross-session subscription is rejected with 404 (existence not revealed).

## 10. Backpressure and limits

| Limit | Value |
|---|---|
| Concurrent SSE streams per session | 1 (2 with takeover) |
| Concurrent streams per API instance | 2,000 target |
| Event payload | ≤ 16 KB (larger payloads are referenced by id) |
| Events per second per session | 100 (model streaming is throttled to ~40/s) |
| Client slow-consumer threshold | 256 KB buffered → coalesce deltas, then disconnect |

Delta coalescing: when the client is slow, multiple `content.delta` frames may be merged into one
(`content.segment`) rather than dropped.

## 11. Degradation matrix

| Failure | Client-visible effect | Recovery |
|---|---|---|
| Redis down | Live latency ↑ (polling fallback) | automatic |
| API instance restart | Stream closes; reconnect + replay | SDK automatic |
| Postgres read slow | Replay slower; live unaffected | backoff |
| Worker crash | Stream stalls then `error RUN_INTERRUPTED`, run resumes | automatic resume |
| Provider stall | `ping` continues; timeout produces `error PROVIDER_TIMEOUT` | user retry |
| Proxy buffering misconfig | Deltas batched (visible "chunky" stream) | config fix + test |

## 12. Testing

- Unit: SSE frame formatting, sequence monotonicity, replay cursor logic.
- Integration: two clients on one session (409 takeover), reconnect with `Last-Event-ID`, Redis-down polling.
- E2E (Playwright): streamed answer renders progressively; disconnect/reconnect shows no duplicates.
- Load: 2,000 concurrent streams per instance with p95 delta latency ≤ 150 ms.
- WebSocket: ticket single-use, expired ticket rejected, slow-consumer behavior.

## 13. Acceptance criteria

- [ ] No event is delivered without a persisted row.
- [ ] Reconnect with `Last-Event-ID` produces no gaps or duplicates.
- [ ] Streams close cleanly on token expiry, cancellation, and server shutdown.
- [ ] Redis outage degrades latency without data loss.
- [ ] WebSocket tickets are single-use and short-lived.

## 14. Related documents

[24](24-SESSION-AND-CONVERSATION-MANAGEMENT.md) · [26](26-BACKGROUND-JOBS-AND-WORKERS.md) ·
[43](../07-agents-and-execution/43-AGENT-RUNTIME-AND-ORCHESTRATION.md) ·
[53](../08-visual-and-ghost-cursor/53-VISUAL-GUIDANCE-AND-VERIFICATION.md) ·
[55](../09-sdk-and-integrations/55-WIDGET-AND-EMBEDDING-ARCHITECTURE.md)

## 15. References

- SSE specification — https://html.spec.whatwg.org/multipage/server-sent-events.html
- Render WebSockets — https://render.com/docs/websocket
