"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, Card, ChartTooltip, DetailHeader, DetailTag, Legend } from "@/components/dash/primitives";
import { usePeriod } from "@/components/dash/period";
import { ErrorNote, Skeleton } from "@/components/ui";
import { useGet } from "@/lib/api";
import { ms } from "@/lib/format";

interface Day { day: string; runs: number; completed: number; failed: number; calls: number; failed_calls: number; fallback_calls: number; avg_latency_ms: number; input_tokens: number; output_tokens: number }
interface TS { series: Day[] }
interface BD { intents: Array<{ intent: string; runs: number; completed: number }>; capabilities: Array<{ capability: string; calls: number; avg_ms: number | null; p95_ms: number | null }>; errors: Array<{ code: string; n: number }> }

const short = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" });
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const axisProps = { stroke: C.axis, fontSize: 11, tickLine: false, axisLine: false } as const;

export default function Analytics() {
  const { period } = usePeriod();
  const ts = useGet<TS>(`/v1/usage/timeseries?days=${period}`);
  const bd = useGet<BD>(`/v1/usage/breakdown?days=${period}`);
  if (ts.error || bd.error) return <ErrorNote error={ts.error ?? bd.error} />;
  if (!ts.data || !bd.data) return <div className="grid gap-3"><Skeleton className="h-96" /><div className="grid gap-3 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}</div></div>;

  const rows = ts.data.series.map((d) => ({ name: short(d.day), ...d, primary: d.calls - d.fallback_calls - d.failed_calls }));
  const tokIn = rows.reduce((a, r) => a + r.input_tokens, 0), tokOut = rows.reduce((a, r) => a + r.output_tokens, 0);
  const calls = rows.reduce((a, r) => a + r.calls, 0);
  const failedCalls = rows.reduce((a, r) => a + r.failed_calls, 0);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-5">
        <DetailHeader title="Model latency" subtitle={`Average latency of successful calls per day, last ${period} days`}>
          <DetailTag>{calls} calls</DetailTag><DetailTag tone={failedCalls ? "warn" : "ok"}>{failedCalls} failed attempts</DetailTag>
        </DetailHeader>
        <div className="h-80" role="img" aria-label="Average model latency per day">
          <ResponsiveContainer>
            <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <defs><linearGradient id="lat" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={C.c1} stopOpacity={0.3} /><stop offset="100%" stopColor={C.c1} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="name" {...axisProps} minTickGap={24} />
              <YAxis {...axisProps} tickFormatter={(v) => ms(Number(v))} width={56} />
              <Tooltip cursor={{ stroke: C.grid }} content={<ChartTooltip names={{ avg_latency_ms: "Avg latency" }} format={(v) => ms(Number(v))} />} />
              <Area type="monotone" dataKey="avg_latency_ms" stroke={C.c1} strokeWidth={2.25} fill="url(#lat)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="flex min-h-64 flex-col gap-4">
          <DetailHeader title="Tokens" subtitle={`${k(tokIn)} in, ${k(tokOut)} out`} />
          <div className="min-h-40 flex-1"><ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" hide /><YAxis {...axisProps} tickFormatter={(v) => k(Number(v))} />
              <Tooltip cursor={false} content={<ChartTooltip names={{ input_tokens: "Input", output_tokens: "Output" }} colors={{ input_tokens: C.c3, output_tokens: C.c1 }} />} />
              <Bar dataKey="input_tokens" stackId="t" fill={C.c3} /><Bar dataKey="output_tokens" stackId="t" fill={C.c1} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
          <Legend items={[{ label: "Input", color: C.c3 }, { label: "Output", color: C.c1 }]} />
        </Card>
        <Card className="flex min-h-64 flex-col gap-4">
          <DetailHeader title="Who served each call" subtitle="Primary, fallback and failed attempts" />
          <div className="min-h-40 flex-1"><ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="name" hide /><YAxis {...axisProps} allowDecimals={false} />
              <Tooltip cursor={false} content={<ChartTooltip names={{ primary: "Primary", fallback_calls: "Fallback", failed_calls: "Failed" }} colors={{ primary: C.c1, fallback_calls: C.warn, failed_calls: C.bad }} />} />
              <Bar dataKey="primary" stackId="p" fill={C.c1} /><Bar dataKey="fallback_calls" stackId="p" fill={C.warn} /><Bar dataKey="failed_calls" stackId="p" fill={C.bad} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
          <Legend items={[{ label: "Primary", color: C.c1 }, { label: "Fallback", color: C.warn }, { label: "Failed", color: C.bad }]} />
        </Card>
        <Card className="flex min-h-64 flex-col gap-4">
          <DetailHeader title="Intents" subtitle="What users asked the agent to do" />
          {bd.data.intents.length ? (
            <ul className="space-y-3">
              {bd.data.intents.map((it) => {
                const max = Math.max(...bd.data!.intents.map((x) => x.runs));
                return (
                  <li key={it.intent}>
                    <div className="mb-1.5 flex justify-between text-[13px]"><span>{it.intent.replace("_", " ")}</span><span className="num text-muted">{it.runs} <span className="text-subtle">({it.completed} ok)</span></span></div>
                    <div className="h-1.5 rounded-sm bg-hover"><div className="h-full rounded-sm bg-ink" style={{ width: `${(it.runs / max) * 100}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted">No runs in this period.</p>}
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <DetailHeader title="Latency by capability" subtitle="Successful calls only" />
          <table className="w-full text-left text-sm">
            <thead><tr className="text-[12px] text-subtle"><th className="pb-2 font-medium">Capability</th><th className="pb-2 text-right font-medium">Calls</th><th className="pb-2 text-right font-medium">Avg</th><th className="pb-2 text-right font-medium">p95</th></tr></thead>
            <tbody className="divide-y divide-line border-t border-line">
              {bd.data.capabilities.map((c) => (
                <tr key={c.capability}><td className="py-2.5 font-mono text-[12.5px]">{c.capability}</td><td className="num text-right text-muted">{c.calls}</td><td className="num text-right">{ms(c.avg_ms)}</td><td className="num text-right">{ms(c.p95_ms)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="flex flex-col gap-4">
          <DetailHeader title="Failures" subtitle="Run error codes in this period"><DetailTag tone={bd.data.errors.length ? "bad" : "ok"}>{bd.data.errors.reduce((a, e) => a + e.n, 0)} failed runs</DetailTag></DetailHeader>
          {bd.data.errors.length ? (
            <ul className="divide-y divide-line border-y border-line text-sm">
              {bd.data.errors.map((e) => <li key={e.code} className="flex justify-between py-2.5"><span className="font-mono text-[12.5px]">{e.code}</span><span className="num text-muted">{e.n}</span></li>)}
            </ul>
          ) : <p className="text-sm text-muted">No failed runs. Policy denials and verification failures would appear here with their stable error codes.</p>}
        </Card>
      </div>
    </div>
  );
}
