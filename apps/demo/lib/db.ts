import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __demoPool: Pool | undefined;
}

/** Acme's own database (schema `demo`). Server-only; never imported from a client component. */
export function db(): Pool {
  if (!globalThis.__demoPool) {
    const url = process.env.DEMO_DATABASE_URL;
    if (!url) throw new Error("DEMO_DATABASE_URL is not set");
    globalThis.__demoPool = new Pool({ connectionString: url, max: 3, ssl: { rejectUnauthorized: false } });
  }
  return globalThis.__demoPool;
}

export interface Project {
  id: string;
  name: string;
  status: "active" | "overdue" | "archived";
  owner: string;
  created_at: string;
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "invited";
}

export async function listProjects(): Promise<Project[]> {
  const r = await db().query(
    "select id, name, status, owner, created_at from demo.projects where workspace_id = 'acme' order by created_at desc",
  );
  return r.rows.map((p) => ({ ...p, created_at: new Date(p.created_at).toISOString() }));
}

export async function listMembers(): Promise<Member[]> {
  const r = await db().query(
    "select id, name, email, role, status from demo.team_members where workspace_id = 'acme' order by created_at",
  );
  return r.rows;
}
