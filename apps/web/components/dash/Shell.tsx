"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LiveBlob } from "@/components/assistant/LiveBlob";
import { ToastProvider } from "@/components/ui";
import { VistraApiProvider } from "@/lib/api";
import { PeriodProvider } from "./period";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [rail, setRailState] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setRailState(localStorage.getItem("vistra.rail") === "1"), []);
  const setRail = (v: boolean) => { localStorage.setItem("vistra.rail", v ? "1" : "0"); setRailState(v); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); setRail(!rail); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <VistraApiProvider>
      <ToastProvider>
        <PeriodProvider>
          <div className="flex min-h-screen bg-canvas">
            <Sidebar rail={rail} setRail={setRail} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
            <div className="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2">
              <div className="flex min-h-0 flex-1 flex-col bg-bg md:rounded-xl md:border md:border-line">
                <Topbar onMenu={() => setMobileOpen(true)} />
                <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
              </div>
            </div>
          </div>
          <LiveBlob />
        </PeriodProvider>
      </ToastProvider>
    </VistraApiProvider>
  );
}
