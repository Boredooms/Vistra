import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { name?: string; email?: string };
  const name = (b.name ?? "").trim();
  const email = (b.email ?? "").trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Name and a valid email are required" }, { status: 422 });
  }
  const r = await db().query(
    "insert into demo.team_members (name, email, status) values ($1, $2, 'invited') on conflict do nothing returning id, name, email",
    [name, email],
  );
  if (r.rowCount === 0) return NextResponse.json({ error: "That email is already on the team" }, { status: 409 });
  return NextResponse.json(r.rows[0], { status: 201 });
}
