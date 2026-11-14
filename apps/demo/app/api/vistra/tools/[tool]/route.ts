import { NextResponse } from "next/server";
import { db, listMembers, listProjects } from "@/lib/db";
import { getConfig } from "@/lib/settings";
import { MAX_SKEW_MS, safeEqualHex, sign } from "@/lib/sign";

export const dynamic = "force-dynamic";

interface ToolBody {
  tool: string;
  args: Record<string, unknown>;
  run_id: string;
  ts: number;
  idempotency_key?: string;
}

const err = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

/**
 * Tool endpoint called by the VISTRA API. Every call carries an HMAC of {tool,args,run_id,ts}.
 * Rejected: bad signature, stale (> 60 s) or future timestamps, replays (signature already seen).
 */
export async function POST(req: Request, ctx: { params: Promise<{ tool: string }> }) {
  const { tool } = await ctx.params;
  const secret = (await getConfig())?.toolSecret;
  if (!secret) return err(500, "tool signing is not configured (paste the tool secret on /setup)");

  let body: ToolBody;
  try {
    body = (await req.json()) as ToolBody;
  } catch {
    return err(400, "invalid json");
  }
  const sig = req.headers.get("x-vistra-signature") ?? "";
  if (body.tool !== tool || typeof body.ts !== "number" || !body.run_id || typeof body.args !== "object" || body.args === null) {
    return err(400, "malformed tool call");
  }
  if (Math.abs(Date.now() - body.ts) > MAX_SKEW_MS) return err(401, "stale timestamp");
  if (!safeEqualHex(sig, sign(secret, body.tool, body.args, body.run_id, body.ts))) return err(401, "bad signature");

  // replay protection: the signature is single-use
  const nonce = await db().query(
    "insert into demo.tool_nonces (signature, run_id, tool) values ($1, $2, $3) on conflict do nothing returning signature",
    [sig, body.run_id, tool],
  );
  if (nonce.rowCount === 0) return err(409, "replayed call");

  try {
    switch (tool) {
      case "list_projects":
        return NextResponse.json({ ok: true, result: { projects: await listProjects() } });
      case "list_members":
        return NextResponse.json({ ok: true, result: { members: await listMembers() } });
      case "create_project": {
        const name = String(body.args.name ?? "").trim();
        if (!name || name.length > 80) return err(422, "name must be 1-80 characters");
        const r = await db().query(
          "insert into demo.projects (name, owner, created_by_run) values ($1, 'Dev Owner', $2) returning id, name",
          [name, body.run_id],
        );
        return NextResponse.json({ ok: true, result: r.rows[0] });
      }
      case "invite_member": {
        const name = String(body.args.name ?? "").trim();
        const email = String(body.args.email ?? "").trim().toLowerCase();
        const role = body.args.role === "admin" ? "admin" : "member";
        if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err(422, "name and valid email required");
        const r = await db().query(
          "insert into demo.team_members (name, email, role, status) values ($1, $2, $3, 'invited') on conflict do nothing returning id, name, email",
          [name, email, role],
        );
        if (r.rowCount === 0) return err(409, "that email is already on the team");
        return NextResponse.json({ ok: true, result: r.rows[0] });
      }
      default:
        return err(404, "unknown tool");
    }
  } catch (e) {
    console.error("tool failed", tool, e);
    return err(500, "tool failed");
  }
}
