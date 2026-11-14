import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = { active: "badge-ok", overdue: "badge-danger", archived: "badge-neutral" };

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await db().query("select id, name, status, owner, created_at, created_by_run from demo.projects where id = $1", [id]);
  const p = r.rows[0];
  if (!p) notFound();
  return (
    <div>
      <Link href="/projects" className="text-[13px] text-muted hover:text-ink">Back to projects</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title">{p.name}</h1>
        <span className={`badge ${BADGE[p.status]}`}>{p.status[0].toUpperCase() + p.status.slice(1)}</span>
      </div>
      <dl className="surface mt-6 grid max-w-xl grid-cols-[140px_1fr] gap-y-3 p-5 text-[13.5px]">
        <dt className="text-muted">Owner</dt>
        <dd>{p.owner}</dd>
        <dt className="text-muted">Created</dt>
        <dd>{new Date(p.created_at).toLocaleString()}</dd>
        <dt className="text-muted">Created by</dt>
        <dd>{p.created_by_run ? <Link href={`/runs/${p.created_by_run}`} className="text-accent hover:underline">VISTRA run {String(p.created_by_run).slice(0, 8)}</Link> : "A person"}</dd>
        <dt className="text-muted">ID</dt>
        <dd className="font-mono text-xs">{p.id}</dd>
      </dl>
    </div>
  );
}
