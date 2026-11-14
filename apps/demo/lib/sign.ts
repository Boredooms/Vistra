import { createHmac, timingSafeEqual } from "node:crypto";

/** Canonical JSON: keys sorted recursively, no whitespace. Must match the API's `canonical()`. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function sign(secret: string, tool: string, args: unknown, runId: string, ts: number): string {
  return createHmac("sha256", secret).update(canonical({ tool, args, run_id: runId, ts })).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

export const MAX_SKEW_MS = 60_000;
