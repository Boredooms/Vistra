// Server-only module (imports pg). Never import from a client component.
import { db } from "@/lib/db";

/**
 * Acme's VISTRA connection. Pasted on /setup (stored server-side in demo.settings) or taken from env.
 * The API key and tool secret are only ever read on the server; the browser sees a masked hint.
 */
export interface VistraConfig {
  apiUrl: string;
  appId: string;
  apiKey: string;
  toolSecret: string | null;
  source: "setup" | "env";
}

// One row per deployment (local dev and the Vercel demo share the demo database).
const ROW = process.env.DEMO_INSTANCE ?? "vistra";

let ensured = false;
async function ensureTable(): Promise<void> {
  if (ensured) return;
  await db().query(
    "create table if not exists demo.settings (id text primary key, api_url text not null, app_id text not null, " +
      "api_key text not null, tool_secret text, app_name text, updated_at timestamptz not null default now())",
  );
  ensured = true;
}

export async function getConfig(): Promise<VistraConfig | null> {
  await ensureTable();
  const r = await db().query("select api_url, app_id, api_key, tool_secret from demo.settings where id = $1", [ROW]);
  if (r.rows[0]) {
    const s = r.rows[0];
    return { apiUrl: s.api_url, appId: s.app_id, apiKey: s.api_key, toolSecret: s.tool_secret, source: "setup" };
  }
  const apiUrl = process.env.VISTRA_API_URL;
  const apiKey = process.env.VISTRA_API_KEY;
  if (!apiUrl || !apiKey) return null;
  return {
    apiUrl,
    appId: process.env.NEXT_PUBLIC_VISTRA_APP_ID ?? "app_demo",
    apiKey,
    toolSecret: process.env.TOOL_SIGNING_SECRET ?? null,
    source: "env",
  };
}

export async function saveConfig(c: { apiUrl: string; appId: string; apiKey: string; toolSecret: string | null; appName: string }) {
  await ensureTable();
  await db().query(
    "insert into demo.settings (id, api_url, app_id, api_key, tool_secret, app_name) values ($6, $1, $2, $3, $4, $5) " +
      "on conflict (id) do update set api_url = $1, app_id = $2, api_key = $3, tool_secret = $4, app_name = $5, updated_at = now()",
    [c.apiUrl, c.appId, c.apiKey, c.toolSecret, c.appName, ROW],
  );
}

export async function clearConfig(): Promise<void> {
  await ensureTable();
  await db().query("delete from demo.settings where id = $1", [ROW]);
}

export async function publicConfig() {
  const c = await getConfig();
  let appName: string | null = null;
  if (c?.source === "setup") {
    const r = await db().query("select app_name from demo.settings where id = $1", [ROW]);
    appName = r.rows[0]?.app_name ?? null;
  }
  return c
    ? {
        configured: true,
        source: c.source,
        apiUrl: c.apiUrl,
        appId: c.appId,
        appName,
        keyHint: `${c.apiKey.slice(0, 7)}...${c.apiKey.slice(-4)}`,
        hasToolSecret: !!c.toolSecret,
      }
    : { configured: false as const };
}
