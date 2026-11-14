import { NextResponse } from "next/server";
import { clearConfig, publicConfig, saveConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

interface SetupBody {
  apiUrl?: string;
  appId?: string;
  apiKey?: string;
  toolSecret?: string;
}

const bad = (status: number, code: string, detail: string, hint?: string) =>
  NextResponse.json({ ok: false, code, detail, hint }, { status });

export async function GET() {
  return NextResponse.json(await publicConfig());
}

export async function DELETE() {
  await clearConfig();
  return NextResponse.json(await publicConfig());
}

/** Validates the pasted credentials against the real API before storing them (server side only). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as SetupBody;
  const apiUrl = (b.apiUrl ?? "").trim().replace(/\/+$/, "");
  const appId = (b.appId ?? "").trim();
  const apiKey = (b.apiKey ?? "").trim();
  const toolSecret = (b.toolSecret ?? "").trim() || null;
  if (!/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(apiUrl)) return bad(422, "VALIDATION_ERROR", "API URL must be an http(s) URL");
  if (!/^app_[A-Za-z0-9_]{2,40}$/.test(appId)) return bad(422, "VALIDATION_ERROR", "App ID looks like app_xxxxxxxx");
  if (apiKey.length < 20 || /\s/.test(apiKey)) return bad(422, "VALIDATION_ERROR", "Paste the full API key shown once on the Keys page");
  if (toolSecret && (toolSecret.length < 20 || /\s/.test(toolSecret))) return bad(422, "VALIDATION_ERROR", "Paste the full tool secret (shown once when rotated)");

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Origin: origin };
  let cfgRes: Response;
  try {
    cfgRes = await fetch(`${apiUrl}/v1/sdk/config`, { headers, cache: "no-store" });
  } catch {
    return bad(502, "API_UNREACHABLE", `Cannot reach ${apiUrl}`, "Is the VISTRA API running? Locally: uv run python run_dev.py 8000");
  }
  const cfg = await cfgRes.json().catch(() => ({}));
  if (!cfgRes.ok) {
    const hint =
      cfgRes.status === 401 ? "The key was rejected. Create a new key on the dashboard Keys page." :
      cfgRes.status === 403 ? "This key lacks the sdk:session scope. Use the \"Website widget (server)\" key preset." : undefined;
    return bad(cfgRes.status, cfg.code ?? "API_ERROR", cfg.detail ?? "Config check failed", hint);
  }
  if (cfg.application?.id !== appId) {
    return bad(422, "APP_MISMATCH", `This key belongs to ${cfg.application?.id}, not ${appId}`, "Copy the App ID from the same application as the key.");
  }

  // Mint a throwaway session: proves the key works AND that this site's origin is allowed.
  const ses = await fetch(`${apiUrl}/v1/sdk/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ end_user: { id: "setup_check", role: "viewer" }, origin }),
  });
  if (!ses.ok) {
    const e = await ses.json().catch(() => ({}));
    const hint = e.code === "ORIGIN_NOT_ALLOWED" ? `Add ${origin} to the application's Allowed origins in the dashboard, then retry.` : undefined;
    return bad(ses.status, e.code ?? "SESSION_FAILED", e.detail ?? "Session mint failed", hint);
  }

  await saveConfig({ apiUrl, appId, apiKey, toolSecret, appName: String(cfg.application?.name ?? appId) });
  return NextResponse.json({
    ok: true,
    ...(await publicConfig()),
    capabilities: cfg.capabilities,
    ai: cfg.ai,
    toolsHint: toolSecret ? null : "No tool secret: answers and guides work, actions (create project, invite) will be refused by the tool route.",
    toolUrl: `${origin}/api/vistra/tools`,
  });
}
