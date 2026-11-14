import { bezier, controlPoints, durationFor, easeInOutCubic, type Pt } from "./motion";
import { defaultIsVisible, resolveTarget, type Resolution } from "./resolve";
import { linksToRoute, routeMatches } from "./routes";
import type {
  CursorEvent,
  CursorEventType,
  CursorState,
  FlowResult,
  GhostCursorOptions,
  GuideStep,
  RunFlowOptions,
} from "./types";

const CSS_TEXT = `
:host{all:initial}
.layer{position:fixed;inset:0;pointer-events:none;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
.layer{--c:#6366f1;--ink:#fff;--bg:#111827;--fg:#fff}
.cursor{position:absolute;left:0;top:0;width:28px;height:28px;will-change:transform;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));opacity:0}
.cursor.on{opacity:1}
.cursor svg path{fill:var(--c);stroke:var(--ink)}
.tag{position:absolute;left:18px;top:22px;white-space:nowrap;background:var(--c);color:var(--ink);font-size:11px;font-weight:600;line-height:1;padding:4px 8px;border-radius:999px 999px 999px 2px}
.thought{position:absolute;left:18px;top:46px;width:max-content;max-width:240px;background:var(--bg);color:var(--fg);border:1px solid var(--c);font-size:12px;line-height:1.45;padding:7px 10px;border-radius:2px 12px 12px 12px;display:none}
.thought.on{display:block}
.thought .k{display:block;font-size:10px;font-weight:600;letter-spacing:.02em;opacity:.65;margin-bottom:2px}
.thought .caret{display:inline-block;width:1px;height:1em;background:currentColor;margin-left:1px;vertical-align:-2px;animation:b 1s steps(2) infinite}
@keyframes b{50%{opacity:0}}
.ring{position:absolute;border:2px solid var(--c);border-radius:8px;box-shadow:0 0 0 4px color-mix(in srgb,var(--c) 25%,transparent);opacity:0;transition:opacity .15s}
.ring.on{opacity:1}
.tip{position:absolute;width:260px;background:var(--bg);color:var(--fg);border:1px solid color-mix(in srgb,var(--c) 40%,transparent);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.4;pointer-events:auto;box-shadow:0 8px 24px rgba(0,0,0,.3);display:none}
.tip.on{display:block}
.dots{display:flex;gap:4px;margin-top:8px}
.dot{width:6px;height:6px;border-radius:50%;background:color-mix(in srgb,var(--fg) 25%,transparent)}
.dot.on{background:var(--c)}
.btns{display:flex;gap:6px;margin-top:8px}
.btns button{font:inherit;font-size:12px;border:0;border-radius:6px;padding:4px 10px;cursor:pointer;background:color-mix(in srgb,var(--fg) 14%,transparent);color:var(--fg)}
.btns button.primary{background:var(--c);color:var(--ink)}
.btns button:focus-visible{outline:2px solid var(--c);outline-offset:2px}
@media (prefers-reduced-motion: reduce){.ring{transition:none}}
`;

const ARROW =
  '<svg viewBox="0 0 28 28" width="28" height="28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M3 2 L3 22 L8.5 17 L12.5 26 L16 24.5 L12 15.5 L19.5 15.5 Z" fill="#6366f1" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
/** The pointer tip inside the 28x28 SVG; positions are offset so the tip lands exactly on the point. */
const HOTSPOT: Pt = { x: 3, y: 2 };

type StepEnd = "done" | "skip" | "cancel" | "interrupted";

export class GhostCursor {
  private doc: Document;
  private opts: Required<Pick<GhostCursorOptions, "allowCoordinateFallback" | "retryBudgetMs" | "zIndex">> & GhostCursorOptions;
  private host: HTMLElement | null = null;
  private cursorEl!: HTMLElement;
  private ringEl!: HTMLElement;
  private tipEl!: HTMLElement;
  private thoughtEl!: HTMLElement;
  private typer: ReturnType<typeof setInterval> | null = null;
  private pos: Pt = { x: 0, y: 0 };
  private hasPos = false;
  private raf = 0;
  private cancelled = false;
  private running = false;
  private destroyed = false;
  private target: Element | null = null;
  private cancelWaiters = new Set<() => void>();
  private cleanups: Array<() => void> = [];
  private _state: CursorState = "IDLE";

