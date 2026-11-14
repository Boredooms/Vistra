/** Types and helpers shared by the background worker, content script, popup and options page. */

export interface ExtConfig {
  apiUrl: string;
  appId: string;
  /** API key with only the sdk:session scope ("Browser extension" preset). Stays in chrome.storage.local. */
  apiKey: string;
  /** End-user role used for policy decisions. Default viewer: actions need an admin role. */
  role: "viewer" | "admin";
}

export const DEFAULT_CONFIG: ExtConfig = { apiUrl: "http://localhost:8000", appId: "", apiKey: "", role: "viewer" };

export async function getConfig(): Promise<ExtConfig> {
  const { config } = await chrome.storage.local.get("config");
  return { ...DEFAULT_CONFIG, ...(config ?? {}) };
}

/** Sites whose pages are personal or financial by nature. The extension refuses to run there. */
const SENSITIVE = [
  "mail.google.com", "accounts.google.com", "outlook.live.com", "outlook.office.com", "login.microsoftonline.com",
  "paypal.com", "stripe.com", "chase.com", "bankofamerica.com", "wellsfargo.com", "icloud.com", "1password.com",
  "lastpass.com", "bitwarden.com", "web.whatsapp.com", "messenger.com", "chrome.google.com", "chromewebstore.google.com",
];

export function isSensitive(host: string): boolean {
  const h = host.toLowerCase();
  return SENSITIVE.some((s) => h === s || h.endsWith(`.${s}`)) || /(^|\.)(bank|banking)[.-]|online-?banking/.test(h);
}

export function originPattern(origin: string): string {
  return `${origin.replace(/\/$/, "")}/*`;
}

export function scriptId(origin: string): string {
  return `vistra_${origin.replace(/[^a-z0-9]/gi, "_")}`;
}

/** Messages over the "vistra" port (content <-> background). */
export type PortIn =
  | { id: number; kind: "request"; path: string; method?: string; body?: unknown }
  | { id: number; kind: "stream"; path: string; body: unknown }
  | { id: number; kind: "capture" }
  | { id: number; kind: "cancel" };

export type PortOut =
  | { id: number; kind: "result"; data: unknown }
  | { id: number; kind: "event"; event: string; data: unknown }
  | { id: number; kind: "end" }
  | { id: number; kind: "error"; status: number; code: string; detail: string };
