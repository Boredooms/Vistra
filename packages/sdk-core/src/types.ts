import type { GhostCursorOptions, GuideStep } from "@boredooms/vistra-ghost-cursor";
import type { SseMessage } from "./sse";

/** Returned by the HOST's server route (which holds the API key). The browser never sees an API key. */
export interface SessionInfo {
  token: string;
  session_id: string;
  /** Token lifetime in seconds. The SDK refreshes at 80 % of this. */
  token_ttl: number;
}

/** A control the agent may point at. Auto-discovered from the DOM; hosts can add ones on other routes. */
export interface KnownTarget {
  id: string;
  role?: string;
  name?: string;
  /** Route the control lives on. "*" = present on every page (e.g. navigation). */
  route?: string;
}

/**
 * How the SDK reaches the VISTRA API. The default is HTTP + SSE from the page.
 * Browser extensions provide a transport that proxies through their background worker.
 */
export interface Transport {
  /** JSON request. Throws VistraApiError on non-2xx. */
  request<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
  /** Server-sent event stream for POST endpoints. */
  stream(path: string, body: unknown): AsyncIterable<SseMessage>;
  /** Optional viewport screenshot as a data URL (JPEG). Extensions implement this with captureVisibleTab. */
  captureScreenshot?(): Promise<string | null>;
  /** Releases timers and in-flight requests. */
  close?(): void;
}

export interface VistraInit {
  appId: string;
  /** Required for the default HTTP transport. */
  apiUrl?: string;
  /** Called to mint (no argument) or refresh (previous session) an SDK session token via the host server. */
  getSessionToken?: (previous?: SessionInfo) => Promise<SessionInfo>;
  /** Replace the HTTP transport (e.g. inside a browser extension). */
  transport?: Transport;
  /** Controls the host exposes to guides, including ones on other routes. Merged with DOM discovery. */
  targets?: KnownTarget[];
  /** Routes the host wants the planner to know about. Merged with same-origin links found on the page. */
  routes?: string[];
  /** Discover interactive elements (links, buttons, fields) on pages without data-vistra-target. Default true. */
  autoDiscover?: boolean;
  cursor?: GhostCursorOptions;
  /** Run guide.proposed flows with the Ghost Cursor automatically. Default true. */
  autoGuide?: boolean;
  /** Resume a guide after a full page load and continue multi-page goals. Default true. */
  resumeGuides?: boolean;
  /** Attach a viewport screenshot to context when asking about the page (needs transport.captureScreenshot or this). */
  captureScreenshot?: () => Promise<string | null>;
  fetch?: typeof fetch;
}

export interface Citation {
  id: string;
  chunk_id: string;
  document_id: string;
  title: string;
  page: number | null;
  section: string | null;
  anchor: string | null;
}

export interface ProviderTrace {
  provider: string;
  model: string;
  capability: string;
  status: "ok" | "failed";
  latency_ms: number;
  attempt: number;
  error_class: string | null;
  fallback_used: boolean;
}

export interface ServedBy {
  simulated: boolean;
  provider: string | null;
  model: string | null;
  fallback_used: boolean;
  calls: ProviderTrace[];
}

export interface ApprovalRequest {
  approval_id: string;
  tool: string;
  args: Record<string, unknown>;
  args_hash: string;
  expires_at: string;
  run_id: string;
}

export interface RunResult {
  runId: string;
  status: "completed" | "failed" | "awaiting_approval" | "cancelled";
  answer: string;
  citations: Citation[];
  insufficientEvidence: boolean;
  servedBy?: ServedBy;
  approval?: ApprovalRequest;
  guideFlowId?: string;
  verified?: boolean;
  /** "vision" when a screenshot was understood, "text" when only DOM/accessibility context was used. */
  understanding?: "vision" | "text";
  error?: { code: string; detail: string };
}

export interface Selection {
  role?: string;
  name?: string;
  text?: string;
  tag?: string;
  target_id?: string;
  state?: string;
  near?: string;
  input_type?: string;
  autocomplete?: string;
  private?: boolean;
}

export interface GuideStepWire {
  index: number;
  target: { id: string; role?: string; name?: string };
  route?: string;
  instruction: string;
  reason?: string;
  action: "click" | "type" | "view";
}

export interface ProposedGuide {
  flow_id: string;
  goal: string;
  steps: GuideStepWire[];
  /** The goal continues on the next page; the SDK re-plans there (max 3 hops). */
  continues_on_next_page?: boolean;
}

/** Page context sent before each message. Bounded and redacted on the client and again on the server. */
export interface ContextSnapshot {
  route: string;
  title: string;
  a11y_summary: string;
  selection: Selection | null;
  known_targets: KnownTarget[];
  known_routes: string[];
  screenshot?: string | null;
  url?: string;
}

export type VistraEventMap = {
  "run.started": { run_id: string; simulated: boolean; agent?: { version?: number | null; name?: string } };
  token: { run_id: string; text: string };
  citation: Citation & { run_id: string };
  "provider.trace": { run_id: string; traces: ProviderTrace[] };
  "retrieval.completed": { run_id: string; count: number; passing: number };
  "policy.decision": { run_id: string; tool: string; decision: string; reason: string };
  "tool.proposed": { run_id: string; tool: string; args: Record<string, unknown>; args_hash: string };
  "approval.required": ApprovalRequest;
  "approval.approved": { run_id: string };
  "approval.rejected": { run_id: string };
  "tool.executing": { run_id: string; tool: string };
  "tool.executed": { run_id: string; tool: string; ok: boolean; error?: string };
  "verification.succeeded": { run_id: string; tool: string; detail: string; record?: Record<string, unknown> };
  "verification.failed": { run_id: string; tool: string; detail: string };
  "guide.proposed": ProposedGuide & { run_id: string };
  "run.completed": { run_id: string; answer: string; citations: Citation[]; served_by: ServedBy; insufficient_evidence?: boolean; understanding?: "vision" | "text" };
  "run.failed": { run_id: string; code: string; detail: string };
  "run.cancelled": { run_id: string };
  "session.refreshed": { session_id: string };
  cursor: { type: string; stepIndex?: number; detail?: Record<string, unknown> };
  "guide.resumable": { goal: string; nextStep: number };
  "selection.changed": { selection: Selection | null };
  error: { message: string; code?: string };
};

export type VistraEventName = keyof VistraEventMap;
export type { GuideStep, SseMessage };

export class VistraApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VistraApiError";
  }
  /** Network failure before any HTTP status (offline, DNS, CORS). */
  static network(message: string): VistraApiError {
    return new VistraApiError(0, "NETWORK_ERROR", message);
  }
}
