"use client";

import { Vistra, type ApprovalRequest, type Citation } from "@boredooms/vistra-sdk";
import clsx from "clsx";
import { ArrowUp, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { API_URL, useVistra } from "@/lib/api";
import { Card, DetailHeader, DetailTag } from "./primitives";

interface Msg { id: string; role: "user" | "agent"; runId?: string; text: string; citations: Citation[]; events: string[]; version?: number | null; provider?: string; approval?: ApprovalRequest & { decided?: string }; error?: string; done?: boolean }
let n = 0;

/** Talks to the real agent of the selected application through @boredooms/vistra-sdk and a dashboard-only session. */
export function Playground({ publishedVersion }: { publishedVersion?: number | null }) {
  const { app, call } = useVistra();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sdk = useRef<Vistra | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!app) return;
    const s = Vistra.init({
      appId: app.id,
      apiUrl: API_URL,
      autoGuide: false,
      getSessionToken: () => call(`/v1/applications/${app.id}/playground-session`, { method: "POST", appId: app.id }),
    });
    sdk.current = s;
    const patch = (runId: string, fn: (m: Msg) => Partial<Msg>) =>
      setMsgs((all) => {
        const base = all.some((m) => m.runId === runId) ? all : [...all, { id: `a${++n}`, role: "agent" as const, runId, text: "", citations: [], events: [] }];
        return base.map((m) => (m.runId === runId ? { ...m, ...fn(m) } : m));
      });
    const ev = (runId: string, name: string) => patch(runId, (m) => ({ events: [...m.events, name] }));
    const offs = [
      s.on("run.started", (e) => patch(e.run_id, () => ({ version: (e as unknown as { agent?: { version?: number | null } }).agent?.version ?? null, events: ["run.started"] }))),
      s.on("token", (e) => patch(e.run_id, (m) => ({ text: m.text + e.text }))),
      s.on("citation", (e) => patch(e.run_id, (m) => ({ citations: [...m.citations, e] }))),
      s.on("retrieval.completed", (e) => ev(e.run_id, `retrieval ${e.passing}/${e.count}`)),
      s.on("policy.decision", (e) => ev(e.run_id, `policy ${e.decision}`)),
      s.on("guide.proposed", (e) => ev(e.run_id, `guide ${e.steps.length} steps`)),
      s.on("approval.required", (e) => patch(e.run_id, (m) => ({ approval: e, events: [...m.events, "approval.required"], done: true }))),
      s.on("tool.executed", (e) => ev(e.run_id, `tool ${e.ok ? "ok" : "failed"}`)),
      s.on("verification.succeeded", (e) => ev(e.run_id, "verified")),
      s.on("verification.failed", (e) => ev(e.run_id, "verification failed")),
      s.on("run.completed", (e) => patch(e.run_id, (m) => ({ text: e.answer || m.text, citations: e.citations, provider: e.served_by?.provider ?? undefined, done: true }))),
      s.on("run.failed", (e) => patch(e.run_id, (m) => ({ error: `${e.code}: ${e.detail}`, done: true, text: m.text }))),
    ];
    return () => { offs.forEach((o) => o()); s.destroy(); sdk.current = null; };
  }, [app, call]);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [msgs]);

  async function send(t: string) {
    if (!t.trim() || !sdk.current || busy) return;
    setInput(""); setBusy(true);
    setMsgs((m) => [...m, { id: `u${++n}`, role: "user", text: t, citations: [], events: [] }]);
    try { await sdk.current.ask(t); } catch (e) { setMsgs((m) => [...m, { id: `e${++n}`, role: "agent", text: "", citations: [], events: [], error: e instanceof Error ? e.message : String(e), done: true }]); }
    finally { setBusy(false); }
  }

  async function decide(a: ApprovalRequest, d: "approve" | "reject") {
    setBusy(true);
    setMsgs((all) => all.map((m) => (m.approval?.approval_id === a.approval_id ? { ...m, approval: { ...a, decided: d } } : m)));
    try { await sdk.current?.approve(a, d); } finally { setBusy(false); }
  }

  return (
    <Card className="flex h-[38rem] flex-col gap-4">
      <DetailHeader title="Playground" subtitle="Talk to the published agent. Real retrieval, policy and tools.">
        <DetailTag>v{publishedVersion ?? "-"}</DetailTag>
        <Button size="sm" variant="ghost" onClick={() => setMsgs([])} aria-label="Clear conversation"><RotateCcw size={14} /></Button>
      </DetailHeader>
      <div ref={scroller} aria-live="polite" className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 text-sm">
        {msgs.length === 0 && (
          <div className="space-y-2 text-muted">
            <p>Try a question your docs answer, one they do not, or an action.</p>
            {["What does the Starter plan include?", "Who won the world cup in 1998?", "Create a project called Playground Test"].map((s) => (
              <button key={s} onClick={() => send(s)} className="block text-left text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
            <div className={clsx("inline-block max-w-[92%] whitespace-pre-wrap rounded-xl px-3.5 py-2 text-left leading-6", m.role === "user" ? "bg-ink text-bg" : "bg-panel")}>
              {(m.text || (m.done ? "" : "Working...")).replace(/\[c(\d+)\]/g, "[$1]") || (m.error ? "" : " ")}
              {m.error && <span className="block text-bad">{m.error}</span>}
            </div>
            {m.role === "agent" && (
              <div className="mt-1.5 space-y-1.5 text-xs">
                {m.citations.length > 0 && <div className="flex flex-wrap gap-1.5">{m.citations.map((c) => <span key={c.chunk_id} className="rounded-full border border-line-strong px-2 py-0.5 text-muted">[{c.id.slice(1)}] {c.section?.split(" > ").slice(-1)[0] ?? c.title}</span>)}</div>}
                {m.approval && (
                  <div className="rounded-lg border border-line-strong p-3" role="group" aria-label="Approval required">
                    <p className="font-medium text-ink">Approve {m.approval.tool}?</p>
                    <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-muted">{JSON.stringify(m.approval.args)}</pre>
                    {m.approval.decided ? <p className="mt-1 text-muted">You chose {m.approval.decided}.</p> : (
                      <div className="mt-2 flex gap-2"><Button size="sm" variant="solid" disabled={busy} onClick={() => decide(m.approval!, "approve")}>Approve</Button><Button size="sm" disabled={busy} onClick={() => decide(m.approval!, "reject")}>Reject</Button></div>
                    )}
                  </div>
                )}
                <p className="font-mono text-[10.5px] text-subtle">
                  {m.version != null && <>agent v{m.version} · </>}{m.provider && <>{m.provider} · </>}{m.events.join(" → ")}
                  {m.runId && <> · <Link href={`/dashboard/runs/${m.runId}`} className="underline underline-offset-2 hover:text-ink">trace</Link></>}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex gap-2">
        <label htmlFor="pg-input" className="sr-only">Message the agent</label>
        <input id="pg-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message the agent..." className="h-10 flex-1 rounded-lg border border-line-strong bg-bg px-3.5 text-sm placeholder:text-subtle focus:border-ink focus:outline-none" />
        <button aria-label="Send" disabled={busy || !input.trim()} className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-bg transition-opacity disabled:opacity-40"><ArrowUp size={16} /></button>
      </form>
    </Card>
  );
}
