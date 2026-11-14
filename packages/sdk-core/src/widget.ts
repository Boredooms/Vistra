import type { Vistra } from "./client";
import type { ApprovalRequest, Citation, ProviderTrace, RunResult, Selection, ServedBy } from "./types";

export interface WidgetTheme {
  /** Launcher, user bubbles, primary buttons. */
  accent?: string;
  /** Text on accent. */
  accentInk?: string;
  /** Panel background. */
  surface?: string;
  /** Raised elements (assistant bubble, inputs). */
  raised?: string;
  /** Body text. */
  text?: string;
  /** Secondary text. */
  muted?: string;
  /** Hairlines. */
  line?: string;
}

export interface WidgetOptions {
  title?: string;
  greeting?: string;
  suggestions?: string[];
  theme?: WidgetTheme;
  position?: "bottom-right" | "bottom-left";
  /** Where a citation chip links (e.g. c => `/docs#${c.anchor}`). Without it chips are not links. */
  citationHref?: (c: Citation) => string | null;
  /** Link for "View run" in the trace drawer. */
  runHref?: (runId: string) => string | null;
  /** Show developer controls (force primary failure). */
  devTools?: boolean;
  /** Offer "Explain my screen" (attaches a screenshot when the transport/host can capture one). */
  screenUnderstanding?: boolean;
  /** Called after a verified action (e.g. refresh your table). */
  onVerified?: (detail: { tool: string; record?: Record<string, unknown> }) => void;
  container?: HTMLElement;
  openOnMount?: boolean;
  zIndex?: number;
}

export interface WidgetHandle {
  open(): void;
  close(): void;
  ask(text: string): Promise<RunResult | undefined>;
  destroy(): void;
  readonly host: HTMLElement;
}

interface Msg {
  el: HTMLElement;
  bubble: HTMLElement;
  meta: HTMLElement;
  text: string;
  citations: Citation[];
  traces: ProviderTrace[];
  served?: ServedBy;
}

const DARK: Required<WidgetTheme> = {
  accent: "#fafafa", accentInk: "#0a0a0a", surface: "#141414", raised: "#1f1f1f", text: "#f4f4f5", muted: "#a1a1aa", line: "rgba(255,255,255,.1)",
};

const CSS = `
:host{all:initial}
*{box-sizing:border-box}
.root{position:fixed;bottom:20px;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text);-webkit-font-smoothing:antialiased}
.root.right{right:20px}.root.left{left:20px}
button{font:inherit;color:inherit;cursor:pointer}
button:focus-visible,input:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.blob{position:relative;width:56px;height:56px;border:0;background:transparent;padding:0;display:grid;place-items:center}
.blob .b{position:absolute;inset:0;background:var(--accent);box-shadow:0 10px 40px rgba(0,0,0,.35);animation:blob 9s ease-in-out infinite;transition:transform .25s cubic-bezier(.16,1,.3,1)}
.blob:hover .b{transform:scale(1.08)}
.blob .d{position:relative;width:10px;height:10px;border-radius:50%;background:var(--accentInk);transition:transform .25s}
.blob:hover .d{transform:scale(1.5)}
@keyframes blob{0%,100%{border-radius:46% 54% 58% 42%/48% 44% 56% 52%}50%{border-radius:56% 44% 42% 58%/54% 56% 44% 46%}}
.panel{width:min(400px,calc(100vw - 32px));height:min(600px,calc(100vh - 40px));display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.45);transform-origin:bottom right;animation:pop .22s cubic-bezier(.16,1,.3,1)}
.root.left .panel{transform-origin:bottom left}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--line)}
header .t{display:flex;align-items:center;gap:8px;font-weight:600}
header .t i{width:10px;height:10px;background:var(--accent);border-radius:46% 54% 58% 42%/48% 44% 56% 52%}
.ib{border:0;background:transparent;color:var(--muted);border-radius:8px;padding:4px 8px}
.ib:hover{background:var(--raised);color:var(--text)}
.note{padding:6px 14px;font-size:12px;color:#fcd34d;border-bottom:1px solid var(--line)}
.msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:14px;scroll-behavior:smooth}
.empty{color:var(--muted)}
.empty button{display:block;margin-top:6px;border:0;background:transparent;padding:0;text-align:left;color:var(--text);text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:4px}
.empty button:hover{text-decoration-color:var(--text)}
.m{display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.m.u{align-items:flex-end}
.bub{max-width:92%;padding:8px 12px;border-radius:14px;background:var(--raised);white-space:pre-wrap;word-wrap:break-word}
.m.u .bub{background:var(--accent);color:var(--accentInk)}
.bub.err{color:#fca5a5}
.meta{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted);max-width:92%}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--line);border-radius:999px;padding:2px 9px;color:var(--muted);text-decoration:none;font-size:12px}
a.chip:hover{color:var(--text);border-color:var(--muted)}
.card{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--raised);color:var(--text)}
.card pre{margin:6px 0 0;font:11px/1.5 ui-monospace,monospace;color:var(--muted);white-space:pre-wrap}
.row{display:flex;gap:8px;margin-top:8px}
.btn{border:1px solid var(--line);background:transparent;border-radius:8px;padding:5px 12px}
.btn:hover{background:var(--surface)}
.btn.p{background:var(--accent);color:var(--accentInk);border-color:var(--accent)}
.btn:disabled{opacity:.45;cursor:default}
.ok{color:#6ee7b7}.bad{color:#fca5a5}.warn{color:#fcd34d}
.tag{display:inline-block;padding:0 6px;border:1px solid var(--line);border-radius:99px;font-size:10px;color:#fcd34d}
details summary{cursor:pointer;list-style:none}
details summary::-webkit-details-marker{display:none}
details ul{margin:6px 0 0;padding:0;list-style:none;font:10.5px/1.6 ui-monospace,monospace}
details a{color:var(--text)}
.dots{display:inline-flex;gap:3px}.dots span{width:5px;height:5px;border-radius:50%;background:var(--muted);animation:d 1s infinite}
.dots span:nth-child(2){animation-delay:.15s}.dots span:nth-child(3){animation-delay:.3s}
@keyframes d{0%,100%{opacity:.25}50%{opacity:1}}
footer{border-top:1px solid var(--line);padding:10px}
.tools{display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px;color:var(--muted);flex-wrap:wrap}
.tools .btn{padding:3px 9px;font-size:12px}
.sel{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid var(--line);border-radius:999px;padding:2px 8px;color:var(--text)}
.tools label{margin-left:auto;display:flex;align-items:center;gap:5px}
form{display:flex;gap:8px}
input[type=text]{flex:1;height:40px;border:1px solid var(--line);border-radius:999px;background:var(--raised);color:var(--text);padding:0 14px;font:inherit}
input[type=text]::placeholder{color:var(--muted)}
.send{width:40px;height:40px;border-radius:50%;border:0;background:var(--accent);color:var(--accentInk);display:grid;place-items:center}
.send:disabled{opacity:.4}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (prefers-reduced-motion:reduce){.blob .b,.panel,.dots span{animation:none}}
`;

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
};

