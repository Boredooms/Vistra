"use client";

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Badge, Empty, ErrorNote, Skeleton, timeAgo } from "@/components/ui";
import { useGet } from "@/lib/api";
import { statusTone } from "@/lib/format";

interface Run { id: string; intent: string | null; status: string; input: string; error_code: string | null; started_at: string; tool_calls: number; model_ms: number; served_by: { provider?: string; model?: string; fallback_used?: boolean; simulated?: boolean } }

export default function Runs() {
  const runs = useGet<Run[]>("/v1/runs?limit=100", { refreshInterval: 5000 });
  return (
    <>
      <PageHeader title="Runs" sub="Every message is a run: intent, retrieval, policy, approval, execution and verification, each recorded." />
      {runs.error ? <ErrorNote error={runs.error} /> : null}
      {runs.isLoading ? <Skeleton className="h-64" /> : runs.data?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[13px] text-subtle"><tr className="border-b border-line"><th className="py-2 font-medium">Request</th><th className="font-medium">Intent</th><th className="font-medium">Status</th><th className="font-medium">Served by</th><th className="font-medium">Tools</th><th className="font-medium">When</th></tr></thead>
            <tbody className="divide-y divide-line">
              {runs.data.map((r) => (
                <tr key={r.id} className="hover:bg-raised">
                  <td className="max-w-sm truncate py-3"><Link href={`/dashboard/runs/${r.id}`} className="font-medium hover:underline">{r.input}</Link></td>
                  <td className="text-muted">{r.intent ?? "-"}</td>
                  <td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  <td className="text-muted">{r.served_by?.provider ?? "-"}{r.served_by?.fallback_used ? <span className="ml-1.5 text-warn">fallback</span> : null}{r.served_by?.simulated ? <span className="ml-1.5 text-subtle">simulated</span> : null}</td>
                  <td className="num text-muted">{r.tool_calls}</td>
                  <td className="text-muted">{timeAgo(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="No runs yet" body="Send a message through the embedded assistant and it will show up here." />}
    </>
  );
}
