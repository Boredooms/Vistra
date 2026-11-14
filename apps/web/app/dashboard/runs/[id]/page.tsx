"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { Badge, ErrorNote, Skeleton } from "@/components/ui";
import { useGet } from "@/lib/api";
import { ms, statusTone } from "@/lib/format";

interface Step { id: string; step_index: number; kind: string; status: string; summary: string; latency_ms: number | null; detail: Record<string, unknown> }
interface Run {
  id: string; status: string; intent: string | null; input: string; output: string | null; error_code: string | null;
  served_by: { provider?: string; model?: string; fallback_used?: boolean; simulated?: boolean };
  tool_invocations: Array<{ id: string; tool: string; args: unknown; policy_decision: string; policy_reason: string | null; status: string; verified_at: string | null; verification: { ok: boolean; detail: string } | null }>;
  approvals: Array<{ id: string; status: string; decided_by: string | null }>;
  model_usage: Array<{ provider: string; model: string; capability: string; status: string; error_class: string | null; latency_ms: number; fallback_used: boolean; attempt: number }>;
}

export default function RunDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const run = useGet<Run>(`/v1/runs/${id}`, { refreshInterval: (d) => (d?.status === "running" ? 2000 : 0) });
  const steps = useGet<Step[]>(`/v1/runs/${id}/steps`, { refreshInterval: run.data?.status === "running" ? 2000 : 0 });
  if (run.error) return <ErrorNote error={run.error} />;
  if (run.isLoading || !run.data) return <Skeleton className="h-96" />;
  const r = run.data;
  return (
    <>
      <Link href="/dashboard/runs" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"><ArrowLeft size={14} />Runs</Link>
      <h1 className="text-xl font-semibold tracking-tight">&ldquo;{r.input}&rdquo;</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
        {r.intent && <Badge>{r.intent}</Badge>}
        {r.served_by?.provider && <Badge>{r.served_by.provider} / {r.served_by.model}</Badge>}
        {r.served_by?.fallback_used && <Badge tone="warn">served by fallback</Badge>}
        {r.served_by?.simulated && <Badge tone="warn">simulated model</Badge>}
        {r.error_code && <Badge tone="bad">{r.error_code}</Badge>}
      </div>
      {r.output && <p className="mt-5 max-w-2xl rounded-xl border border-line bg-raised p-4 text-sm leading-6">{r.output}</p>}

      <h2 className="mb-3 mt-10 text-sm font-medium">Timeline</h2>
      <ol className="relative space-y-0 border-l border-line-strong pl-6">
        {steps.data?.map((s) => (
          <li key={s.id} className="relative pb-6">
            <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-ink" style={{ background: s.status === "failed" ? "oklch(0.72 0.17 25)" : s.status === "pending" ? "oklch(0.82 0.13 85)" : undefined }} />
            <div className="flex flex-wrap items-baseline gap-x-3"><span className="font-medium capitalize">{s.kind}</span><span className="num text-xs text-subtle">{ms(s.latency_ms)}</span></div>
            <p className="text-sm text-muted">{s.summary}</p>
          </li>
        )) ?? <Skeleton className="h-32" />}
      </ol>

      {r.tool_invocations.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-medium">Tool invocations</h2>
          <div className="space-y-3">
            {r.tool_invocations.map((t) => (
              <div key={t.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm">{t.tool}</span><Badge tone={t.policy_decision === "deny" ? "bad" : t.policy_decision === "allow" ? "ok" : "warn"}>{t.policy_decision.replace("_", " ")}</Badge><Badge tone={statusTone(t.status)}>{t.status}</Badge></div>
                <pre className="mt-2 overflow-x-auto font-mono text-[12px] text-muted">{JSON.stringify(t.args)}</pre>
                {t.policy_reason && <p className="mt-1 text-xs text-subtle">Policy: {t.policy_reason}</p>}
                {t.verification && <p className={`mt-1 text-xs ${t.verification.ok ? "text-ok" : "text-bad"}`}>Verification: {t.verification.detail}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-3 mt-8 text-sm font-medium">Model calls</h2>
      <table className="w-full text-left text-[13px]">
        <thead className="text-subtle"><tr className="border-b border-line"><th className="py-2 font-medium">Provider</th><th className="font-medium">Model</th><th className="font-medium">Capability</th><th className="font-medium">Result</th><th className="font-medium">Latency</th><th className="font-medium">Try</th></tr></thead>
        <tbody className="divide-y divide-line">
          {r.model_usage.map((u, i) => (
            <tr key={i}>
              <td className="py-2">{u.provider}{u.fallback_used && <span className="ml-1.5 text-warn">fallback</span>}</td>
              <td className="font-mono text-[12px] text-muted">{u.model}</td><td className="text-muted">{u.capability}</td>
              <td className={u.status === "failed" ? "text-bad" : "text-ok"}>{u.status}{u.error_class ? ` (${u.error_class})` : ""}</td>
              <td className="num text-muted">{ms(u.latency_ms)}</td><td className="num text-muted">{u.attempt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
