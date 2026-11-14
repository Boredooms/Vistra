import { getConfig, originPattern, type ExtConfig } from "./shared";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const out = (t: string, ok = false) => { const o = $("out"); o.textContent = t; o.className = `msg ${ok ? "ok" : "bad"}`; };

async function init() {
  const c = await getConfig();
  $<HTMLInputElement>("apiUrl").value = c.apiUrl;
  $<HTMLInputElement>("appId").value = c.appId;
  $<HTMLInputElement>("apiKey").placeholder = c.apiKey ? `${c.apiKey.slice(0, 8)}... (saved)` : "vsk_...";
  $<HTMLSelectElement>("role").value = c.role;
  $("extOrigin").textContent = location.origin;

  $("shots").onclick = async () => {
    const ok = await chrome.permissions.request({ origins: ["<all_urls>"] });
    out(ok ? "Screenshots allowed without opening the popup first." : "Not granted. Explain this page from the popup still includes a screenshot.", ok);
  };

  $<HTMLFormElement>("f").onsubmit = async (e) => {
    e.preventDefault();
    const prev = await getConfig();
    const next: ExtConfig = {
      apiUrl: $<HTMLInputElement>("apiUrl").value.trim().replace(/\/+$/, ""),
      appId: $<HTMLInputElement>("appId").value.trim(),
      apiKey: $<HTMLInputElement>("apiKey").value.trim() || prev.apiKey,
      role: $<HTMLSelectElement>("role").value as ExtConfig["role"],
    };
    if (!/^https?:\/\//.test(next.apiUrl)) return out("API URL must start with http:// or https://");
    if (!next.apiKey) return out("Paste an API key.");
    // reaching a non-default API needs host permission (the request happens in this click)
    const granted = await chrome.permissions.request({ origins: [originPattern(new URL(next.apiUrl).origin)] }).catch(() => false);
    if (!granted) return out(`Permission to reach ${next.apiUrl} was not granted.`);
    out("Testing...", true);
    try {
      const h = { Authorization: `Bearer ${next.apiKey}`, "Content-Type": "application/json" };
      const cfg = await fetch(`${next.apiUrl}/v1/sdk/config`, { headers: h });
      const cb = await cfg.json().catch(() => ({}));
      if (!cfg.ok) return out(`${cb.detail ?? "Key rejected"} (${cb.code ?? cfg.status})`);
      if (cb.application?.id !== next.appId) return out(`This key belongs to ${cb.application?.id}, not ${next.appId}.`);
      const ses = await fetch(`${next.apiUrl}/v1/sdk/sessions`, {
        method: "POST", headers: h, body: JSON.stringify({ end_user: { id: "ext_setup_check", role: "viewer" }, origin: location.origin }),
      });
      const sb = await ses.json().catch(() => ({}));
      if (!ses.ok) {
        return out(sb.code === "ORIGIN_NOT_ALLOWED" ? `Add ${location.origin} to ${next.appId}'s allowed origins in the dashboard, then save again.` : `${sb.detail ?? "Session failed"} (${sb.code})`);
      }
      await chrome.storage.local.set({ config: next });
      $<HTMLInputElement>("apiKey").value = "";
      out(`Connected to ${cb.application.name}. ${cb.capabilities?.screenshot_vision ? "Screenshot understanding is available." : "Text-only page understanding (no vision model configured)."}`, true);
    } catch (err) {
      out(`Cannot reach ${next.apiUrl}: ${err instanceof Error ? err.message : err}`);
    }
  };
}

void init();
