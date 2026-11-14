export { GhostCursor } from "./cursor";
export { resolveTarget, roleOf, accessibleName, defaultIsVisible } from "./resolve";
export type { Resolution, ResolveOptions } from "./resolve";
export { routeMatches, normalizePath, linksToRoute } from "./routes";
export { durationFor, easeInOutCubic, bezier, controlPoints } from "./motion";
export type {
  CursorEvent,
  CursorEventType,
  CursorState,
  FlowResult,
  FlowStatus,
  GhostCursorOptions,
  RunFlowOptions,
  GuideStep,
  Strategy,
  StepAction,
  TargetSpec,
} from "./types";
