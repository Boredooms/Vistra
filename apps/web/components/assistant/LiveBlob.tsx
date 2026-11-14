"use client";

import { Vistra, type Citation, type ProviderTrace, type ServedBy } from "@boredooms/vistra-sdk";
import clsx from "clsx";
import { ArrowUp, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { WEB_TARGETS } from "@/lib/targets";

interface Msg { id: string; role: "user" | "assistant"; runId?: string; text: string; citations: Citation[]; traces: ProviderTrace[]; servedBy?: ServedBy; status: "streaming" | "done"; error?: string; insufficient?: boolean; guide?: boolean }

const APP_ID = process.env.NEXT_PUBLIC_VISTRA_APP_ID ?? "app_vistra_web";
const API = process.env.NEXT_PUBLIC_VISTRA_API_URL ?? "http://localhost:8000";
const KEY = "vistra.web.session";
let n = 0;
const uid = () => `m${++n}`;

const SUGGEST = ["How do I create an API key?", "Show me how to add a knowledge source", "How does approval work?"];

/** The website's own VISTRA assistant: a small blob in the corner. Real SDK, real API, real citations. */
export function LiveBlob() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sdk = useRef<Vistra | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback((runId: string, fn: (m: Msg) => Partial<Msg>) => {
    setMsgs((all) => {
      const base = all.some((m) => m.runId === runId) ? all : [...all, { id: uid(), role: "assistant" as const, runId, text: "", citations: [], traces: [], status: "streaming" as const }];
      return base.map((m) => (m.runId === runId ? { ...m, ...fn(m) } : m));
    });
  }, []);

  useEffect(() => {
    const s = Vistra.init({
      appId: APP_ID,
      apiUrl: API,
      targets: WEB_TARGETS,
      cursor: { label: "VISTRA", theme: { accent: "#fafafa", ink: "#0a0a0a", surface: "#171717", text: "#fafafa" } },
      getSessionToken: async (prev) => {
        const r = await fetch("/api/vistra/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: prev?.session_id ?? sessionStorage.getItem(KEY) }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail ?? "Could not start a session");
        sessionStorage.setItem(KEY, d.session_id);
        return d;
      },
    });
    sdk.current = s;
    const offs = [
      s.on("token", (e) => patch(e.run_id, (m) => ({ text: m.text + e.text }))),
      s.on("citation", (e) => patch(e.run_id, (m) => ({ citations: [...m.citations, e] }))),
      s.on("provider.trace", (e) => patch(e.run_id, (m) => ({ traces: [...m.traces, ...e.traces] }))),
      s.on("guide.proposed", (e) => { patch(e.run_id, () => ({ guide: true })); setOpen(false); }),
      s.on("run.completed", (e) => patch(e.run_id, () => ({ text: e.answer, citations: e.citations, servedBy: e.served_by, status: "done", insufficient: !!e.insufficient_evidence }))),
      s.on("run.failed", (e) => patch(e.run_id, (m) => ({ status: "done", error: e.detail, text: m.text || e.detail }))),
    ];
    return () => { offs.forEach((o) => o()); s.destroy(); sdk.current = null; };
  }, [patch]);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy || !sdk.current) return;
    setInput(""); setBusy(true);
    setMsgs((m) => [...m, { id: uid(), role: "user", text: t, citations: [], traces: [], status: "done" }]);
    try { await sdk.current.ask(t); }
    catch (e) { setMsgs((m) => [...m, { id: uid(), role: "assistant", text: e instanceof Error ? e.message : String(e), citations: [], traces: [], status: "done", error: "client" }]); }
    finally { setBusy(false); }
  }

  const served = [...msgs].reverse().find((m) => m.servedBy)?.servedBy;
  return (
    <div data-vistra-ui className="fixed bottom-5 right-5 z-[80]">
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open the VISTRA assistant" data-cursor="Ask VISTRA" className="group relative grid h-14 w-14 place-items-center">
          <span aria-hidden className="absolute inset-0 animate-blob bg-ink shadow-[0_0_40px_oklch(1_0_0/0.18)] transition-transform duration-300 ease-out group-hover:scale-110" />
          <span aria-hidden className="relative h-2.5 w-2.5 rounded-full bg-bg transition-transform duration-300 group-hover:scale-150" />
        </button>
      )}
      {open && (
        <section aria-label="VISTRA assistant" className="flex h-[32rem] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-line-strong bg-raised shadow-[0_24px_80px_rgb(0_0_0/0.6)]">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium"><span className="h-2.5 w-2.5 animate-blob bg-ink" />Ask VISTRA</div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink"><X size={16} /></button>
          </header>
          {served?.simulated && <div role="note" className="border-b border-line px-4 py-1.5 text-xs text-warn">Simulated model: answers are extractive, not LLM-generated.</div>}
          <div ref={scroller} aria-live="polite" className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
            {msgs.length === 0 && (
              <div>
                <p className="text-muted">Answers come from the VISTRA docs, with citations. Ask for a walkthrough and a cursor will show you.</p>
                <ul className="mt-3 space-y-1.5">{SUGGEST.map((s) => <li key={s}><button className="text-left text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink" onClick={() => send(s)}>{s}</button></li>)}</ul>
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={clsx(m.role === "user" && "text-right")}>
                <div className={clsx("inline-block max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left leading-6", m.role === "user" ? "bg-ink text-bg" : "bg-panel", m.error && "text-bad")}>
                  {(m.text || (m.status === "streaming" ? "Thinking..." : "")).replace(/\[c(\d+)\]/g, "[$1]")}
                </div>
                {m.role === "assistant" && (
                  <div className="mt-1.5 space-y-1 text-xs">
                    {m.citations.length > 0 && <div className="flex flex-wrap gap-1.5">{m.citations.map((c) => (
                      <a key={c.chunk_id} href={`/docs#${c.anchor}`} className="rounded-full border border-line-strong px-2 py-0.5 text-muted hover:bg-hover hover:text-ink">[{c.id.slice(1)}] {c.section?.split(" > ").slice(-1)[0] ?? c.title}</a>
                    ))}</div>}
                    {m.insufficient && <p className="text-warn">Not found in the docs.</p>}
                    {m.guide && <p className="text-muted">Showing you now. Follow the cursor.</p>}
                    {m.servedBy?.provider && <p className="font-mono text-[11px] text-subtle">{m.servedBy.provider}{m.servedBy.fallback_used ? " (fallback)" : ""}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex gap-2 border-t border-line p-3">
            <label htmlFor="blob-input" className="sr-only">Message</label>
            <input id="blob-input" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask or say show me..." className="h-10 flex-1 rounded-full border border-line-strong bg-bg px-4 text-sm placeholder:text-subtle focus:border-ink focus:outline-none" />
            <button disabled={busy || !input.trim()} aria-label="Send" className="grid h-10 w-10 place-items-center rounded-full bg-ink text-bg disabled:opacity-40"><ArrowUp size={16} /></button>
          </form>
        </section>
      )}
    </div>
  );
}
