import Link from "next/link";
import { NewProject } from "@/components/NewProject";
import { listProjects } from "@/lib/db";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = { active: "badge-ok", overdue: "badge-danger", archived: "badge-neutral" };
const label = (s: string) => (s === "overdue" ? "Overdue" : s[0]?.toUpperCase() + s.slice(1));

export default async function Projects() {
  const projects = await listProjects();
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-sub">{projects.length} projects in the Acme workspace.</p>
        </div>
        <NewProject />
      </div>
      <div className="surface mt-6 overflow-hidden">
        <table className="tbl" data-vistra-target="projects.table">
          <caption className="sr-only">Projects</caption>
          <thead>
            <tr>
              <th>Name</th>
              <th>Owner</th>
              <th>Created</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} data-project-id={p.id}>
                <td>
                  <Link href={`/projects/${p.id}`} className="font-medium hover:text-accent">{p.name}</Link>
                </td>
                <td className="text-muted">{p.owner}</td>
                <td className="text-muted">{new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                <td>
                  <span role="status" aria-label={`Status: ${label(p.status)}`} data-vistra-target={`projects.row.${p.id}.status`} className={`badge ${BADGE[p.status]}`}>
                    {label(p.status)}
                  </span>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr><td colSpan={4} className="py-8 text-center text-muted">No projects yet. Create one, or ask the assistant to.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
