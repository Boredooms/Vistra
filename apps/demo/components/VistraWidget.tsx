"use client";

import { Vistra, mountWidget } from "@boredooms/vistra-sdk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TARGETS } from "@/lib/targets";
import { getSessionToken } from "@/lib/vistra";

type Conn = { configured: boolean; apiUrl?: string; appId?: string };

/**
 * The whole integration: Vistra.init + mountWidget. The SDK owns the UI (shadow DOM, blob launcher),
 * Acme only supplies its session route, its cross-page targets, and what to do after a verified action.
 */
export function VistraWidget() {
  const router = useRouter();
  const [conn, setConn] = useState<Conn | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const load = () => fetch("/api/setup", { cache: "no-store" }).then((r) => r.json()).then(setConn).catch(() => setConn({ configured: false }));
    void load();
    // /setup saved new credentials: drop the old session and reconnect the assistant
    const onChange = () => { try { sessionStorage.removeItem("vistra.session_id"); } catch { /* */ } void load(); };
    window.addEventListener("vistra:config-changed", onChange);
    return () => window.removeEventListener("vistra:config-changed", onChange);
  }, []);

  useEffect(() => {
    if (!conn?.configured || !conn.apiUrl || !conn.appId) return;
    const role = new URLSearchParams(location.search).get("role") ?? undefined;
    const vistra = Vistra.init({
      appId: conn.appId,
      apiUrl: conn.apiUrl,
      getSessionToken: (prev) => getSessionToken(prev, role),
      targets: TARGETS,
    });
    const widget = mountWidget(vistra, {
      title: "Acme Assistant",
      greeting: "Ask about Acme, point at anything on screen, or ask me to do something. Changes always need your approval.",
      suggestions: ["What's included in the Starter plan?", "Show me how to invite a teammate", "Create a project called Q4 Launch", "Explain this page"],
      devTools: true,
      theme: { accent: "oklch(0.5 0.105 195)", accentInk: "#ffffff" },
      citationHref: (c) => (c.anchor ? `/docs#${c.anchor}` : "/docs"),
      runHref: (id) => `/runs/${id}`,
      onVerified: ({ tool, record }) => {
        router.refresh();
        const label = (record?.name ?? record?.email ?? "") as string;
        const id = typeof record?.id === "string" ? record.id.slice(0, 8) : "";
        setToast(`Verified ${tool.replace(/_/g, " ")}${label ? `: ${label}` : ""}${id ? ` (id ${id})` : ""}`);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setToast(null), 5000);
      },
    });
    // Re-broadcast SDK events so any page (e.g. /setup) can show the live call feed.
    const names = ["run.started", "provider.trace", "retrieval.completed", "citation", "guide.proposed", "approval.required",
      "tool.executing", "verification.succeeded", "verification.failed", "run.completed", "run.failed", "session.refreshed"] as const;
    const offs = names.map((n) => vistra.on(n, (d) => window.dispatchEvent(new CustomEvent("vistra:event", { detail: { name: n, data: d, at: Date.now() } }))));
    return () => {
      offs.forEach((off) => off());
      widget.destroy();
      vistra.destroy();
    };
  }, [conn, router]);

  return (
    <>
      {conn && !conn.configured && (
        <Link href="/setup" data-vistra-ui className="btn btn-primary fixed bottom-5 right-5 z-[60] h-11 rounded-full px-5 shadow-lg">
          Connect VISTRA
        </Link>
      )}
      {toast && (
        <div role="status" aria-live="polite" className="toast fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-lg">
          <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-[oklch(0.8_0.14_150)]" />
          {toast}
        </div>
      )}
    </>
  );
}
