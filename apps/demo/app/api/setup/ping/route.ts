import { NextResponse } from "next/server";
import { getConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Live backend check for the setup page: API readiness (DB) and the latency from Acme's server. */
export async function GET() {
  const cfg = await getConfig();
  if (!cfg) return NextResponse.json({ ok: false, status: "not_configured" });
  const t0 = Date.now();
  try {
    const r = await fetch(`${cfg.apiUrl}/readyz`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const body = await r.json().catch(() => ({}));
    return NextResponse.json({ ok: r.ok, status: r.ok ? "ready" : "degraded", ms: Date.now() - t0, apiUrl: cfg.apiUrl, detail: body });
  } catch {
    return NextResponse.json({ ok: false, status: "unreachable", ms: Date.now() - t0, apiUrl: cfg.apiUrl });
  }
}
