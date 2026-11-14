"use client";

import { UserButton } from "@clerk/nextjs";
import clsx from "clsx";
import { Activity, BarChart3, BookOpen, Bot, Boxes, ChevronDown, ChevronsUpDown, KeyRound, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Plug, ScrollText, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { Skeleton } from "@/components/ui";
import { useVistra } from "@/lib/api";

type Item = { href: string; label: string; icon: ComponentType<{ size?: number; className?: string }>; target: string };
const SECTIONS: Array<{ label: string; items: Item[] }> = [
  { label: "Overview", items: [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, target: "nav.overview" },
    { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, target: "nav.analytics" },
  ] },
  { label: "Build", items: [
    { href: "/dashboard/agents", label: "Agents", icon: Bot, target: "nav.agents" },
    { href: "/dashboard/knowledge", label: "Knowledge", icon: BookOpen, target: "nav.knowledge" },
    { href: "/dashboard/applications", label: "Applications", icon: Boxes, target: "nav.applications" },
  ] },
  { label: "Operate", items: [
    { href: "/dashboard/runs", label: "Runs", icon: Activity, target: "nav.runs" },
    { href: "/dashboard/logs", label: "Logs", icon: ScrollText, target: "nav.logs" },
  ] },
  { label: "Integrate", items: [
    { href: "/dashboard/keys", label: "API keys", icon: KeyRound, target: "nav.keys" },
    { href: "/dashboard/install", label: "Install", icon: Plug, target: "nav.install" },
  ] },
];

const isActive = (path: string, href: string) => (href === "/dashboard" ? path === href : path.startsWith(href));

function AppSwitcher({ rail }: { rail: boolean }) {
  const { me, app, setAppId, loading } = useVistra();
  const [open, setOpen] = useState(false);
  if (loading || !app) return <Skeleton className={rail ? "h-10 w-10" : "h-12 w-full"} />;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox" title={rail ? app.name : undefined}
        className={clsx("flex w-full items-center gap-3 rounded-lg border border-line-strong text-left transition-colors duration-150 hover:bg-hover", rail ? "h-10 justify-center" : "px-3 py-2")}>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink text-[11px] font-semibold text-bg">{app.name.slice(0, 1).toUpperCase()}</span>
        {!rail && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{app.name}</span>
              <span className="block truncate font-mono text-[10.5px] text-subtle">{app.id}</span>
            </span>
            <ChevronsUpDown size={14} className="shrink-0 text-subtle" />
          </>
        )}
      </button>
      {open && (
        <ul role="listbox" aria-label="Applications" className="absolute left-0 top-full z-40 mt-1 max-h-72 w-60 overflow-auto rounded-lg border border-line-strong bg-panel p-1 shadow-2xl">
          {me?.applications.map((a) => (
            <li key={a.id}>
              <button role="option" aria-selected={a.id === app.id} onClick={() => { setAppId(a.id); setOpen(false); }}
                className={clsx("w-full truncate rounded-md px-3 py-2 text-left text-sm hover:bg-hover", a.id === app.id && "bg-hover")}>{a.name}</button>
            </li>
          ))}
          <li className="mt-1 border-t border-line pt-1">
            <Link href="/dashboard/applications" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-muted hover:bg-hover hover:text-ink">Manage applications</Link>
          </li>
        </ul>
      )}
    </div>
  );
}

function Section({ label, items, rail, path, onNavigate }: { label: string; items: Item[]; rail: boolean; path: string; onNavigate: () => void }) {
  const key = `vistra.nav.${label}`;
  const [open, setOpen] = useState(true);
  useEffect(() => { setOpen(localStorage.getItem(key) !== "0"); }, [key]);
  const toggle = () => { setOpen((o) => { localStorage.setItem(key, o ? "0" : "1"); return !o; }); };
  const showItems = rail || open;
  return (
    <div>
      {!rail && (
        <button onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between px-2 pb-1.5 pt-3 text-[12px] font-medium text-subtle transition-colors hover:text-muted">
          {label}
          <ChevronDown size={13} className={clsx("transition-transform duration-200", !open && "-rotate-90")} />
        </button>
      )}
      {rail && <div className="mx-auto my-2 h-px w-6 bg-line" />}
      <div className={clsx("grid transition-[grid-template-rows] duration-200 ease-out", showItems ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <ul className="flex flex-col gap-0.5 overflow-hidden">
          {items.map(({ href, label: l, icon: Icon, target }) => {
            const active = isActive(path, href);
            return (
              <li key={href}>
                <Link href={href} onClick={onNavigate} data-vistra-target={target} aria-current={active ? "page" : undefined} title={rail ? l : undefined}
                  className={clsx("flex items-center gap-3 rounded-lg text-sm transition-colors duration-150", rail ? "h-10 justify-center" : "px-3 py-2",
                    active ? "bg-hover text-ink" : "text-muted hover:bg-raised hover:text-ink")}>
                  <Icon size={17} className="shrink-0" />
                  {!rail && <span className="truncate">{l}</span>}
                  {rail && <span className="sr-only">{l}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function Sidebar({ rail, setRail, mobileOpen, setMobileOpen }: { rail: boolean; setRail: (v: boolean) => void; mobileOpen: boolean; setMobileOpen: (v: boolean) => void }) {
  const path = usePathname();
  const { me } = useVistra();
  const body = (isRail: boolean, mobile: boolean) => (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className={clsx("flex items-center gap-2 pt-1", isRail ? "flex-col" : "justify-between px-1")}>
        <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight" title="VISTRA home">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-ink"><svg width="13" height="13" viewBox="0 0 28 28"><path d="M3 2 L3 22 L8.5 17 L12.5 26 L16 24.5 L12 15.5 L19.5 15.5 Z" fill="#0a0a0a" /></svg></span>
          {!isRail && "vistra"}
        </Link>
        {mobile ? (
          <button onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink"><X size={17} /></button>
        ) : (
          <button onClick={() => setRail(!isRail)} aria-label={isRail ? "Expand sidebar" : "Collapse sidebar"} title={isRail ? "Expand sidebar" : "Collapse sidebar"} className="rounded-md p-1.5 text-subtle transition-colors hover:bg-hover hover:text-ink">
            {isRail ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        )}
      </div>
      <AppSwitcher rail={isRail} />
      <nav aria-label="Dashboard" className="-mx-1 flex-1 overflow-y-auto px-1">
        {SECTIONS.map((s) => <Section key={s.label} {...s} rail={isRail} path={path} onNavigate={() => setMobileOpen(false)} />)}
      </nav>
      <div className={clsx("flex items-center gap-3 border-t border-line pt-3", isRail && "justify-center")}>
        <UserButton />
        {!isRail && (
          <div className="min-w-0 text-xs">
            <div className="truncate font-medium">{me?.organization.name ?? "Organization"}</div>
            <div className="truncate font-mono text-[10.5px] text-subtle">{me?.organization.id}</div>
          </div>
        )}
      </div>
    </div>
  );
  return (
    <>
      <aside className={clsx("sticky top-0 hidden h-screen shrink-0 self-start bg-canvas transition-[width] duration-200 ease-out md:block", rail ? "w-[4.25rem]" : "w-64")}>{body(rail, false)}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button aria-label="Close navigation" className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-canvas shadow-2xl">{body(false, true)}</aside>
        </div>
      )}
    </>
  );
}
