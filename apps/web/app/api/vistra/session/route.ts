import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Mints/refreshes the SDK token for the website's own assistant. The API key stays on the server.
 * Signed-in visitors get role "admin" of their own session; anonymous visitors get "viewer".
 */
export async function POST(req: Request) {
  const apiUrl = process.env.VISTRA_API_URL;
  const key = process.env.VISTRA_API_KEY;
  if (!apiUrl || !key) return NextResponse.json({ code: "INTERNAL_ERROR", detail: "Assistant is not configured" }, { status: 500 });
  const { userId } = await auth();
  const body = (await req.json().catch(() => ({}))) as { session_id?: string };
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const sid = body.session_id && /^[0-9a-f-]{36}$/i.test(body.session_id) ? body.session_id : null;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Origin: origin };
  let res = sid ? await fetch(`${apiUrl}/v1/sdk/sessions/${sid}/refresh`, { method: "POST", headers }) : null;
  if (!res || !res.ok) {
    res = await fetch(`${apiUrl}/v1/sdk/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ end_user: { id: userId ?? undefined, role: userId ? "admin" : "viewer" }, origin }),
    });
  }
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  return NextResponse.json({ token: data.token, session_id: data.session_id, token_ttl: data.token_ttl });
}
