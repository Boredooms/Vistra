import type { SessionInfo } from "@boredooms/vistra-sdk";

const KEY = "vistra.session_id";

export function storedSessionId(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Calls Acme's own server route; the API key never reaches the browser. */
export async function getSessionToken(prev?: SessionInfo, role?: string): Promise<SessionInfo & { api_url?: string }> {
  const res = await fetch("/api/vistra/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: prev?.session_id ?? storedSessionId(), role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "session mint failed");
  try {
    sessionStorage.setItem(KEY, data.session_id);
  } catch {
    /* private mode */
  }
  return data;
}
