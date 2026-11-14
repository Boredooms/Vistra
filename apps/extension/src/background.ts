/**
 * Service worker. Holds the API key, mints one SDK session per site origin, proxies SDK requests and SSE streams
 * for content scripts (page CORS does not apply here), captures the visible tab, and registers the content script
 * on origins the user enabled (optional host permissions, requested from the popup).
 */
import { HttpTransport } from "@vistra/sdk-core/src/transport";
import { VistraApiError, type SessionInfo } from "@vistra/sdk-core/src/types";
import { getConfig, isSensitive, originPattern, scriptId, type PortIn, type PortOut } from "./shared";

const transports = new Map<string, HttpTransport>();
const MAX_SHOT = 2 * 1024 * 1024;

async function mint(prev?: SessionInfo): Promise<SessionInfo> {
  const c = await getConfig();
  if (!c.apiKey || !c.appId) throw new VistraApiError(412, "NOT_CONFIGURED", "Open the VISTRA extension options and paste an app ID and API key.");
  const headers = { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" };
  const api = c.apiUrl.replace(/\/$/, "");
  let res: Response | null = null;
  try {
    if (prev) res = await fetch(`${api}/v1/sdk/sessions/${prev.session_id}/refresh`, { method: "POST", headers });
    if (!res || !res.ok) {
      res = await fetch(`${api}/v1/sdk/sessions`, {
        method: "POST",
        headers,
        // the API validates the extension's own origin (chrome-extension://<id>) against the app's allowed origins
        body: JSON.stringify({ end_user: { id: await installId(), role: c.role }, origin: location.origin }),
      });
    }
  } catch (e) {
    throw VistraApiError.network(`Cannot reach ${api}: ${e instanceof Error ? e.message : e}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = body.code === "ORIGIN_NOT_ALLOWED" ? ` Add ${location.origin} to the app's allowed origins in the VISTRA dashboard.` : "";
    throw new VistraApiError(res.status, body.code ?? "SESSION_FAILED", (body.detail ?? "Session mint failed") + hint);
  }
  return { token: body.token, session_id: body.session_id, token_ttl: body.token_ttl };
}

async function installId(): Promise<string> {
  const { installId: id } = await chrome.storage.local.get("installId");
  if (id) return id;
  const fresh = `ext_${crypto.randomUUID().slice(0, 12)}`;
  await chrome.storage.local.set({ installId: fresh });
  return fresh;
}

async function transportFor(siteOrigin: string): Promise<HttpTransport> {
  let t = transports.get(siteOrigin);
  if (!t) {
    const c = await getConfig();
    t = new HttpTransport(c.apiUrl, mint);
    transports.set(siteOrigin, t);
  }
  return t;
}

async function capture(windowId: number): Promise<string | null> {
  for (const quality of [65, 45, 30]) {
    try {
      const url = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality });
      if (url.length * 0.75 <= MAX_SHOT) return url;
    } catch {
      return null; // no activeTab grant / <all_urls>: the SDK falls back to DOM text and says so
    }
  }
  return null;
}

function errOut(id: number, e: unknown): PortOut {
  if (e instanceof VistraApiError) return { id, kind: "error", status: e.status, code: e.code, detail: e.message };
  return { id, kind: "error", status: 0, code: "EXTENSION_ERROR", detail: e instanceof Error ? e.message : String(e) };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "vistra") return;
  const tab = port.sender?.tab;
  const site = port.sender?.origin ?? (port.sender?.url ? new URL(port.sender.url).origin : "");
  if (!tab?.id || !site || isSensitive(new URL(site).hostname)) return port.disconnect();
  const cancelled = new Set<number>();
  const send = (m: PortOut) => { try { port.postMessage(m); } catch { /* tab closed */ } };

  port.onMessage.addListener(async (m: PortIn) => {
    if (m.kind === "cancel") return void cancelled.add(m.id);
    try {
      if (m.kind === "capture") return send({ id: m.id, kind: "result", data: await capture(tab.windowId) });
      const t = await transportFor(site);
      if (m.kind === "request") return send({ id: m.id, kind: "result", data: await t.request(m.path, { method: m.method, body: m.body }) });
      for await (const ev of t.stream(m.path, m.body)) {
        if (cancelled.has(m.id)) break;
        send({ id: m.id, kind: "event", event: ev.event, data: ev.data });
      }
      send({ id: m.id, kind: "end" });
    } catch (e) {
      send(errOut(m.id, e));
    }
  });
});

// ---- per-site enablement -------------------------------------------------------------------------
async function register(origin: string): Promise<void> {
  const id = scriptId(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (!existing.length) {
    await chrome.scripting.registerContentScripts([{ id, matches: [originPattern(origin)], js: ["content.js"], runAt: "document_idle", persistAcrossSessions: true }]);
  }
}

async function sync(): Promise<void> {
  const { enabled = [] } = (await chrome.storage.local.get("enabled")) as { enabled?: string[] };
  const granted = new Set((await chrome.permissions.getAll()).origins ?? []);
  const keep = enabled.filter((o) => granted.has(originPattern(o)) && !isSensitive(new URL(o).hostname));
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  const wanted = new Set(keep.map(scriptId));
  const stale = scripts.filter((s) => !wanted.has(s.id)).map((s) => s.id);
  if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale });
  for (const o of keep) await register(o);
  await chrome.storage.local.set({ enabled: keep });
}

chrome.runtime.onInstalled.addListener(() => void sync());
chrome.runtime.onStartup.addListener(() => void sync());
chrome.permissions.onRemoved.addListener(() => void sync());
chrome.storage.onChanged.addListener((ch) => {
  if (ch.config) { for (const t of transports.values()) t.close(); transports.clear(); } // new key/app: new sessions
});

type PopupMsg = { type: "enable" | "disable" | "status" | "inject"; origin: string; tabId?: number };

chrome.runtime.onMessage.addListener((msg: PopupMsg, _sender, reply) => {
  (async () => {
    const host = new URL(msg.origin).hostname;
    if (msg.type === "status") {
      const { enabled = [] } = (await chrome.storage.local.get("enabled")) as { enabled?: string[] };
      const granted = await chrome.permissions.contains({ origins: [originPattern(msg.origin)] });
      const c = await getConfig();
      return reply({ sensitive: isSensitive(host), enabled: enabled.includes(msg.origin) && granted, configured: !!(c.apiKey && c.appId) });
    }
    if (isSensitive(host)) return reply({ ok: false, error: "VISTRA does not run on sensitive sites (mail, banking, password managers)." });
    if (msg.type === "enable") {
      const { enabled = [] } = (await chrome.storage.local.get("enabled")) as { enabled?: string[] };
      await chrome.storage.local.set({ enabled: [...new Set([...enabled, msg.origin])] });
      await register(msg.origin);
    }
    if (msg.type === "disable") {
      const { enabled = [] } = (await chrome.storage.local.get("enabled")) as { enabled?: string[] };
      await chrome.storage.local.set({ enabled: enabled.filter((o) => o !== msg.origin) });
      await chrome.scripting.unregisterContentScripts({ ids: [scriptId(msg.origin)] }).catch(() => undefined);
      await chrome.permissions.remove({ origins: [originPattern(msg.origin)] }).catch(() => undefined);
      transports.get(msg.origin)?.close();
      transports.delete(msg.origin);
    }
    if ((msg.type === "enable" || msg.type === "inject") && msg.tabId) {
      await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: ["content.js"] });
    }
    reply({ ok: true });
  })().catch((e) => reply({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  return true;
});
