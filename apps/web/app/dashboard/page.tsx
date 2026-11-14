"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, Card, ChartTooltip, DetailHeader, DetailTag, Legend, Marker } from "@/components/dash/primitives";
import { usePeriod } from "@/components/dash/period";
import { Badge, Button, Empty, ErrorNote, Skeleton, timeAgo } from "@/components/ui";
import { useGet, useVistra } from "@/lib/api";
import { ms, statusTone } from "@/lib/format";

interface Day { day: string; runs: number; completed: number; failed: number; actions: number; calls: number; failed_calls: number; fallback_calls: number; avg_latency_ms: number; input_tokens: number; output_tokens: number }
interface TS { series: Day[]; providers: Array<{ provider: string; model: string; calls: number; failed: number }>; tools: Record<string, number> }
interface Breakdown { capabilities: Array<{ capability: string; calls: number; avg_ms: number | null; p95_ms: number | null }>; errors: Array<{ code: string; n: number }> }
interface Run { id: string; intent: string | null; status: string; input: string; started_at: string; tool_calls: number; served_by: { provider?: string; fallback_used?: boolean } }

const sum = (xs: Day[], k: keyof Day) => xs.reduce((a, d) => a + Number(d[k] || 0), 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const short = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" });

function Spark({ data, k, kind = "area" }: { data: Day[]; k: keyof Day; kind?: "area" | "bar" }) {
  const rows = data.map((d) => ({ name: short(d.day), v: Number(d[k] || 0) }));
  return (
    <div className="h-14" aria-hidden>
      <ResponsiveContainer>
        {kind === "bar" ? (
          <BarChart data={rows} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <Tooltip cursor={false} content={<ChartTooltip names={{ v: String(k) }} />} />
            <Bar dataKey="v" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {rows.map((_, i) => <Cell key={i} fill={i === rows.length - 1 ? C.c1 : C.c4} />)}
            </Bar>
          </BarChart>
        ) : (
          <AreaChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs><linearGradient id={`sp-${String(k)}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={C.c1} stopOpacity={0.28} /><stop offset="100%" stopColor={C.c1} stopOpacity={0} /></linearGradient></defs>
            <Tooltip cursor={false} content={<ChartTooltip names={{ v: String(k) }} />} />
            <Area type="monotone" dataKey="v" stroke={C.c1} strokeWidth={1.75} fill={`url(#sp-${String(k)})`} isAnimationActive={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function Summary({ title, value, note, children }: { title: string; value: string; note?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className="flex min-h-44 flex-col gap-4">
      <h2 className="text-[13px] text-muted">{title}</h2>
      <div className="flex items-end gap-2">
        <span className="num text-[28px] font-semibold leading-none tracking-tight">{value}</span>
        {note && <span className="pb-0.5 text-xs text-muted">{note}</span>}
      </div>
      <div className="mt-auto">{children}</div>
    </Card>
  );
}

function Insights({ ts, bd }: { ts: TS; bd: Breakdown | undefined }) {
  const { app } = useVistra();
  const keys = useGet<Array<{ revoked_at: string | null }>>(app ? `/v1/applications/${app.id}/keys` : null);
  const src = useGet<unknown[]>(app?.collection_id ? `/v1/collections/${app.collection_id}/sources` : null);
  const s = ts.series;
  const calls = sum(s, "calls");
  const fb = sum(s, "fallback_calls");
  const items: Array<{ title: string; body: string; href: string; action: string; tone: "ok" | "warn" | "bad" }> = [];
  if (app && app.domains.length === 0) items.push({ title: "No allowed origins", body: "The SDK cannot start a session until you add the origin your product runs on.", href: "/dashboard/applications", action: "Add origin", tone: "bad" });
  if (keys.data && !keys.data.some((k) => !k.revoked_at)) items.push({ title: "No active server key", body: "Create an Embed key so your backend can mint 15 minute session tokens.", href: "/dashboard/keys", action: "Create key", tone: "bad" });
  if (src.data && src.data.length === 0) items.push({ title: "No knowledge indexed", body: "Without documents every answer is refused as insufficient evidence.", href: "/dashboard/knowledge", action: "Add source", tone: "warn" });
  if (calls > 0 && fb / calls > 0.2) items.push({ title: `Fallback served ${pct(fb, calls)}% of calls`, body: "Gemini failed often enough that NVIDIA NIM answered. Check provider status and quotas.", href: "/dashboard/analytics", action: "Open analytics", tone: "warn" });
  if ((ts.tools.verification_failed ?? 0) > 0) items.push({ title: `${ts.tools.verification_failed} action(s) failed verification`, body: "Your tool returned success but the record was not found afterwards.", href: "/dashboard/runs", action: "Inspect runs", tone: "bad" });
  const topErr = bd?.errors[0];
  if (topErr) items.push({ title: `Most common failure: ${topErr.code}`, body: `${topErr.n} run(s) ended with this code in the selected period.`, href: "/dashboard/logs", action: "Open logs", tone: "warn" });
  if (app && !app.tool_base_url) items.push({ title: "Actions are not connected", body: "Set a tool base URL so the agent can run approved, verified actions.", href: "/dashboard/applications", action: "Configure", tone: "warn" });
  return (
    <Card className="flex flex-col gap-5">
      <DetailHeader title="Insights"><DetailTag tone={items.length ? "warn" : "ok"}>{items.length ? `${items.length} to review` : "All clear"}</DetailTag></DetailHeader>
      {items.length === 0 && <p className="text-sm text-muted">Origins, keys, knowledge and tools are configured, and nothing unusual happened in this period.</p>}
      <ul className="flex flex-col">
        {items.slice(0, 4).map((it, i) => (
          <li key={it.title} className={i ? "border-t border-line pt-4 mt-4" : ""}>
            <div className="flex items-start gap-3">
              <Marker color={it.tone === "bad" ? C.bad : it.tone === "warn" ? C.warn : C.ok} className="mt-1.5 h-2 w-2 rounded-full" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{it.title}</p>
                <p className="mt-1 text-[13px] leading-5 text-muted">{it.body}</p>
                <Link href={it.href} className="mt-2 inline-flex items-center gap-1 text-[13px] text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">{it.action}<ArrowUpRight size={13} /></Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Overview() {
  const { period } = usePeriod();
  const ts = useGet<TS>(`/v1/usage/timeseries?days=${period}`);
  const bd = useGet<Breakdown>(`/v1/usage/breakdown?days=${period}`);
  const { app } = useVistra();
  const runs = useGet<Run[]>(app ? `/v1/runs?limit=7&application_id=${app.id}` : null);
  const d = ts.data;

  if (ts.error) return <ErrorNote error={ts.error} />;
  if (!d) return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
      <div className="grid gap-3 xl:grid-cols-3"><Skeleton className="h-96 xl:col-span-2" /><Skeleton className="h-96" /></div>
    </div>
  );

  const s = d.series;
  const runsN = sum(s, "runs"), done = sum(s, "completed"), failed = sum(s, "failed"), calls = sum(s, "calls"), fb = sum(s, "fallback_calls");
  const verified = d.tools.verified ?? 0, toolTotal = d.tools.total ?? 0;
  const latDays = s.filter((x) => x.avg_latency_ms > 0);
  const avgLat = latDays.length ? Math.round(latDays.reduce((a, x) => a + x.avg_latency_ms, 0) / latDays.length) : 0;
  const p95 = Math.max(0, ...(bd.data?.capabilities.map((c) => c.p95_ms ?? 0) ?? [0]));
  const chart = s.map((x) => ({ name: short(x.day), runs: x.runs, failed: x.failed }));
  const providers = d.providers.reduce<Record<string, number>>((a, p) => ({ ...a, [p.provider]: (a[p.provider] ?? 0) + p.calls }), {});
  const pie = Object.entries(providers).map(([name, value], i) => ({ name, value, fill: [C.c1, C.c2, C.c3, C.c4][i % 4] }));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Summary title="Runs" value={String(runsN)} note={`${failed} failed`}><Spark data={s} k="runs" /></Summary>
        <Summary title="Completion rate" value={runsN ? `${pct(done, runsN)}%` : "-"} note={`${done} completed`}><Spark data={s} k="completed" /></Summary>
        <Summary title="Model calls" value={String(calls)} note={`${fb} via fallback`}><Spark data={s} k="calls" kind="bar" /></Summary>
        <Summary title="Verified actions" value={String(verified)} note={`of ${toolTotal} tool calls`}>
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-sm bg-hover"><div className="h-full rounded-sm bg-ink transition-[width] duration-500 ease-out" style={{ width: `${pct(verified, toolTotal)}%` }} /></div>
            <div className="flex justify-between text-xs text-muted"><span>{d.tools.needed_approval ?? 0} needed approval</span><span>{d.tools.denied ?? 0} denied</span></div>
          </div>
        </Summary>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="flex flex-col gap-5 xl:col-span-2">
          <DetailHeader title="Runs over time" subtitle={`Daily runs and failures, last ${period} days`}>
            <DetailTag>{runsN} total</DetailTag>
            <Link href="/dashboard/analytics"><Button size="sm" variant="outline">Analytics<ArrowUpRight size={14} /></Button></Link>
          </DetailHeader>
          <div className="h-72" role="img" aria-label={`Runs per day over the last ${period} days`}>
            <ResponsiveContainer>
              <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <defs><linearGradient id="perf" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={C.c1} stopOpacity={0.3} /><stop offset="100%" stopColor={C.c1} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="name" stroke={C.axis} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} stroke={C.axis} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ stroke: C.grid }} content={<ChartTooltip names={{ runs: "Runs", failed: "Failed" }} colors={{ runs: C.c1, failed: C.bad }} />} />
                <Area type="monotone" dataKey="runs" stroke={C.c1} strokeWidth={2.25} fill="url(#perf)" />
                <Area type="monotone" dataKey="failed" stroke={C.bad} strokeWidth={1.5} strokeDasharray="5 5" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Runs", color: C.c1 }, { label: "Failed", color: C.bad }]} />
          <dl className="grid grid-cols-2 gap-5 border-t border-line pt-5 md:grid-cols-4">
            {[["Avg model latency", ms(avgLat)], ["p95 model latency", ms(p95 || null)], ["Fallback calls", String(fb)], ["Actions requested", String(sum(s, "actions"))]].map(([k, v]) => (
              <div key={k}><dt className="text-[13px] text-muted">{k}</dt><dd className="num mt-1.5 text-xl font-medium">{v}</dd></div>
            ))}
          </dl>
        </Card>

        <Card className="flex flex-col gap-5">
          <DetailHeader title="Calls by provider"><DetailTag>{calls} calls</DetailTag></DetailHeader>
          {pie.length ? (
            <>
              <div className="relative mx-auto h-52 w-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={70} outerRadius={96} paddingAngle={pie.length > 1 ? 4 : 0} cornerRadius={4} stroke="none" startAngle={90} endAngle={-270}>
                      {pie.map((p) => <Cell key={p.name} fill={p.fill} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div><div className="num text-2xl font-semibold">{pct(calls - fb, calls)}%</div><div className="text-xs text-muted">served by primary</div></div>
                </div>
              </div>
              <ul className="space-y-3">
                {d.providers.map((p, i) => (
                  <li key={p.provider + p.model} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2.5"><Marker color={pie.find((x) => x.name === p.provider)?.fill ?? C.c3} /><span className="min-w-0"><span className="block font-medium">{p.provider}</span><span className="block truncate font-mono text-[11px] text-subtle">{p.model}</span></span></span>
                    <span className="num shrink-0 text-right text-muted">{p.calls}{p.failed ? <span className="block text-xs text-bad">{p.failed} failed</span> : null}</span>
                    {i > 5 ? null : null}
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="text-sm text-muted">No model calls in this period.</p>}
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="flex flex-col gap-4 lg:col-span-2">
          <DetailHeader title="Recent runs"><Link href="/dashboard/runs"><Button size="sm" variant="outline">All runs<ArrowUpRight size={14} /></Button></Link></DetailHeader>
          {runs.isLoading ? <Skeleton className="h-48" /> : runs.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead><tr className="text-[12px] text-subtle"><th className="pb-2 font-medium">Request</th><th className="pb-2 font-medium">Intent</th><th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium">Provider</th><th className="pb-2 text-right font-medium">When</th></tr></thead>
                <tbody className="divide-y divide-line border-t border-line">
                  {runs.data.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-hover/40">
                      <td className="max-w-[16rem] truncate py-2.5"><Link href={`/dashboard/runs/${r.id}`} className="hover:underline">{r.input}</Link></td>
                      <td className="text-muted">{r.intent ?? "-"}</td>
                      <td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                      <td className="text-muted">{r.served_by?.provider ?? "-"}{r.served_by?.fallback_used && <span className="ml-1 text-warn">fallback</span>}</td>
                      <td className="text-right text-muted">{timeAgo(r.started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No runs yet" body="Open the Agents page and send a message in the playground, or embed the SDK in your product." action={<Link href="/dashboard/agents"><Button variant="solid">Open playground</Button></Link>} />}
        </Card>
        <Insights ts={d} bd={bd.data} />
      </div>
    </div>
  );
}
