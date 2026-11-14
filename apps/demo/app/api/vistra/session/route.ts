import { NextResponse } from "next/server";
import { getConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Mints / refreshes a short-lived VISTRA SDK token. The API key lives only here (server side): from /setup or env.
 * The browser Origin is forwarded so the API can validate it against the application's registered domains.
 */
export async function POST(req: Request) {
  const cfg = await getConfig();
  if (!cfg) return NextResponse.json({ code: "NOT_CONFIGURED", detail: "Connect VISTRA on /setup first" }, { status: 412 });

  const body = (await req.json().catch(() => ({}))) as { session_id?: string; role?: string };
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const sessionId = body.session_id && /^[0-9a-f-]{36}$/i.test(body.session_id) ? body.session_id : null;
  const role = body.role === "viewer" ? "viewer" : "admin"; // demo switch to show the policy deny path

  const headers = { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", Origin: origin };
  let res: Response | null = null;
  try {
    if (sessionId) res = await fetch(`${cfg.apiUrl}/v1/sdk/sessions/${sessionId}/refresh`, { method: "POST", headers });
    if (!res || !res.ok) {
      res = await fetch(`${cfg.apiUrl}/v1/sdk/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ end_user: { id: "user_dev_owner", role }, origin }),
      });
    }
  } catch {
    return NextResponse.json({ code: "API_UNREACHABLE", detail: `Cannot reach ${cfg.apiUrl}` }, { status: 502 });
  }
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  return NextResponse.json({ token: data.token, session_id: data.session_id, token_ttl: data.token_ttl, api_url: cfg.apiUrl });
}
