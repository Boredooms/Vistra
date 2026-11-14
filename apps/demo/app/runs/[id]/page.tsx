"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getSessionToken } from "@/lib/vistra";

interface Step { id: string; step_index: number; kind: string; status: string; summary: string; latency_ms: number | null; detail: Record<string, unknown> }
interface Run {
  id: string; status: string; intent: string | null; input: string; output: string | null; error_code: string | null;
  served_by: { simulated?: boolean; provider?: string; model?: string; fallback_used?: boolean };
  tool_invocations: Array<{ tool: string; policy_decision: string; status: string; verified_at: string | null; verification: unknown; args: unknown }>;
  approvals: Array<{ status: string; decided_by: string | null }>;
  model_usage: Array<{ provider: string; model: string; capability: string; status: string; error_class: string | null; latency_ms: number; fallback_used: boolean; attempt: number }>;
}

const STATUS: Record<string, string> = { completed: "badge-ok", failed: "badge-danger", running: "badge-warn", awaiting_approval: "badge-warn" };

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const s = await getSessionToken();
        const h = { Authorization: `Bearer ${s.token}` };
        const api = s.api_url ?? "http://localhost:8000";
        const [r, st] = await Promise.all([fetch(`${api}/v1/runs/${id}`, { headers: h }), fetch(`${api}/v1/runs/${id}/steps`, { headers: h })]);
        if (!r.ok) throw new Error((await r.json()).detail ?? "Run not found");
        const body = (await r.json()) as Run;
        if (stop) return;
        setRun(body);
        setSteps(await st.json());
        if (body.status === "running") timer = setTimeout(load, 2000); // keep refreshing while in flight
      } catch (e) {
        if (!stop) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  if (err) return <p role="alert" className="surface p-4 text-danger">{err}</p>;
  if (!run) {
    return (
      <div aria-busy="true" className="space-y-3">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-panel" />
        <div className="h-24 animate-pulse rounded-xl bg-panel" />
      </div>
    );
  }
  return (
    <div>
      <Link href="/dashboard" className="text-[13px] text-muted hover:text-ink">Back to workspace</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title">Run {run.id.slice(0, 8)}</h1>
        <span className={`badge ${STATUS[run.status] ?? "badge-neutral"}`}>{run.status.replace("_", " ")}</span>
      </div>
      <p className="page-sub">
        Intent <b className="font-medium text-ink">{run.intent ?? "unknown"}</b> · served by {run.served_by.provider}/{run.served_by.model}
        {run.served_by.fallback_used ? " (fallback)" : ""}
        {run.served_by.simulated ? " (simulated model)" : ""}
      </p>
      <blockquote className="surface mt-5 px-4 py-3 text-[14px]">&ldquo;{run.input}&rdquo;</blockquote>

      <h2 className="mt-8 text-[15px] font-semibold">Timeline</h2>
      <ol className="surface mt-3 divide-y divide-[var(--line)]">
        {steps.map((s) => (
          <li key={s.id} className="flex gap-4 px-4 py-3">
            <span className="w-28 shrink-0 font-medium">{s.step_index + 1}. {s.kind}</span>
            <span className="min-w-0 flex-1 text-muted">{s.summary}</span>
            <span className="shrink-0 text-xs text-muted">{s.status}{s.latency_ms != null ? ` · ${s.latency_ms} ms` : ""}</span>
          </li>
        ))}
      </ol>

      <h2 className="mt-8 text-[15px] font-semibold">Tool invocations</h2>
      {run.tool_invocations.length === 0 && <p className="mt-2 text-[13px] text-muted">No tools ran in this run.</p>}
      {run.tool_invocations.map((t, i) => (
        <pre key={i} className="surface mt-3 overflow-x-auto p-4 text-xs">{JSON.stringify(t, null, 2)}</pre>
      ))}

      <h2 className="mt-8 text-[15px] font-semibold">Model calls</h2>
      <div className="surface mt-3 overflow-hidden">
        <table className="tbl text-xs">
          <thead><tr><th>Provider</th><th>Model</th><th>Capability</th><th>Status</th><th>ms</th><th>Try</th></tr></thead>
          <tbody>
            {run.model_usage.map((u, i) => (
              <tr key={i} className={u.status === "failed" ? "text-danger" : ""}>
                <td>{u.provider}{u.fallback_used ? " (fallback)" : ""}</td><td>{u.model}</td><td>{u.capability}</td>
                <td>{u.status}{u.error_class ? ` ${u.error_class}` : ""}</td><td>{u.latency_ms}</td><td>{u.attempt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
