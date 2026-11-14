import { InviteMember } from "@/components/InviteMember";
import { listMembers } from "@/lib/db";

export const dynamic = "force-dynamic";

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default async function Team() {
  const members = await listMembers();
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-sub">The Starter plan includes up to 5 members. {members.length} seats used.</p>
        </div>
        <InviteMember />
      </div>
      <div className="surface mt-6 overflow-hidden">
        <table className="tbl">
          <caption className="sr-only">Team members</caption>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-panel text-[11px] font-semibold text-muted">{initials(m.name)}</span>
                    <span className="font-medium">{m.name}</span>
                  </span>
                </td>
                <td className="text-muted">{m.email}</td>
                <td className="capitalize">{m.role}</td>
                <td><span className={`badge ${m.status === "invited" ? "badge-warn" : "badge-ok"}`}>{m.status === "invited" ? "Invited" : "Active"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
