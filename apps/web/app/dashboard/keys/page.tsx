"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge, Button, CopyButton, Dialog, Empty, ErrorNote, Field, Input, Select, Skeleton, timeAgo, useToast } from "@/components/ui";
import { useGet, useVistra } from "@/lib/api";

interface Key { id: string; name: string; key_prefix: string; scopes: string[]; revoked_at: string | null; last_used_at: string | null; created_at: string }

const PRESETS: Record<string, { label: string; scopes: string[]; hint: string }> = {
  server: { label: "Website widget (server)", scopes: ["sdk:session"], hint: "Mints SDK sessions for your users. Keep it on your server (e.g. the demo's /setup page)." },
  extension: { label: "Browser extension", scopes: ["sdk:session"], hint: "Paste into the VISTRA extension options. Stored in the browser profile: revoke it here if the device is lost. Allow the extension origin (chrome-extension://<id>) on the app." },
  knowledge: { label: "Knowledge ingestion", scopes: ["knowledge:read", "knowledge:write"], hint: "Index and search documents from CI or scripts." },
  read: { label: "Read-only", scopes: ["knowledge:read"], hint: "Search and read runs." },
  admin: { label: "Full access", scopes: ["*"], hint: "Everything, including creating keys. Use sparingly." },
};

export default function Keys() {
  const { app, call } = useVistra();
  const toast = useToast();
  const keys = useGet<Key[]>(app ? `/v1/applications/${app.id}/keys` : null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("server");
  const [created, setCreated] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <PageHeader title="API keys" sub="Secret keys authenticate your server to VISTRA. They never go in browser code." actions={<Button variant="solid" data-vistra-target="keys.create" onClick={() => { setCreated(null); setOpen(true); }}><Plus size={16} />Create key</Button>} />
      {keys.error ? <ErrorNote error={keys.error} /> : null}
      {keys.isLoading ? <Skeleton className="h-48" /> : keys.data?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[13px] text-subtle"><tr className="border-b border-line"><th className="py-2 font-medium">Name</th><th className="font-medium">Key</th><th className="font-medium">Scopes</th><th className="font-medium">Last used</th><th /></tr></thead>
            <tbody className="divide-y divide-line">
              {keys.data.map((k) => (
                <tr key={k.id} className={k.revoked_at ? "opacity-50" : ""}>
                  <td className="py-3 font-medium">{k.name}</td>
                  <td className="font-mono text-[12px] text-muted">{k.key_prefix}...</td>
                  <td className="space-x-1">{k.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</td>
                  <td className="text-muted">{k.revoked_at ? <Badge tone="bad">revoked</Badge> : timeAgo(k.last_used_at)}</td>
                  <td className="text-right">{!k.revoked_at && <Button size="sm" variant="danger" onClick={async () => { if (!confirm(`Revoke ${k.name}? Requests using it will fail immediately.`)) return; try { await call(`/v1/applications/${app?.id}/keys/${k.id}`, { method: "DELETE" }); await keys.mutate(); toast("Key revoked"); } catch (x) { toast(String(x), "bad"); } }}>Revoke</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="No API keys" body="Create a server key so your backend can start SDK sessions for signed-in users." action={<Button variant="solid" onClick={() => setOpen(true)}>Create key</Button>} />}

      <Dialog open={open} onClose={() => setOpen(false)} title={created ? "Copy your key" : "Create API key"}>
        {created ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">This is the only time the full key is shown. Store it in your server environment as <code className="font-mono text-ink">VISTRA_API_KEY</code>.</p>
            <div className="rounded-lg border border-line-strong p-3"><code aria-label="API key value" className="block break-all font-mono text-[12.5px]">{created}</code></div>
            <div className="flex justify-between"><CopyButton value={created} label="Copy key" /><Button variant="solid" onClick={() => setOpen(false)}>Done</Button></div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            if (!app) return;
            setBusy(true); setErr(null);
            try {
              const r = await call<{ key: string }>(`/v1/applications/${app.id}/keys`, { method: "POST", json: { name, scopes: PRESETS[preset]?.scopes } });
              setCreated(r.key); setName(""); await keys.mutate();
            } catch (x) { setErr(x); } finally { setBusy(false); }
          }}>
            <Field label="Name" htmlFor="kn"><Input id="kn" required value={name} onChange={(e) => setName(e.target.value)} placeholder="production server" /></Field>
            <Field label="Permissions" htmlFor="kp" hint={PRESETS[preset]?.hint}>
              <Select id="kp" value={preset} onChange={(e) => setPreset(e.target.value)}>{Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
            </Field>
            {err ? <ErrorNote error={err} /> : null}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="solid" disabled={busy || !name.trim() || !app}>{busy ? "Creating..." : "Create key"}</Button></div>
          </form>
        )}
      </Dialog>
    </>
  );
}
