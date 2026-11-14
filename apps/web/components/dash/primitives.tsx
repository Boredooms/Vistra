"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

/** Chart palette: monochrome steps. Status colours are reserved for ok / warn / fail. */
export const C = {
  c1: "oklch(0.95 0 0)",
  c2: "oklch(0.74 0 0)",
  c3: "oklch(0.55 0 0)",
  c4: "oklch(0.40 0 0)",
  ok: "oklch(0.8 0.15 160)",
  warn: "oklch(0.82 0.13 85)",
  bad: "oklch(0.72 0.17 25)",
  grid: "oklch(1 0 0 / 0.06)",
  axis: "oklch(0.62 0 0)",
} as const;

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <article className={clsx("min-w-0 rounded-xl border border-line bg-raised p-5", className)}>{children}</article>;
}

export function DetailHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-medium leading-6">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-[13px] text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>}
    </div>
  );
}

export function DetailTag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" }) {
  return (
    <span className={clsx("rounded-md px-2.5 py-1 text-xs font-medium",
      tone === "neutral" && "bg-hover text-muted", tone === "ok" && "bg-hover text-ok", tone === "warn" && "bg-hover text-warn", tone === "bad" && "bg-hover text-bad")}>
      {children}
    </span>
  );
}

export const Marker = ({ color, className }: { color: string; className?: string }) => (
  <span aria-hidden className={clsx("inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]", className)} style={{ background: color }} />
);

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2 text-xs text-muted"><Marker color={i.color} />{i.label}</span>
      ))}
    </div>
  );
}

type TipItem = { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> };

/** Recharts tooltip content in the dashboard vocabulary. */
export function ChartTooltip({ active, label, payload, names, colors, format }: {
  active?: boolean; label?: string | number; payload?: readonly TipItem[];
  names?: Record<string, string>; colors?: Record<string, string>; format?: (v: number | string, key: string) => ReactNode;
}) {
  const items = (payload ?? []).filter((p) => p.value !== undefined && p.value !== null);
  if (!active || !items.length) return null;
  const head = (items[0]?.payload?.name as string | undefined) ?? label;
  return (
    <div className="rounded-lg border border-line-strong bg-panel px-3 py-2.5 text-xs shadow-2xl">
      {head !== undefined && <div className="mb-1.5 text-muted">{head}</div>}
      <div className="space-y-1.5">
        {items.map((it) => {
          const key = String(it.dataKey ?? it.name ?? "");
          return (
            <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-5">
              <span className="flex items-center gap-2"><Marker color={colors?.[key] ?? it.color ?? (it.payload?.fill as string) ?? C.c1} />{names?.[key] ?? it.name ?? key}</span>
              <span className="num font-medium">{format ? format(it.value ?? "", key) : it.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line-strong p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={clsx("rounded-md px-3 py-1 text-[13px] transition-colors duration-150", value === o.value ? "bg-ink text-bg" : "text-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40", checked ? "bg-ink" : "bg-hover")}>
      <span className={clsx("absolute left-0 top-0.5 h-4 w-4 rounded-full transition-transform duration-200 ease-out", checked ? "translate-x-[18px] bg-bg" : "translate-x-0.5 bg-muted")} />
    </button>
  );
}
