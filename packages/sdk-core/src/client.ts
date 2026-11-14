import { GhostCursor, normalizePath, routeMatches, type CursorEvent, type GuideStep } from "@vistra/ghost-cursor";
import { collectRoutes, collectTargets, describeElement, summarizePage } from "./context";
import { HttpTransport } from "./transport";
import type {
  ApprovalRequest,
  Citation,
  ContextSnapshot,
  ProposedGuide,
  RunResult,
  Selection,
  ServedBy,
  Transport,
  VistraEventMap,
  VistraEventName,
  VistraInit,
} from "./types";

type Handler<K extends VistraEventName> = (payload: VistraEventMap[K]) => void;
interface StoredGuide { flow: ProposedGuide; next: number; hops: number; path: string; savedAt: number }

const GUIDE_KEY = "vistra.guide.v1";
const MAX_HOPS = 3;
const STORED_TTL_MS = 10 * 60 * 1000;

export class Vistra {
  private handlers = new Map<string, Set<(p: never) => void>>();
  private selection: Selection | null = null;
  private cursor: GhostCursor | null = null;
  private pickerCleanup: (() => void) | null = null;
  private destroyed = false;
  private transport: Transport;
  private hops = 0;
  private pendingScreenshot = false;

  private constructor(private readonly o: VistraInit) {
    if (o.transport) this.transport = o.transport;
    else {
      if (!o.apiUrl || !o.getSessionToken) throw new Error("Vistra.init requires apiUrl and getSessionToken (or a transport)");
      this.transport = new HttpTransport(o.apiUrl, o.getSessionToken, o.fetch, (s) => this.emit("session.refreshed", { session_id: s.session_id }));
    }
  }

  /** One call to embed VISTRA. Resumes a guide interrupted by a full page load. */
  static init(options: VistraInit): Vistra {
    if (!options.appId) throw new Error("Vistra.init requires appId");
    const v = new Vistra(options);
    if (options.resumeGuides !== false && typeof window !== "undefined") queueMicrotask(() => void v.resumeStoredGuide());
    return v;
  }

