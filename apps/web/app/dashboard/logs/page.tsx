"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, DetailHeader, DetailTag, Segmented } from "@/components/dash/primitives";
import { Empty, ErrorNote, Input, Skeleton } from "@/components/ui";
import { useGet } from "@/lib/api";

interface Ev { id: string; run_id: string | null; seq: number; event_type: string; payload: Record<string, unknown>; created_at: string }
interface Audit { id: string; actor_type: string; actor_id: string | null; action: string; resource_type: string | null; resource_id: string | null; detail: Record<string, unknown>; created_at: string }

const tone = (t: string) => (/failed|denied|missing|rejected/.test(t) ? "text-bad" : /approval|warning|cancel/.test(t) ? "text-warn" : /succeeded|completed|verified|approved/.test(t) ? "text-ok" : "text-muted");
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function summary(e: Ev): string {
  const p = e.payload;
  const pick = (k: string) => (p[k] === undefined ? undefined : String(p[k]));
  return pick("detail") ?? pick("reason") ?? pick("answer")?.slice(0, 140) ?? (pick("tool") ? `${pick("tool")} ${pick("decision") ?? ""}` : undefined)
    ?? (p.count !== undefined ? `${p.passing}/${p.count} chunks above threshold` : undefined) ?? (pick("route") ? `route ${pick("route")}` : "");
}

export default function Logs() {
  const [tab, setTab] = useState<"events" | "audit">("events");
  const [q, setQ] = useState("");
  const events = useGet<Ev[]>(tab === "events" ? "/v1/events?limit=250" : null, { refreshInterval: 3000 });
  const audit = useGet<Audit[]>(tab === "audit" ? "/v1/audit-events?limit=250" : null, { refreshInterval: 10000 });
  const evs = useMemo(() => (events.data ?? []).filter((e) => !q || e.event_type.includes(q) || JSON.stringify(e.payload).toLowerCase().includes(q.toLowerCase())), [events.data, q]);
  const aud = useMemo(() => (audit.data ?? []).filter((e) => !q || e.action.includes(q) || (e.resource_id ?? "").includes(q)), [audit.data, q]);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Log type" value={tab} onChange={setTab} options={[{ value: "events", label: "Agent events" }, { value: "audit", label: "Audit trail" }]} />
        <div className="flex items-center gap-3">
          {tab === "events" && <DetailTag tone="ok">live · 3s</DetailTag>}
          <Input aria-label="Filter logs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "events" ? "Filter: policy, failed, citation..." : "Filter: agent, api_key, approval..."} className="w-72" />
        </div>
      </Card>

      {tab === "events" ? (
        <Card className="flex flex-col gap-4">
          <DetailHeader title="Agent events" subtitle="Every SSE event the runtime persisted, newest first. Token chunks are omitted." />
          {events.error ? <ErrorNote error={events.error} /> : !events.data ? <Skeleton className="h-96" /> : evs.length === 0 ? (
            <Empty title="No events" body="Send a message from the playground on the Agents page and its events stream in here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left font-mono text-[12.5px]">
                <thead className="font-sans text-[12px] text-subtle"><tr><th className="pb-2 font-medium">Time</th><th className="pb-2 font-medium">Event</th><th className="pb-2 font-medium">Detail</th><th className="pb-2 text-right font-medium">Run</th></tr></thead>
                <tbody className="divide-y divide-line border-t border-line">
                  {evs.map((e) => (
                    <tr key={e.id} className="align-top hover:bg-hover/40">
                      <td className="whitespace-nowrap py-2 pr-4 text-subtle">{clock(e.created_at)}</td>
                      <td className={`whitespace-nowrap pr-4 ${tone(e.event_type)}`}>{e.event_type}</td>
                      <td className="max-w-[28rem] truncate pr-4 font-sans text-[13px] text-muted" title={JSON.stringify(e.payload)}>{summary(e)}</td>
                      <td className="text-right">{e.run_id ? <Link href={`/dashboard/runs/${e.run_id}`} className="text-muted underline decoration-line-strong underline-offset-2 hover:text-ink">{e.run_id.slice(0, 8)}</Link> : <span className="text-subtle">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card className="flex flex-col gap-4">
          <DetailHeader title="Audit trail" subtitle="Append-only record of privileged changes: keys, agents, applications, approvals, policy denials." />
          {audit.error ? <ErrorNote error={audit.error} /> : !audit.data ? <Skeleton className="h-96" /> : aud.length === 0 ? (
            <Empty title="Nothing audited yet" body="Creating a key, publishing an agent version or approving an action writes an audit entry." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-[13px]">
                <thead className="text-[12px] text-subtle"><tr><th className="pb-2 font-medium">When</th><th className="pb-2 font-medium">Action</th><th className="pb-2 font-medium">Actor</th><th className="pb-2 font-medium">Resource</th></tr></thead>
                <tbody className="divide-y divide-line border-t border-line">
                  {aud.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap py-2.5 pr-4 text-subtle">{new Date(e.created_at).toLocaleString()}</td>
                      <td className={`pr-4 font-mono text-[12.5px] ${tone(e.action)}`}>{e.action}</td>
                      <td className="pr-4 text-muted"><span>{e.actor_type}</span><span className="block max-w-[14rem] truncate font-mono text-[11px] text-subtle">{e.actor_id}</span></td>
                      <td className="text-muted"><span>{e.resource_type}</span><span className="block max-w-[16rem] truncate font-mono text-[11px] text-subtle" title={JSON.stringify(e.detail)}>{e.resource_id}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