  constructor(options: GhostCursorOptions = {}) {
    this.doc = options.document ?? document;
    this.opts = { allowCoordinateFallback: false, retryBudgetMs: 4000, zIndex: 2147483000, ...options };
  }

  get state(): CursorState {
    return this._state;
  }

  private setState(s: CursorState): void {
    this._state = s;
  }

  private emit(type: CursorEventType, stepIndex?: number, detail?: Record<string, unknown>): void {
    const e: CursorEvent = { type, ...(stepIndex !== undefined ? { stepIndex } : {}), ...(detail ? { detail } : {}) };
    this.opts.onEvent?.(e);
  }

  private get reduced(): boolean {
    if (this.opts.reducedMotion !== undefined) return this.opts.reducedMotion;
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  private visible = (el: Element): boolean => (this.opts.isVisible ?? defaultIsVisible)(el);

  // ---- overlay (shadow DOM: no global style leakage, no !important on the host page) ----------
  private mount(): void {
    if (this.host) return;
    const host = this.doc.createElement("div");
    host.setAttribute("data-vistra-cursor-root", "");
    host.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${this.opts.zIndex}`;
    const root = host.attachShadow({ mode: "open" });
    const style = this.doc.createElement("style");
    style.textContent = CSS_TEXT;
    const layer = this.doc.createElement("div");
    layer.className = "layer";
    layer.innerHTML = `<div class="ring"></div><div class="cursor">${ARROW}<span class="tag"></span><div class="thought"></div></div><div class="tip" role="status" aria-live="polite"></div>`;
    const th = this.opts.theme;
    if (th?.accent) layer.style.setProperty("--c", th.accent);
    if (th?.ink) layer.style.setProperty("--ink", th.ink);
    if (th?.surface) layer.style.setProperty("--bg", th.surface);
    if (th?.text) layer.style.setProperty("--fg", th.text);
    (layer.querySelector(".tag") as HTMLElement).textContent = this.opts.label ?? "VISTRA";
    this.thoughtEl = layer.querySelector(".thought") as HTMLElement;
    root.append(style, layer);
    this.doc.body.appendChild(host);
    this.host = host;
    this.ringEl = layer.querySelector(".ring") as HTMLElement;
    this.cursorEl = layer.querySelector(".cursor") as HTMLElement;
    this.tipEl = layer.querySelector(".tip") as HTMLElement;
  }

  private placeCursor(p: Pt): void {
    this.pos = p;
    this.cursorEl.style.transform = `translate(${p.x - HOTSPOT.x}px, ${p.y - HOTSPOT.y}px)`;
  }

  private placeRing(el: Element): void {
    const r = el.getBoundingClientRect();
    Object.assign(this.ringEl.style, {
      left: `${r.left - 4}px`,
      top: `${r.top - 4}px`,
      width: `${r.width + 8}px`,
      height: `${r.height + 8}px`,
    });
  }

  private showTip(el: Element, text: string, index: number, total: number, action: string): void {
    const dots = Array.from({ length: total }, (_, i) => `<span class="dot${i === index ? " on" : ""}"></span>`).join("");
    const hint = action === "click" ? "Click it to continue" : action === "type" ? "Type here, then continue" : "";
    this.tipEl.innerHTML = "";
    const body = this.doc.createElement("div");
    body.textContent = text;
    const small = this.doc.createElement("div");
    small.style.cssText = "opacity:.7;font-size:11px;margin-top:2px";
    small.textContent = `Step ${index + 1} of ${total}${hint ? " - " + hint : ""}`;
    const dotsEl = this.doc.createElement("div");
    dotsEl.className = "dots";
    dotsEl.innerHTML = dots;
    const btns = this.doc.createElement("div");
    btns.className = "btns";
    btns.innerHTML = '<button class="primary" data-act="next">Next</button><button data-act="close">Close</button>';
    this.tipEl.append(body, small, dotsEl, btns);
    this.tipEl.classList.add("on");
    this.positionTip(el);
  }

  private positionTip(el: Element): void {
    const r = el.getBoundingClientRect();
    const w = 260;
    const h = this.tipEl.offsetHeight || 110;
    const vw = this.doc.documentElement.clientWidth;
    const vh = this.doc.documentElement.clientHeight;
    // keep clear of the cursor pill and its reasoning bubble, which hang below the pointer
    const thoughtH = this.thoughtEl?.classList.contains("on") ? this.thoughtEl.offsetHeight + 54 : 0;
    let top = Math.max(r.bottom + 14, this.pos.y + thoughtH + 12);
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 14);
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - w - 8));
    this.tipEl.style.left = `${left}px`;
    this.tipEl.style.top = `${top}px`;
  }

  // ---- cancellation helpers --------------------------------------------------------------------
  private cancelPromise(): { p: Promise<"cancel">; off: () => void } {
    let fn: () => void = () => undefined;
    const p = new Promise<"cancel">((res) => {
      fn = () => res("cancel");
      this.cancelWaiters.add(fn);
    });
    return { p, off: () => this.cancelWaiters.delete(fn) };
  }

  private sleep(ms: number): Promise<"ok" | "cancel"> {
    const c = this.cancelPromise();
    return Promise.race([new Promise<"ok">((r) => setTimeout(() => r("ok"), ms)), c.p]).finally(c.off);
  }

  private nextFrame(): Promise<void> {
    return new Promise((r) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));
  }

  // ---- resolution ------------------------------------------------------------------------------
  private async waitForTarget(step: GuideStep): Promise<Resolution | "cancel"> {
    const deadline = Date.now() + this.opts.retryBudgetMs;
    for (;;) {
      if (this.cancelled) return "cancel";
      const res = resolveTarget(step.target, {
        document: this.doc,
        allowCoordinateFallback: this.opts.allowCoordinateFallback,
        isVisible: this.visible,
      });
      if (res.element && this.isNotObscured(res.element)) return res;
      if (Date.now() >= deadline) return { element: null, strategy: null };
      // DOM may still be changing (route change, dialog opening): wait for a mutation or poll.
      const w = await this.waitMutationOrTimeout(120);
      if (w === "cancel") return "cancel";
    }
  }

  private waitMutationOrTimeout(ms: number): Promise<"ok" | "cancel"> {
    const c = this.cancelPromise();
    let mo: MutationObserver | undefined;
    const mutated = new Promise<"ok">((res) => {
      if (typeof MutationObserver === "undefined") return;
      mo = new MutationObserver(() => res("ok"));
      mo.observe(this.doc.body, { childList: true, subtree: true, attributes: true });
    });
    const timer = new Promise<"ok">((res) => setTimeout(() => res("ok"), ms));
    return Promise.race([mutated, timer, c.p]).finally(() => {
      mo?.disconnect();
      c.off();
    });
  }

  private isNotObscured(el: Element): boolean {
    if (typeof this.doc.elementFromPoint !== "function") return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return true; // no layout info (tests); visibility already checked
    const top = this.doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!top) return true; // outside viewport: scrolled into view afterwards
    return top === el || el.contains(top) || top.contains(el) || !!this.host?.contains(top);
  }

  private async settle(el: Element): Promise<void> {
    el.scrollIntoView?.({ block: "center", inline: "nearest", behavior: this.reduced ? "auto" : "smooth" });
    let last = el.getBoundingClientRect();
    let stable = 0;
    for (let i = 0; i < 40 && stable < 3 && !this.cancelled; i++) {
      await this.nextFrame();
      const r = el.getBoundingClientRect();
      stable = Math.abs(r.top - last.top) < 0.5 && Math.abs(r.left - last.left) < 0.5 ? stable + 1 : 0;
      last = r;
    }
  }

  // ---- motion ----------------------------------------------------------------------------------
  private anchorOf(el: Element): Pt {
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 };
  }

  private async moveTo(dest: Pt): Promise<"ok" | "cancel"> {
    this.cursorEl.classList.add("on");
    if (this.reduced || !this.hasPos) {
      this.placeCursor(dest);
      this.hasPos = true;
      return "ok";
    }
    const from = this.pos;
    const dist = Math.hypot(dest.x - from.x, dest.y - from.y);
    const dur = durationFor(dist);
    const [c1, c2] = controlPoints(from, dest);
    return new Promise<"ok" | "cancel">((resolve) => {
      const start = performance.now();
      const c = this.cancelPromise();
      c.p.then(() => {
        cancelAnimationFrame(this.raf);
        resolve("cancel");
      });
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        this.placeCursor(bezier(from, c1, c2, dest, easeInOutCubic(t)));
        if (t < 1) this.raf = requestAnimationFrame(tick);
        else {
          c.off();
          resolve("ok");
        }
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  // ---- public API ------------------------------------------------------------------------------
  /** Guide Mode only. The cursor never clicks or types: completion is the user acting on the real element. */
  async runFlow(steps: GuideStep[], runOpts: RunFlowOptions = {}): Promise<FlowResult> {
    if (this.destroyed) throw new Error("GhostCursor is destroyed");
    if (this.running) this.cancel();
    this.running = true;
    this.cancelled = false;
    this.mount();
    const start = Math.max(0, Math.min(runOpts.startAt ?? 0, steps.length));
    this.emit("guide.started", undefined, { steps: steps.length, startAt: start });
    let completed = start;
    try {
      for (let i = start; i < steps.length; i++) {
        const step = steps[i] as GuideStep;
        if (step.route && !routeMatches(step.route, this.path())) {
          const nav = await this.guideToRoute(step, i, steps.length);
          if (nav === "cancel") return this.finish("cancelled", "CANCELLED", completed);
          if (nav === "timeout") {
            this.emit("target.missing", i, { target: step.target, reason: "route_not_reached", route: step.route });
            this.emit("step.failed", i, { reason: "ROUTE_NOT_REACHED" });
            return this.finish("route_not_reached", "TARGET_MISSING", completed, i);
          }
        }
        this.setState("RESOLVING");
        const found = await this.waitForTarget(step);
        if (found === "cancel" || this.cancelled) return this.finish("cancelled", "CANCELLED", completed);
        if (!found.element) {
          this.setState("TARGET_MISSING");
          this.emit("target.missing", i, { target: step.target });
          this.emit("step.failed", i, { reason: "TARGET_MISSING" });
          return this.finish("target_missing", "TARGET_MISSING", completed, i);
        }
        const el = found.element;
        this.target = el;
        this.emit("target.resolved", i, { strategy: found.strategy });
        await this.settle(el);
        if (this.cancelled) return this.finish("cancelled", "CANCELLED", completed);
        this.setState("MOVING");
        this.emit("cursor.moving", i);
        this.placeRing(el);
        if ((await this.moveTo(this.anchorOf(el))) === "cancel") return this.finish("cancelled", "CANCELLED", completed);
        this.ringEl.classList.add("on");
        if (this.reduced) this.cursorEl.classList.remove("on"); // reduced motion: highlight only
        this.setState("HOVERING");
        this.emit("cursor.hovering", i);
        this.showReason(step.reason ?? "");
        this.showTip(el, step.instruction, i, steps.length, step.action ?? "view");
        this.setState("WAITING");
        this.emit("step.waiting", i, { action: step.action ?? "view" });
        const end = await this.waitForUser(step, el, i);
        this.hideStep();
        if (end === "cancel") return this.finish("cancelled", "CANCELLED", completed);
        if (end === "interrupted") {
          this.emit("step.failed", i, { reason: "INTERRUPTED" });
          return this.finish("interrupted", "INTERRUPTED", completed, i);
        }
        completed++;
        this.emit("step.completed", i, { by: end });
      }
      this.setState("COMPLETED");
      this.emit("guide.completed");
      return this.finish("completed", "COMPLETED", completed, undefined, false);
    } finally {
      this.running = false;
    }
  }

  private path(): string {
    return this.opts.getPath ? this.opts.getPath() : this.doc.defaultView?.location.pathname ?? "/";
  }

  /**
   * The step lives on another route: point at the link that leads there and wait for the navigation
   * (SPA History API or full load - a full load ends this page; the SDK resumes the flow on the next one).
   */
  private async guideToRoute(step: GuideStep, index: number, total: number): Promise<"ok" | "cancel" | "timeout"> {
    const route = step.route as string;
    const links = linksToRoute(this.doc, route, this.visible);
    const link = links[0];
    this.setState("WAITING");
    this.emit("step.waiting", index, { action: "navigate", route, link: link ? (link.textContent ?? "").trim().slice(0, 80) : null });
    if (link) {
      await this.settle(link);
      this.placeRing(link);
      if ((await this.moveTo(this.anchorOf(link))) === "cancel") return "cancel";
      this.ringEl.classList.add("on");
      this.showReason(step.reason ? `First, open ${route}. ${step.reason}` : `This step is on ${route}.`);
      this.showTip(link, `Open ${(link.textContent ?? route).trim() || route} to continue.`, index, total, "click");
      if (this.opts.autoNavigate && links.length === 1) link.click();
    } else {
      this.showFloatingTip(`Go to ${route} to continue this guide.`, index, total);
    }
    const deadline = Date.now() + (this.opts.navigationTimeoutMs ?? 45000);
    while (!routeMatches(route, this.path())) {
      if (this.cancelled) return "cancel";
      if (Date.now() > deadline) { this.hideStep(); return "timeout"; }
      if ((await this.sleep(150)) === "cancel") return "cancel";
    }
    this.hideStep();
    this.emit("cursor.moving", index, { reason: "route_reached", route });
    // let the new route render: wait for the DOM to go quiet (or 10 s at most)
    const quietBy = Date.now() + 10000;
    let quiet = 0;
    while (quiet < 2 && Date.now() < quietBy && !this.cancelled) {
      quiet = (await this.waitMutationOrTimeout(200)) === "ok" ? quiet + 1 : quiet;
    }
    return this.cancelled ? "cancel" : "ok";
  }

  private showFloatingTip(text: string, index: number, total: number): void {
    const vw = this.doc.documentElement.clientWidth;
    this.tipEl.innerHTML = "";
    const body = this.doc.createElement("div");
    body.textContent = text;
    const small = this.doc.createElement("div");
    small.style.cssText = "opacity:.7;font-size:11px;margin-top:2px";
    small.textContent = `Step ${index + 1} of ${total}`;
    const btns = this.doc.createElement("div");
    btns.className = "btns";
    btns.innerHTML = '<button data-act="close">Close</button>';
    btns.addEventListener("click", () => this.cancel());
    this.tipEl.append(body, small, btns);
    this.tipEl.classList.add("on");
    this.tipEl.style.left = `${Math.max(8, vw - 276)}px`;
    this.tipEl.style.top = "16px";
  }

  /** Figma-style comment bubble next to the cursor: the agent states why it is pointing here. */
  private showReason(text: string): void {
    this.clearReason();
    if (!text) return;
    const el = this.thoughtEl;
    el.innerHTML = "";
    const k = this.doc.createElement("span");
    k.className = "k";
    k.textContent = "Reasoning";
    const body = this.doc.createElement("span");
    const caret = this.doc.createElement("span");
    caret.className = "caret";
    el.append(k, body, caret);
    el.classList.add("on");
    if (this.reduced) {
      body.textContent = text;
      caret.remove();
      return;
    }
    let i = 0;
    this.typer = setInterval(() => {
      i += 2;
      body.textContent = text.slice(0, i);
      if (i >= text.length) {
        this.clearTyper();
        caret.remove();
      }
    }, 18);
  }

  private clearTyper(): void {
    if (this.typer) clearInterval(this.typer);
    this.typer = null;
  }

  private clearReason(): void {
    this.clearTyper();
    this.thoughtEl?.classList.remove("on");
  }

  private hideStep(): void {
    this.clearReason();
    this.ringEl?.classList.remove("on");
    this.tipEl?.classList.remove("on");
    this.target = null;
  }

  private finish(status: FlowResult["status"], state: CursorState, completedSteps: number, failedStep?: number, emitCancel = true): FlowResult {
    this.setState(state);
    if (status === "cancelled" && emitCancel) this.emit("guide.cancelled");
    this.hideStep();
    this.cursorEl?.classList.remove("on");
    this.removeObservers();
    return { status, state, completedSteps, ...(failedStep !== undefined ? { failedStep } : {}) };
  }

  /** Waits for the user to act on the real element (or press Next / Close). Keeps ring/tooltip glued to the target. */
  private waitForUser(step: GuideStep, el: Element, index: number): Promise<StepEnd | "cancel"> {
    return new Promise((resolve) => {
      let current: Element = el;
      const done = (v: StepEnd | "cancel") => {
        this.removeObservers();
        c.off();
        resolve(v);
      };
      const c = this.cancelPromise();
      c.p.then(() => done("cancel"));

      const reposition = () => {
        if (!current.isConnected) return;
        this.placeRing(current);
        this.placeCursor(this.anchorOf(current));
        this.positionTip(current);
      };
      let scheduled = false;
      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          reposition();
        });
      };
      const win = this.doc.defaultView as Window;
      win.addEventListener("resize", schedule);
      win.addEventListener("scroll", schedule, true); // capture: catches nested scroll containers
      this.cleanups.push(() => win.removeEventListener("resize", schedule), () => win.removeEventListener("scroll", schedule, true));
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(schedule);
        ro.observe(this.doc.documentElement);
        this.cleanups.push(() => ro.disconnect());
      }

      // dynamic DOM: if the target is replaced/removed, re-resolve within the retry budget, else INTERRUPTED
      let reresolving = false;
      const mo = new MutationObserver(async () => {
        schedule();
        if (current.isConnected || reresolving) return;
        reresolving = true;
        const again = await this.waitForTarget(step);
        reresolving = false;
        if (again === "cancel") return;
        if (!again.element) return done("interrupted");
        current = again.element;
        this.target = current;
        reposition();
      });
      mo.observe(this.doc.body, { childList: true, subtree: true });
      this.cleanups.push(() => mo.disconnect());

      // the user navigated somewhere else mid-step (SPA): stop, the SDK offers to resume
      const startPath = this.path();
      const routeWatch = setInterval(() => {
        if (this.path() !== startPath) {
          this.emit("step.failed", index, { reason: "user_navigation", from: startPath, to: this.path() });
          done("interrupted");
        }
      }, 200);
      this.cleanups.push(() => clearInterval(routeWatch));
      if (this.opts.autoAdvanceMs) {
        const t = setTimeout(() => done("skip"), this.opts.autoAdvanceMs);
        this.cleanups.push(() => clearTimeout(t));
      }
      const onUserAction = (e: Event) => {
        const t = e.target as Node | null;
        if (t && current.contains(t)) done("done");
      };
      if (step.action === "click") {
        this.doc.addEventListener("click", onUserAction, true);
        this.cleanups.push(() => this.doc.removeEventListener("click", onUserAction, true));
      } else if (step.action === "type") {
        this.doc.addEventListener("input", onUserAction, true);
        this.cleanups.push(() => this.doc.removeEventListener("input", onUserAction, true));
      }
      const onTip = (e: Event) => {
        const act = (e.target as HTMLElement).getAttribute?.("data-act");
        if (act === "next") done("skip");
        else if (act === "close") {
          this.cancel();
        }
      };
      this.tipEl.addEventListener("click", onTip);
      this.cleanups.push(() => this.tipEl.removeEventListener("click", onTip));
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") this.cancel();
      };
      this.doc.addEventListener("keydown", onKey);
      this.cleanups.push(() => this.doc.removeEventListener("keydown", onKey));
      void index;
    });
  }

  private removeObservers(): void {
    for (const f of this.cleanups.splice(0)) f();
  }

  cancel(): void {
    this.cancelled = true;
    cancelAnimationFrame(this.raf);
    for (const w of Array.from(this.cancelWaiters)) w();
    this.cancelWaiters.clear();
  }

  /** Removes every listener, observer, timer and injected node. Safe to call twice. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancel();
    this.removeObservers();
    this.clearTyper();
    this.host?.remove();
    this.host = null;
    this.setState("IDLE");
  }
}
