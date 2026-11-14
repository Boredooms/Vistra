import Link from "next/link";
import { listMembers, listProjects } from "@/lib/db";
import { publicConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = { active: "badge-ok", overdue: "badge-danger", archived: "badge-neutral" };
const label = (s: string) => s[0]?.toUpperCase() + s.slice(1);

export default async function Dashboard() {
  const [projects, members, conn] = await Promise.all([listProjects(), listMembers(), publicConfig()]);
  const overdue = projects.filter((p) => p.status === "overdue");
  const active = projects.filter((p) => p.status === "active").length;
  const invited = members.filter((m) => m.status === "invited").length;

  return (
    <div>
      <h1 className="page-title">Good to see you, Dev</h1>
      <p className="page-sub">
        {overdue.length ? `${overdue.length} project${overdue.length > 1 ? "s are" : " is"} overdue.` : "Nothing is overdue."} {active} active, {members.length} people on the team.
      </p>

      {!conn.configured && (
        <section className="surface mt-6 flex flex-wrap items-center justify-between gap-4 border-[var(--accent)] bg-accent-soft px-5 py-4">
          <div>
            <h2 className="font-semibold">Connect the assistant</h2>
            <p className="mt-0.5 text-[13px] text-muted">Create an app and an API key in the VISTRA dashboard, then paste them here. It takes a minute.</p>
          </div>
          <Link href="/setup" className="btn btn-primary">Connect VISTRA</Link>
        </section>
      )}

      <dl className="surface mt-6 grid grid-cols-3 divide-x divide-[var(--line)]">
        {[
          ["Active projects", active, "/projects"],
          ["Overdue", overdue.length, "/projects"],
          ["Pending invites", invited, "/team"],
        ].map(([k, n, href]) => (
          <Link key={k as string} href={href as string} className="px-5 py-4 transition-colors hover:bg-[oklch(0.985_0.004_215)]">
            <dt className="text-[13px] text-muted">{k}</dt>
            <dd className={`mt-1 text-2xl font-semibold ${k === "Overdue" && Number(n) > 0 ? "text-danger" : ""}`}>{n}</dd>
          </Link>
        ))}
      </dl>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Recent projects</h2>
            <Link href="/projects" className="text-[13px] text-accent hover:underline">All projects</Link>
          </div>
          <ul className="surface mt-3 divide-y divide-[var(--line)]">
            {projects.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <Link href={`/projects/${p.id}`} className="truncate font-medium hover:text-accent">{p.name}</Link>
                <span className={`badge ${BADGE[p.status]}`}>{label(p.status)}</span>
              </li>
            ))}
            {projects.length === 0 && <li className="px-4 py-6 text-[13px] text-muted">No projects yet. Ask the assistant to create one.</li>}
          </ul>
        </section>
        <section>
          <h2 className="text-[15px] font-semibold">Try the assistant</h2>
          <ul className="mt-3 space-y-2 text-[13.5px]">
            {[
              ["Ask", "What's included in the Starter plan?", "Answers cite the Docs page."],
              ["Point", "Select the Overdue badge, then ask what it means", "Explains the element you pick."],
              ["Show", "Show me how to invite a teammate", "A ghost cursor walks you across pages."],
              ["Do", "Create a project called Q4 Launch", "Runs only after you approve, then verifies."],
            ].map(([k, q, d]) => (
              <li key={k} className="surface px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-12 text-xs font-semibold text-accent">{k}</span>
                  <span className="font-medium">{q}</span>
                </div>
                <p className="ml-14 mt-0.5 text-xs text-muted">{d}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
