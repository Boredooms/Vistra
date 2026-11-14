/** How a guide step finds its element. Resolution order is fixed (see resolveTarget). */
export interface TargetSpec {
  /** Host target id, matched against `data-vistra-target`. */
  id?: string;
  /** ARIA role (explicit or implicit) of the element. */
  role?: string;
  /** Accessible name (aria-label, label, text content ...). */
  name?: string;
  /** Label / aria-label text. */
  label?: string;
  /** When a step is on another route and exactly one visible link leads there, follow it automatically. Default false. */
  autoNavigate?: boolean;
  /** How long to wait for the user to reach a step's route. Default 45000 ms. */
  navigationTimeoutMs?: number;
  /** Current path provider (defaults to location.pathname). */
  getPath?: () => string;
  /** Demo/autoplay: finish each step on its own after this many ms instead of waiting for the user. */
  autoAdvanceMs?: number;
  /** Stable data attribute, e.g. `{ name: "data-testid", value: "invite" }`. */
  attr?: { name: string; value: string };
  /** CSS selector. Validated before use. */
  selector?: string;
  /** Visible text. */
  text?: string;
  /** Last resort, used only when `allowCoordinateFallback` is true. */
  coordinates?: { x: number; y: number };
}

export type StepAction = "click" | "type" | "view" | "navigate";

/** The only contract the cursor consumes. It knows nothing about VISTRA's backend. */
export interface GuideStep {
  target: TargetSpec;
  instruction: string;
  action?: StepAction;
  /** Why the agent points here. Shown as a typed "Reasoning" bubble beside the cursor. */
  reason?: string;
  /** Route the target lives on ("*" = any). If the user is elsewhere, the cursor first guides them there. */
  route?: string;
}

export type Strategy =
  | "data-vistra-target"
  | "role-name"
  | "label"
  | "data-attribute"
  | "selector"
  | "text"
  | "coordinates";

export type CursorState =
  | "IDLE"
  | "RESOLVING"
  | "MOVING"
  | "HOVERING"
  | "WAITING"
  | "COMPLETED"
  | "TARGET_MISSING"
  | "INTERRUPTED"
  | "CANCELLED";

export type CursorEventType =
  | "guide.started"
  | "target.resolved"
  | "target.missing"
  | "cursor.moving"
  | "cursor.hovering"
  | "step.waiting"
  | "step.completed"
  | "step.failed"
  | "guide.completed"
  | "guide.cancelled";

export interface CursorEvent {
  type: CursorEventType;
  stepIndex?: number;
  detail?: Record<string, unknown>;
}

export type FlowStatus = "completed" | "cancelled" | "interrupted" | "target_missing" | "route_not_reached";

export interface RunFlowOptions {
  /** Resume an interrupted flow (e.g. after a full page load) at this step index. */
  startAt?: number;
}

export interface FlowResult {
  status: FlowStatus;
  state: CursorState;
  completedSteps: number;
  failedStep?: number;
}

export interface GhostCursorOptions {
  /** Coordinates are used only when true, and always last. Default false. */
  allowCoordinateFallback?: boolean;
  /** How long to keep looking for a target that is not (yet) in the DOM. Default 4000 ms. */
  retryBudgetMs?: number;
  document?: Document;
  onEvent?: (e: CursorEvent) => void;
  /** Override visibility detection (used by tests; jsdom has no layout). */
  isVisible?: (el: Element) => boolean;
  zIndex?: number;
  /** Name shown on the cursor pill (Figma-style). Default "VISTRA". */
  label?: string;
  /** When a step is on another route and exactly one visible link leads there, follow it automatically. Default false. */
  autoNavigate?: boolean;
  /** How long to wait for the user to reach a step's route. Default 45000 ms. */
  navigationTimeoutMs?: number;
  /** Current path provider (defaults to location.pathname). */
  getPath?: () => string;
  /** Demo/autoplay: finish each step on its own after this many ms instead of waiting for the user. */
  autoAdvanceMs?: number;
  theme?: { accent?: string; ink?: string; surface?: string; text?: string };
  /** Force reduced motion (otherwise read from the prefers-reduced-motion media query). */
  reducedMotion?: boolean;
}
