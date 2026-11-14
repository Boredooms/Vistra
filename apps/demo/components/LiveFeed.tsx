"use client";

import { useEffect, useState } from "react";

type Ping = { ok: boolean; status: string; ms?: number; apiUrl?: string };
type Ev = { name: string; data: Record<string, unknown>; at: number };

function describe(e: Ev): string {
  const d = e.data;
  switch (e.name) {
    case "run.started": return `run ${String(d.run_id).slice(0, 8)} started`;
    case "provider.trace": {
      const t = (d.traces as Array<Record<string, unknown>>)?.at(-1);
      return t ? `${t.provider}/${t.model} ${t.capability} ${t.status} ${t.latency_ms} ms${t.fallback_used ? " (fallback)" : ""}` : "provider call";
    }
    case "retrieval.completed": return `retrieved ${d.count} chunks, ${d.passing} above threshold`;
    case "citation": return `cited ${d.title}${d.section ? ` > ${d.section}` : ""}`;
    case "guide.proposed": return `guide: ${(d.steps as unknown[])?.length ?? 0} steps${d.continues_on_next_page ? ", continues on next page" : ""}`;
    case "approval.required": return `approval required for ${d.tool}`;
    case "verification.succeeded": return `verified ${d.tool}`;
    case "run.completed": return `run completed (${(d.served_by as Record<string, unknown>)?.provider ?? "?"})`;
    case "run.failed": return `run failed: ${d.code} ${d.detail ?? ""}`;
    case "session.refreshed": return "session token refreshed";
    default: return e.name;
  }
}

/** Live backend ping + every SDK event the assistant on this page produces, in real time. */
export function LiveFeed() {
  const [ping, setPing] = useState<Ping | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const p = (await fetch("/api/setup/ping", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false, status: "unreachable" }))) as Ping;
      if (!stop) setPing(p);
    };
    void tick();
    const id = setInterval(tick, 5000);
    const on = (e: Event) => setEvents((all) => [(e as CustomEvent<Ev>).detail, ...all].slice(0, 40));
    window.addEventListener("vistra:event", on);
    return () => { stop = true; clearInterval(id); window.removeEventListener("vistra:event", on); };
  }, []);

  const dot = ping === null ? "bg-line" : ping.ok ? "bg-ok" : "bg-danger";
  return (
    <section className="surface mt-8 overflow-hidden" aria-label="Live connection">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2.5 font-medium">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${dot} ${ping?.ok ? "animate-pulse" : ""}`} />
          Backend {ping === null ? "checking..." : ping.status}
          {ping?.ms !== undefined && <span className="text-xs font-normal text-muted">{ping.ms} ms · {ping.apiUrl} · every 5 s</span>}
        </div>
        <span className="text-xs text-muted">Open the assistant (bottom right) and ask something: calls appear here live.</span>
      </header>
      <ol className="max-h-72 divide-y divide-[var(--line)] overflow-y-auto font-mono text-xs" aria-live="polite">
        {events.length === 0 && <li className="px-5 py-4 font-sans text-[13px] text-muted">No calls yet.</li>}
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex gap-4 px-5 py-2">
            <span className="shrink-0 text-muted">{new Date(e.at).toLocaleTimeString()}</span>
            <span className={`w-40 shrink-0 ${e.name.includes("failed") ? "text-danger" : e.name.includes("succeeded") || e.name === "run.completed" ? "text-ok" : "text-accent"}`}>{e.name}</span>
            <span className="min-w-0 truncate">{describe(e)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
