"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const I = {
  dashboard: "M3 3h6v8H3zM11 3h6v5h-6zM11 10h6v7h-6zM3 13h6v4H3z",
  projects: "M3 6h14v10H3zM3 6l2-3h4l2 3",
  team: "M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 17c0-3 2.2-5 5-5s5 2 5 5M13 4.5a2.5 2.5 0 0 1 0 5M15 12c1.8.6 3 2.4 3 5",
  billing: "M2.5 5h15v10h-15zM2.5 8.5h15M5.5 12h3",
  docs: "M5 2.5h7l3 3v12H5zM12 2.5v3h3M7.5 9.5h5M7.5 12.5h5",
  settings: "M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.3 4.3l1.8 1.8M13.9 13.9l1.8 1.8M4.3 15.7l1.8-1.8M13.9 6.1l1.8-1.8",
};

const NAV = [
  ["nav.dashboard", "/dashboard", "Dashboard", I.dashboard],
  ["nav.projects", "/projects", "Projects", I.projects],
  ["nav.team", "/team", "Team", I.team],
  ["nav.billing", "/billing", "Billing", I.billing],
  ["nav.docs", "/docs", "Docs", I.docs],
  ["nav.settings", "/settings", "Settings", I.settings],
] as const;

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

type Conn = { configured: boolean; appId?: string; appName?: string | null; source?: string };

export function Sidebar() {
  const path = usePathname();
  const [conn, setConn] = useState<Conn | null>(null);
  useEffect(() => {
    fetch("/api/setup", { cache: "no-store" }).then((r) => r.json()).then(setConn).catch(() => setConn({ configured: false }));
  }, [path]);

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-panel px-3 py-4">
      <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-2" aria-label="Acme Workspace home">
        <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[13px] font-bold text-white">A</span>
        <span className="text-[14px] font-semibold">Acme Workspace</span>
      </Link>
      <nav aria-label="Primary" className="flex flex-col gap-0.5">
        {NAV.map(([id, href, label, d]) => (
          <Link key={id} href={href} data-vistra-target={id} aria-current={path.startsWith(href) ? "page" : undefined} className="nav-link">
            <Icon d={d} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto">
        <Link href="/setup" data-vistra-target="nav.setup" className="block rounded-xl border border-line bg-surface p-3 transition-colors hover:border-[var(--line-strong)]">
          <div className="flex items-center gap-2 text-[12.5px] font-medium">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${conn?.configured ? "bg-ok" : conn ? "bg-warn" : "bg-line"}`} />
            {conn === null ? "Checking VISTRA..." : conn.configured ? "VISTRA connected" : "Connect VISTRA"}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {conn?.configured ? `${conn.appName ?? conn.appId} · ${conn.source === "env" ? "from .env" : "from setup"}` : "Paste an app ID and API key"}
          </div>
        </Link>
      </div>
    </aside>
  );
}