  // ---- events ----------------------------------------------------------------------------------
  on<K extends VistraEventName>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as (p: never) => void);
    return () => set?.delete(handler as (p: never) => void);
  }

  private emit<K extends VistraEventName>(event: K, payload: VistraEventMap[K]): void {
    for (const h of this.handlers.get(event) ?? []) {
      try {
        (h as Handler<K>)(payload);
      } catch (e) {
        console.error("[vistra] handler error", e);
      }
    }
  }

  // ---- context ---------------------------------------------------------------------------------
  /** Pass an element, null to clear, or nothing to let the user click one (Escape cancels). */
  select(el?: Element | null): Promise<Selection | null> {
    this.pickerCleanup?.();
    if (el === null) {
      this.selection = null;
      this.emit("selection.changed", { selection: null });
      return Promise.resolve(null);
    }
    if (el) {
      this.selection = describeElement(el);
      this.emit("selection.changed", { selection: this.selection });
      return Promise.resolve(this.selection);
    }
    return new Promise((resolve) => {
      const hl = document.createElement("div");
      hl.setAttribute("data-vistra-ui", "");
      hl.style.cssText = "position:fixed;pointer-events:none;border:2px solid #fafafa;box-shadow:0 0 0 4px rgba(250,250,250,.18);background:rgba(250,250,250,.06);z-index:2147482999;border-radius:6px;transition:all .08s ease-out";
      document.body.appendChild(hl);
      const over = (e: MouseEvent) => {
        const t = e.target as Element;
        if (t.closest("[data-vistra-ui]")) return;
        const r = t.getBoundingClientRect();
        Object.assign(hl.style, { left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
      };
      const finish = (s: Selection | null) => { cleanup(); resolve(s); };
      const click = (e: MouseEvent) => {
        const t = e.target as Element;
        if (t.closest("[data-vistra-ui]")) return;
        e.preventDefault();
        e.stopPropagation();
        this.selection = describeElement(t);
        this.emit("selection.changed", { selection: this.selection });
        finish(this.selection);
      };
      const key = (e: KeyboardEvent) => e.key === "Escape" && finish(null);
      const cleanup = () => {
        document.removeEventListener("mouseover", over, true);
        document.removeEventListener("click", click, true);
        document.removeEventListener("keydown", key, true);
        hl.remove();
        this.pickerCleanup = null;
      };
      document.addEventListener("mouseover", over, true);
      document.addEventListener("click", click, true);
      document.addEventListener("keydown", key, true);
      this.pickerCleanup = cleanup;
    });
  }

  get currentSelection(): Selection | null {
    return this.selection;
  }

  /** The exact snapshot sent to the API (useful for debugging what VISTRA "sees"). */
  async snapshot(withScreenshot = false): Promise<ContextSnapshot> {
    const route = normalizePath(location.pathname);
    let screenshot: string | null = null;
    if (withScreenshot) {
      const cap = this.o.captureScreenshot ?? this.transport.captureScreenshot?.bind(this.transport);
      screenshot = cap ? await cap().catch(() => null) : null;
    }
    return {
      route,
      url: location.origin + location.pathname,
      title: document.title,
      a11y_summary: summarizePage(document),
      selection: this.selection,
      known_targets: collectTargets(document, this.o.targets ?? [], route, this.o.autoDiscover !== false),
      known_routes: collectRoutes(document, this.o.routes ?? []),
      screenshot,
    };
  }

  private async sendContext(withScreenshot = false): Promise<void> {
    await this.transport.request("/v1/sdk/context", { method: "POST", body: await this.snapshot(withScreenshot) });
  }

  // ---- ask / approve ---------------------------------------------------------------------------
  async ask(text: string, opts: { forcePrimaryFailure?: boolean; screenshot?: boolean } = {}): Promise<RunResult> {
    const wantShot = opts.screenshot ?? (this.pendingScreenshot || /\b(this page|on (my|the) screen|what am i (looking at|seeing))\b/i.test(text));
    this.pendingScreenshot = false;
    await this.sendContext(wantShot);
    return this.consume(this.transport.stream("/v1/sdk/messages", { message: text, options: { force_primary_failure: !!opts.forcePrimaryFailure } }));
  }

  /** Let the user pick an element, then explain it. */
  async explainSelection(question = "What does this mean?"): Promise<RunResult | null> {
    const sel = await this.select();
    return sel ? this.ask(question) : null;
  }

  /** Explain the current page using a screenshot when available (falls back to DOM/accessibility context). */
  explainPage(question = "Explain this page: what is it for and what can I do here?"): Promise<RunResult> {
    return this.ask(question, { screenshot: true });
  }

  /** Ask for a walkthrough; the Ghost Cursor runs it (including across pages). */
  guideTo(goal: string): Promise<RunResult> {
    this.hops = 0;
    return this.ask(`Show me how to ${goal.replace(/^show me how to\s+/i, "")}`);
  }

  async approve(approval: Pick<ApprovalRequest, "approval_id" | "args_hash">, decision: "approve" | "reject"): Promise<RunResult> {
    return this.consume(this.transport.stream(`/v1/sdk/approvals/${approval.approval_id}`, { decision, args_hash: approval.args_hash }));
  }

  private async consume(stream: AsyncIterable<{ event: string; data: unknown }>): Promise<RunResult> {
    const out: RunResult = { runId: "", status: "completed", answer: "", citations: [], insufficientEvidence: false };
    let tokens = "";
    for await (const m of stream) {
      const d = m.data as Record<string, unknown>;
      this.emit(m.event as VistraEventName, d as never);
      if (typeof d.run_id === "string") out.runId = d.run_id;
      switch (m.event) {
        case "token":
          tokens += String(d.text ?? "");
          out.answer = tokens;
          break;
        case "citation":
          out.citations.push(d as unknown as Citation);
          break;
        case "approval.required":
          out.status = "awaiting_approval";
          out.approval = d as unknown as ApprovalRequest;
          break;
        case "guide.proposed":
          out.guideFlowId = String(d.flow_id);
          if (this.o.autoGuide !== false) void this.guideFlow(d as unknown as ProposedGuide);
          break;
        case "run.completed":
          out.status = "completed";
          out.answer = String(d.answer ?? tokens);
          out.citations = (d.citations as Citation[]) ?? out.citations;
          out.servedBy = d.served_by as ServedBy;
          out.insufficientEvidence = !!d.insufficient_evidence;
          out.verified = d.verified === true;
          out.understanding = d.understanding as RunResult["understanding"];
          break;
        case "run.failed":
          out.status = "failed";
          out.servedBy = d.served_by as ServedBy | undefined;
          out.error = { code: String(d.code ?? "INTERNAL_ERROR"), detail: String(d.detail ?? d.answer ?? "") };
          break;
        case "run.cancelled":
          out.status = "cancelled";
          break;
      }
    }
    return out;
  }

  // ---- guides ----------------------------------------------------------------------------------
  /** Create a guide from known target ids and run it (Guide Mode: nothing is executed for the user). */
  async guide(goal: string, steps: Array<{ target_id: string; instruction: string; reason?: string; action?: "click" | "type" | "view" }>): Promise<void> {
    await this.sendContext();
    const flow = await this.transport.request<ProposedGuide>("/v1/sdk/guides", { method: "POST", body: { goal, steps: steps.map((s) => ({ action: "view", ...s })) } });
    await this.guideFlow(flow);
  }

  private store(s: StoredGuide | null): void {
    try {
      if (s) sessionStorage.setItem(GUIDE_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(GUIDE_KEY);
    } catch {
      /* storage blocked */
    }
  }

  private stored(): StoredGuide | null {
    try {
      const s = JSON.parse(sessionStorage.getItem(GUIDE_KEY) ?? "null") as StoredGuide | null;
      return s && Date.now() - s.savedAt < STORED_TTL_MS ? s : null;
    } catch {
      return null;
    }
  }

  /** After a full page load: continue the stored flow on this page, or re-plan a multi-page goal here. */
  private async resumeStoredGuide(): Promise<void> {
    const s = this.stored();
    if (!s || this.destroyed) return;
    const here = normalizePath(location.pathname);
    if (here === s.path) return; // same page reload: nothing moved
    const next = s.flow.steps[s.next];
    await new Promise((r) => setTimeout(r, 400)); // let the page render
    if (next && (!next.route || routeMatches(next.route, here))) {
      this.emit("guide.resumable", { goal: s.flow.goal, nextStep: s.next });
      this.hops = s.hops;
      await this.guideFlow(s.flow, s.next);
    } else if (s.flow.continues_on_next_page && s.next >= s.flow.steps.length && s.hops < MAX_HOPS) {
      this.hops = s.hops + 1;
      this.store(null);
      await this.ask(`Continue guiding me (step ${this.hops + 1} on this page): ${s.flow.goal}`);
    } else {
      this.store(null);
    }
  }

  async guideFlow(flow: ProposedGuide, startAt = 0): Promise<void> {
    this.cursor?.cancel();
    this.cursor?.destroy();
    const buffer: CursorEvent[] = [];
    const pending: Promise<void>[] = [];
    const startPath = normalizePath(location.pathname);
    let next = startAt;
    const report = (index: number, outcome: string): Promise<void> => {
      const events = buffer.splice(0).map((e) => ({ type: e.type, detail: { ...(e.detail ?? {}) } }));
      return this.transport
        .request(`/v1/sdk/guides/${flow.flow_id}/steps/${index}`, { method: "POST", body: { outcome, events } })
        .then(() => undefined)
        .catch((e) => this.emit("error", { message: String(e) }));
    };
    const persist = () => this.store({ flow, next, hops: this.hops, path: normalizePath(location.pathname), savedAt: Date.now() });
    persist();
    const cursor = new GhostCursor({
      ...this.o.cursor,
      onEvent: (e) => {
        this.o.cursor?.onEvent?.(e);
        this.emit("cursor", e);
        buffer.push(e);
        if (e.type === "step.completed" && e.stepIndex !== undefined) {
          next = e.stepIndex + 1;
          persist(); // survives a full page load triggered by the user's click
          pending.push(report(e.stepIndex, "completed"));
        } else if (e.type === "target.missing" && e.stepIndex !== undefined) pending.push(report(e.stepIndex, "target_missing"));
      },
    });
    this.cursor = cursor;
    const steps: GuideStep[] = flow.steps.map((s) => ({
      target: { id: s.target.id, role: s.target.role, name: s.target.name },
      instruction: s.instruction,
      action: s.action,
      reason: s.reason,
      route: s.route && s.route !== "*" ? s.route : undefined,
    }));
    const result = await cursor.runFlow(steps, { startAt });
    if (result.status === "cancelled") { pending.push(report(Math.min(result.completedSteps, steps.length - 1), "cancelled")); this.store(null); }
    else if (result.status === "interrupted") pending.push(report(result.failedStep ?? 0, "interrupted"));
    else if (result.status === "target_missing" || result.status === "route_not_reached") this.store(null);
    await Promise.all(pending);
    if (result.status === "completed") {
      const moved = normalizePath(location.pathname) !== startPath;
      if (flow.continues_on_next_page && this.hops < MAX_HOPS && moved) {
        // SPA navigation happened during the flow: re-plan on this page right away
        this.hops += 1;
        this.store(null);
        await new Promise((r) => setTimeout(r, 300));
        await this.ask(`Continue guiding me (step ${this.hops + 1} on this page): ${flow.goal}`);
      } else if (!flow.continues_on_next_page) {
        this.store(null);
      }
    }
  }

  cancelGuide(): void {
    this.cursor?.cancel();
    this.store(null);
  }

  /** Ask for a screenshot on the next message (e.g. a widget "explain my screen" toggle). */
  attachScreenshotToNextMessage(): void {
    this.pendingScreenshot = true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.transport.close?.();
    this.pickerCleanup?.();
    this.cursor?.destroy();
    this.cursor = null;
    this.handlers.clear();
  }
}
