"use client";

import { CalendarDays, ChevronDown, Download, Menu, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Button, useToast } from "@/components/ui";
import { useVistra } from "@/lib/api";
import { PERIODS, usePeriod } from "./period";

const TITLES: Record<string, string> = {
  "/dashboard": "Overview", "/dashboard/analytics": "Analytics", "/dashboard/agents": "Agents", "/dashboard/knowledge": "Knowledge",
  "/dashboard/applications": "Applications", "/dashboard/runs": "Runs", "/dashboard/logs": "Logs", "/dashboard/keys": "API keys",
  "/dashboard/install": "Install",
};

function titleFor(path: string) {
  if (path.startsWith("/dashboard/runs/")) return "Run detail";
  return TITLES[path] ?? "Dashboard";
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0] as object);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const path = usePathname();
  const { app, call } = useVistra();
  const { period, setPeriod } = usePeriod();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [updated, setUpdated] = useState("");
  const [busy, setBusy] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => setUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), [period, path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function refresh() {
    setBusy(true);
    await mutate(() => true);
    setUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setBusy(false);
  }

  async function exportCsv() {
    try {
      const rows = await call<Array<Record<string, unknown>>>(`/v1/runs?limit=200&application_id=${encodeURIComponent(app?.id ?? "")}`);
      const flat = rows.map((r) => ({ id: r.id, started_at: r.started_at, intent: r.intent, status: r.status, error_code: r.error_code,
        input: r.input, provider: (r.served_by as { provider?: string } | null)?.provider ?? "", fallback: (r.served_by as { fallback_used?: boolean } | null)?.fallback_used ?? false,
        tool_calls: r.tool_calls, model_ms: r.model_ms }));
      const blob = new Blob([toCsv(flat)], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `vistra-runs-${app?.id ?? "app"}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast(`Exported ${flat.length} runs`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "bad");
    }
  }

  const label = PERIODS.find((p) => p.value === period)?.label ?? "";
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onMenu} aria-label="Open navigation" className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink md:hidden"><Menu size={19} /></button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">{titleFor(path)}</h1>
          <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted">
            <span>Updated {updated}</span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-subtle" />
            <span className="truncate">{app?.name ?? "..."}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div ref={menu} className="relative">
          <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
            className="flex h-9 items-center gap-2 rounded-lg border border-line-strong px-3 text-[13px] text-muted transition-colors duration-150 hover:bg-hover hover:text-ink">
            <CalendarDays size={15} /><span>{label}</span><ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          {open && (
            <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-line-strong bg-panel p-1 shadow-2xl">
              {PERIODS.map((p) => (
                <button key={p.value} role="menuitemradio" aria-checked={p.value === period} onClick={() => { setPeriod(p.value); setOpen(false); }}
                  className={`w-full rounded-md px-3 py-2 text-left text-[13px] hover:bg-hover ${p.value === period ? "text-ink" : "text-muted"}`}>{p.label}</button>
              ))}
            </div>
          )}
        </div>
        <Button variant="outline" size="md" onClick={refresh} aria-label="Refresh data" title="Refresh data"><RefreshCw size={15} className={busy ? "animate-spin" : ""} /></Button>
        <Button variant="solid" onClick={exportCsv} disabled={!app}><Download size={15} />Export</Button>
      </div>
    </header>
  );
}
