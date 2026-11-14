import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The app's own UI path for creating a project (independent from VISTRA's signed tool endpoint). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim();
  if (!name || name.length > 80) return NextResponse.json({ error: "name must be 1-80 characters" }, { status: 422 });
  const r = await db().query("insert into demo.projects (name, owner) values ($1, 'Dev Owner') returning id, name", [name]);
  return NextResponse.json(r.rows[0], { status: 201 });
}
