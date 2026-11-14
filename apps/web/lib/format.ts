export function statusTone(s: string): "neutral" | "ok" | "warn" | "bad" {
  if (["completed", "succeeded", "verified", "active"].includes(s)) return "ok";
  if (["failed", "verification_failed", "denied", "cancelled"].includes(s)) return "bad";
  if (["running", "queued", "awaiting_approval", "pending", "executing"].includes(s)) return "warn";
  return "neutral";
}

export const ms = (n: number | null | undefined) => (n == null ? "-" : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);
