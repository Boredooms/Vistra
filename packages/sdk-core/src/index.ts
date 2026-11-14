export { Vistra } from "./client";
export { mountWidget } from "./widget";
export type { WidgetHandle, WidgetOptions, WidgetTheme } from "./widget";
export { HttpTransport } from "./transport";
export { collectRoutes, collectTargets, describeElement, isPrivate, summarizePage } from "./context";
export { readSse } from "./sse";
export { VistraApiError } from "./types";
export type {
  ApprovalRequest,
  Citation,
  ContextSnapshot,
  GuideStepWire,
  KnownTarget,
  ProposedGuide,
  ProviderTrace,
  RunResult,
  Selection,
  ServedBy,
  SessionInfo,
  SseMessage,
  Transport,
  VistraEventMap,
  VistraEventName,
  VistraInit,
} from "./types";
