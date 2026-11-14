import { originPattern } from "./shared";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (ids: string[]) => ["enable", "explain", "open", "disable"].forEach((id) => ($(id).hidden = !ids.includes(id)));
const msg = (t: string) => ($("msg").textContent = t);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    $("site").textContent = "This page";
    msg("VISTRA runs on regular http(s) pages only.");
    return show([]);
  }
  const origin = new URL(tab.url).origin;
  $("site").textContent = new URL(tab.url).host;
  const st = await chrome.runtime.sendMessage({ type: "status", origin });
  if (!st.configured) {
    msg("Paste your app ID and API key in Settings first.");
    return show([]);
  }
  if (st.sensitive) {
    msg("Turned off here: VISTRA never runs on mail, banking or password-manager sites.");
    return show([]);
  }
  if (!st.enabled) {
    msg("Not enabled on this site. Enabling lets VISTRA read this site's pages while you use them.");
    show(["enable"]);
  } else {
    msg("Active on this site. Explain this page includes a screenshot of what you see.");
    show(["explain", "open", "disable"]);
  }

  $("enable").onclick = async () => {
    // must run in the click handler: permission prompts need a user gesture
    const ok = await chrome.permissions.request({ origins: [originPattern(origin)] });
    if (!ok) return msg("Permission was not granted.");
    const r = await chrome.runtime.sendMessage({ type: "enable", origin, tabId: tab.id });
    if (!r.ok) return msg(r.error);
    msg("Enabled. The assistant is in the corner of the page.");
    show(["explain", "open", "disable"]);
  };
  const toTab = async (type: string) => {
    try {
      await chrome.tabs.sendMessage(tab.id!, { type });
    } catch {
      await chrome.runtime.sendMessage({ type: "inject", origin, tabId: tab.id });
      await new Promise((r) => setTimeout(r, 300));
      await chrome.tabs.sendMessage(tab.id!, { type });
    }
    window.close();
  };
  $("open").onclick = () => void toTab("open");
  $("explain").onclick = () => void toTab("explain");
  $("disable").onclick = async () => {
    await chrome.runtime.sendMessage({ type: "disable", origin });
    msg("Turned off. Reload the page to remove the assistant.");
    show(["enable"]);
  };
}

void init();
