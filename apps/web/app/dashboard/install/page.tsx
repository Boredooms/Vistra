"use client";

import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { CopyButton, Skeleton } from "@/components/ui";
import { API_URL, useGet, useVistra } from "@/lib/api";

const Snippet = ({ title, code }: { title: string; code: string }) => (
  <div>
    <div className="mb-2 flex items-center justify-between"><h3 className="font-mono text-[13px] text-muted">{title}</h3><CopyButton value={code} /></div>
    <pre className="code overflow-x-auto p-4">{code}</pre>
  </div>
);

export default function Install() {
  const { app } = useVistra();
  const keys = useGet<Array<{ revoked_at: string | null }>>(app ? `/v1/applications/${app.id}/keys` : null);
  const src = useGet<unknown[]>(app?.collection_id ? `/v1/collections/${app.collection_id}/sources` : null);
  if (!app) return <Skeleton className="h-96" />;

  const checks = [
    ["Allowed origin added", app.domains.length > 0, "/dashboard/applications"],
    ["Server API key created", (keys.data ?? []).some((k) => !k.revoked_at), "/dashboard/keys"],
    ["Knowledge source indexed", (src.data?.length ?? 0) > 0, "/dashboard/knowledge"],
    ["Tool endpoint configured (optional, for actions)", !!app.tool_base_url, "/dashboard/applications"],
  ] as const;

  const server = `// app/api/vistra/session/route.ts  (server only: the API key never reaches the browser)
export async function POST(req: Request) {
  const { session_id } = await req.json().catch(() => ({}));
  const headers = {
    Authorization: \`Bearer \${process.env.VISTRA_API_KEY}\`,
    "Content-Type": "application/json",
    Origin: req.headers.get("origin") ?? "",
  };
  const base = process.env.VISTRA_API_URL!; // ${API_URL}
  let res = session_id && await fetch(\`\${base}/v1/sdk/sessions/\${session_id}/refresh\`, { method: "POST", headers });
  if (!res || !res.ok) {
    res = await fetch(\`\${base}/v1/sdk/sessions\`, {
      method: "POST", headers,
      body: JSON.stringify({ end_user: { id: currentUser.id, role: currentUser.role } }),
    });
  }
  const { token, session_id: id, token_ttl } = await res.json();
  return Response.json({ token, session_id: id, token_ttl });
}`;
  const client = `import { Vistra } from "@boredooms/vistra-sdk";

const vistra = Vistra.init({
  appId: "${app.id}",
  apiUrl: "${API_URL}",
  getSessionToken: (prev) =>
    fetch("/api/vistra/session", { method: "POST", body: JSON.stringify({ session_id: prev?.session_id }) }).then((r) => r.json()),
  // controls VISTRA may point at, including ones on other routes
  targets: [{ id: "nav.team", role: "link", name: "Team", route: "*" }],
});

vistra.on("token", (e) => render(e.text));
await vistra.ask("What does the Starter plan include?");`;
  const mark = `<a href="/team" data-vistra-target="nav.team">Team</a>
<button data-vistra-target="team.invite">Invite member</button>
<input type="password" data-vistra-private />  <!-- never captured -->`;
  const tool = `// POST {tool_base_url}/api/vistra/tools/{tool}
// Verify X-Vistra-Signature = HMAC-SHA256(secret, canonicalJSON({tool, args, run_id, ts}))
// Reject if |now - ts| > 60s or the signature was seen before (replay).`;

  return (
    <>
      <PageHeader title="Install" sub={`Add VISTRA to ${app.name} in four steps.`} />
      <ul className="mb-10 grid gap-x-10 gap-y-2 sm:grid-cols-2">
        {checks.map(([label, ok, href]) => (
          <li key={label}>
            <Link href={href} className="flex items-center gap-2.5 py-1.5 text-sm hover:text-ink">
              {ok ? <Check size={16} className="text-ok" /> : <Circle size={16} className="text-subtle" />}
              <span className={ok ? "text-muted line-through decoration-line-strong" : ""}>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="space-y-8">
        <div><h2 className="mb-1 font-medium">1. Install</h2><Snippet title="terminal" code="npm install @boredooms/vistra-sdk" /></div>
        <div><h2 className="mb-1 font-medium">2. Mint sessions on your server</h2><Snippet title="session route" code={server} /></div>
        <div><h2 className="mb-1 font-medium">3. Start the SDK in the browser</h2><Snippet title="client" code={client} /></div>
        <div><h2 className="mb-1 font-medium">4. Mark the controls guides can point at</h2><Snippet title="markup" code={mark} /></div>
        <div><h2 className="mb-1 font-medium">Optional: let it act</h2><Snippet title="tool endpoint contract" code={tool} /></div>
      </div>
    </>
  );
}