/** Mounts the VISTRA assistant (blob launcher + panel) in an isolated shadow root. One call, any website. */
export function mountWidget(vistra: Vistra, options: WidgetOptions = {}): WidgetHandle {
  const theme = { ...DARK, ...options.theme };
  const host = h("div", { "data-vistra-ui": "", "data-vistra-widget": "" });
  host.style.cssText = `position:fixed;z-index:${options.zIndex ?? 2147483000};`;
  (options.container ?? document.body).appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = h("style");
  style.textContent = CSS;
  const root = h("div", { class: `root ${options.position === "bottom-left" ? "left" : "right"}` });
  for (const [k, v] of Object.entries({ "--accent": theme.accent, "--accentInk": theme.accentInk, "--surface": theme.surface, "--raised": theme.raised, "--text": theme.text, "--muted": theme.muted, "--line": theme.line })) root.style.setProperty(k, v);
  shadow.append(style, root);

  const msgs = new Map<string, Msg>();
  const offs: Array<() => void> = [];
  let panel: HTMLElement | null = null;
  let list: HTMLElement | null = null;
  let input: HTMLInputElement | null = null;
  let sendBtn: HTMLButtonElement | null = null;
  let note: HTMLElement | null = null;
  let selChip: HTMLElement | null = null;
  let force: HTMLInputElement | null = null;
  let busy = false;
  const history: HTMLElement[] = [];

  const launcher = h("button", { class: "blob", "aria-label": "Open VISTRA assistant", type: "button" });
  launcher.append(h("span", { class: "b", "aria-hidden": "true" }), h("span", { class: "d", "aria-hidden": "true" }));
  launcher.addEventListener("click", () => open());

  const scroll = () => list && (list.scrollTop = list.scrollHeight);
  const fmt = (t: string) => t.replace(/\[c(\d+)\]/g, "[$1]");

  function agentMsg(runId: string): Msg {
    let m = msgs.get(runId);
    if (m) return m;
    const el = h("div", { class: "m a" });
    const bubble = h("div", { class: "bub" });
    const dots = h("span", { class: "dots", "aria-label": "Thinking" });
    dots.append(h("span"), h("span"), h("span"));
    bubble.append(dots);
    const meta = h("div", { class: "meta" });
    el.append(bubble, meta);
    m = { el, bubble, meta, text: "", citations: [], traces: [] };
    msgs.set(runId, m);
    push(el);
    return m;
  }

  function push(el: HTMLElement) {
    history.push(el);
    if (list) {
      list.querySelector(".empty")?.remove();
      list.append(el);
      scroll();
    }
  }

  function line(m: Msg, cls: string, text: string) {
    m.meta.append(h("div", { class: cls }, text));
    scroll();
  }

  function renderTrace(m: Msg, runId: string) {
    m.meta.querySelector("details")?.remove();
    if (!m.served && !m.traces.length) return;
    const d = h("details");
    const last = m.traces[m.traces.length - 1];
    const label = `${m.served?.simulated ? "simulated " : ""}${m.served?.provider ?? last?.provider ?? ""}/${m.served?.model ?? last?.model ?? ""}`;
    const sum = h("summary", {}, label);
    if (m.served?.fallback_used) sum.append(" ", h("span", { class: "tag" }, "fallback"));
    d.append(sum);
    const ul = h("ul");
    for (const t of m.traces) ul.append(h("li", { class: t.status === "failed" ? "bad" : "" }, `${t.provider} ${t.capability} ${t.status}${t.error_class ? ` (${t.error_class})` : ""} ${t.latency_ms}ms try ${t.attempt}`));
    d.append(ul);
    const href = options.runHref?.(runId);
    if (href) d.append(h("a", { href }, "View run"));
    m.meta.append(d);
  }

  function approvalCard(m: Msg, a: ApprovalRequest) {
    const card = h("div", { class: "card", role: "group", "aria-label": "Approval required" });
    card.append(h("strong", {}, `Approval required: ${a.tool}`), h("pre", {}, JSON.stringify(a.args, null, 2)), h("div", { class: "warn", style: "font:10px ui-monospace,monospace;margin-top:4px" }, `args sha256 ${a.args_hash.slice(0, 16)}...`));
    const row = h("div", { class: "row" });
    const yes = h("button", { class: "btn p", type: "button" }, "Approve");
    const no = h("button", { class: "btn", type: "button" }, "Reject");
    const decide = async (d: "approve" | "reject") => {
      yes.disabled = no.disabled = true;
      row.replaceWith(h("div", { style: "margin-top:6px;color:var(--muted)" }, `You ${d === "approve" ? "approved" : "rejected"} this action.`));
      setBusy(true);
      try {
        await vistra.approve(a, d);
      } catch (e) {
        line(m, "bad", e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };
    yes.addEventListener("click", () => void decide("approve"));
    no.addEventListener("click", () => void decide("reject"));
    row.append(yes, no);
    card.append(row);
    m.meta.append(card);
    scroll();
  }

  offs.push(
    vistra.on("run.started", (e) => { agentMsg(e.run_id); if (e.simulated && note) note.hidden = false; }),
    vistra.on("token", (e) => { const m = agentMsg(e.run_id); m.text += e.text; m.bubble.textContent = fmt(m.text); scroll(); }),
    vistra.on("citation", (e) => { agentMsg(e.run_id).citations.push(e); }),
    vistra.on("provider.trace", (e) => { const m = agentMsg(e.run_id); m.traces.push(...e.traces); }),
    vistra.on("guide.proposed", (e) => { line(agentMsg(e.run_id), "", `Showing you ${e.steps.length} step${e.steps.length === 1 ? "" : "s"}. Follow the cursor.`); close(); }),
    vistra.on("approval.required", (e) => { const m = agentMsg(e.run_id); m.bubble.textContent = `I'd like to run ${e.tool}. Please review and approve.`; approvalCard(m, e); }),
    vistra.on("verification.succeeded", (e) => { line(agentMsg(e.run_id), "ok", `Verified in the app: ${e.detail}`); options.onVerified?.({ tool: e.tool, record: e.record }); }),
    vistra.on("verification.failed", (e) => line(agentMsg(e.run_id), "bad", `Verification FAILED: ${e.detail}. Treat the action as not completed.`)),
    vistra.on("run.completed", (e) => {
      const m = agentMsg(e.run_id);
      m.text = e.answer || m.text;
      m.bubble.textContent = fmt(m.text) || "Done.";
      m.served = e.served_by;
      const cites = e.citations?.length ? e.citations : m.citations;
      if (cites.length) {
        const chips = h("div", { class: "chips" });
        for (const c of cites) {
          const label = `[${c.id.replace("c", "")}] ${c.section?.split(" > ").slice(-1)[0] ?? c.title}`;
          const href = options.citationHref?.(c);
          chips.append(href ? h("a", { class: "chip", href }, label) : h("span", { class: "chip" }, label));
        }
        m.meta.prepend(chips);
      }
      if (e.insufficient_evidence) line(m, "warn", "Insufficient evidence in the indexed docs.");
      if (e.understanding === "vision") line(m, "", "Understood from a screenshot of this page.");
      if (e.understanding === "text") line(m, "", "Text-only understanding (no screenshot).");
      renderTrace(m, e.run_id);
    }),
    vistra.on("run.failed", (e) => { const m = agentMsg(e.run_id); if (!m.text) { m.bubble.textContent = e.detail; m.bubble.classList.add("err"); } line(m, "bad", `${e.code}: ${e.detail}`); renderTrace(m, e.run_id); }),
    vistra.on("selection.changed", (e) => renderSelection(e.selection)),
  );

  function renderSelection(s: Selection | null) {
    if (!selChip) return;
    selChip.hidden = !s;
    selChip.textContent = s ? `${s.role}: ${s.name || s.text || ""}` : "";
    selChip.title = s ? JSON.stringify(s) : "";
  }

  function setBusy(v: boolean) {
    busy = v;
    if (sendBtn) sendBtn.disabled = v || !input?.value.trim();
  }

  async function ask(text: string): Promise<RunResult | undefined> {
    const t = text.trim();
    if (!t || busy) return undefined;
    open();
    const el = h("div", { class: "m u" });
    el.append(h("div", { class: "bub" }, t));
    push(el);
    setBusy(true);
    try {
      return await vistra.ask(t, { forcePrimaryFailure: !!force?.checked });
    } catch (e) {
      const err = h("div", { class: "m a" });
      err.append(h("div", { class: "bub err" }, `Request failed: ${e instanceof Error ? e.message : String(e)}`));
      push(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  function buildPanel() {
    panel = h("section", { class: "panel", "aria-label": "VISTRA assistant", role: "region" });
    const header = h("header");
    const t = h("div", { class: "t" });
    t.append(h("i", { "aria-hidden": "true" }), h("span", {}, options.title ?? "VISTRA"));
    const x = h("button", { class: "ib", "aria-label": "Close", type: "button" }, "×");
    x.addEventListener("click", () => close());
    header.append(t, x);
    note = h("div", { class: "note", role: "note" }, "Simulated model: answers are extractive, not LLM-generated.");
    note.hidden = true;
    list = h("div", { class: "msgs", "aria-live": "polite" });
    if (!history.length) {
      const empty = h("div", { class: "empty" }, options.greeting ?? "Ask about this product, or say \"show me how to...\" and a cursor will guide you.");
      for (const s of options.suggestions ?? []) {
        const b = h("button", { type: "button" }, s);
        b.addEventListener("click", () => void ask(s));
        empty.append(b);
      }
      list.append(empty);
    } else list.append(...history);
    const footer = h("footer");
    const tools = h("div", { class: "tools" });
    const pick = h("button", { class: "btn", type: "button" }, "Select element");
    pick.addEventListener("click", async () => {
      close();
      await vistra.select();
      open();
      input?.focus();
    });
    tools.append(pick);
    if (options.screenUnderstanding !== false) {
      const scr = h("button", { class: "btn", type: "button" }, "Explain my screen");
      scr.addEventListener("click", () => { vistra.attachScreenshotToNextMessage(); void ask("Explain this page: what is it for and what can I do here?"); });
      tools.append(scr);
    }
    selChip = h("span", { class: "sel" });
    renderSelection(vistra.currentSelection);
    tools.append(selChip);
    if (options.devTools) {
      const lab = h("label");
      force = h("input", { type: "checkbox" });
      lab.append(force, document.createTextNode("force primary failure"));
      tools.append(lab);
    }
    const form = h("form");
    const lbl = h("label", { for: "vistra-msg", class: "sr" }, "Message");
    input = h("input", { id: "vistra-msg", type: "text", placeholder: "Ask, show me, or do...", autocomplete: "off" });
    sendBtn = h("button", { class: "send", type: "submit", "aria-label": "Send" });
    sendBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    sendBtn.disabled = true;
    input.addEventListener("input", () => setBusy(busy));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = input?.value ?? "";
      if (input) input.value = "";
      void ask(v);
    });
    form.append(lbl, input, sendBtn);
    footer.append(tools, form);
    panel.append(header, note, list, footer);
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  function open() {
    if (panel?.isConnected) return;
    launcher.remove();
    buildPanel();
    root.append(panel!);
    scroll();
    setTimeout(() => input?.focus(), 30);
  }

  function close() {
    panel?.remove();
    panel = null;
    if (!launcher.isConnected) root.append(launcher);
  }

  root.append(launcher);
  if (options.openOnMount) open();

  return {
    host,
    open,
    close,
    ask,
    destroy() {
      offs.forEach((o) => o());
      host.remove();
    },
  };
}
