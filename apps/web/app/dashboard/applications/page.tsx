"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge, Button, CopyButton, Dialog, ErrorNote, Field, Input, Skeleton, useToast } from "@/components/ui";
import { type Application, useVistra } from "@/lib/api";

function CreateApp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { call, refreshMe, setAppId } = useVistra();
  const toast = useToast();
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Dialog open={open} onClose={onClose} title="New application">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const a = await call<Application>("/v1/applications", { method: "POST", json: { name, origins: origin ? [origin] : [] } });
            await refreshMe();
            setAppId(a.id);
            toast(`Created ${a.name}`);
            setName("");
            setOrigin("");
            onClose();
          } catch (x) {
            setErr(x);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Name" htmlFor="an"><Input id="an" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Workspace" maxLength={80} /></Field>
        <Field label="Allowed origin" htmlFor="ao" hint="Where the widget will run, e.g. https://app.acme.com. You can add more later.">
          <Input id="ao" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="https://app.acme.com" />
        </Field>
        {err ? <ErrorNote error={err} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button variant="solid" disabled={busy || !name.trim()}>{busy ? "Creating..." : "Create"}</Button></div>
      </form>
    </Dialog>
  );
}

function Editor({ app }: { app: Application }) {
  const { call, refreshMe } = useVistra();
  const toast = useToast();
  const [name, setName] = useState(app.name);
  const [toolUrl, setToolUrl] = useState(app.tool_base_url ?? "");
  const [origin, setOrigin] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setErr(null);
    try {
      await fn();
      await refreshMe();
      toast(ok);
    } catch (x) {
      setErr(x);
    }
  };
  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
      <section className="space-y-4">
        <h2 className="text-sm font-medium">General</h2>
        <Field label="Application ID"><div className="flex items-center gap-2"><code className="flex-1 truncate rounded-lg border border-line bg-raised px-3 py-2 font-mono text-[13px]">{app.id}</code><CopyButton value={app.id} /></div></Field>
        <Field label="Name" htmlFor="nm"><Input id="nm" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Tool base URL" htmlFor="tu" hint="VISTRA calls POST {url}/api/vistra/tools/{tool} with an HMAC signature. Leave empty to disable actions.">
          <Input id="tu" value={toolUrl} onChange={(e) => setToolUrl(e.target.value)} placeholder="https://app.acme.com" />
        </Field>
        <Button variant="solid" onClick={() => run(() => call(`/v1/applications/${app.id}`, { method: "PATCH", json: { name, tool_base_url: toolUrl || null } }), "Saved")}>Save changes</Button>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium">Allowed origins</h2>
        <p className="text-[13px] text-muted">The SDK can only start sessions from these origins. Anything else is rejected with ORIGIN_NOT_ALLOWED.</p>
        <ul className="divide-y divide-line border-y border-line">
          {app.domains.length === 0 && <li className="py-3 text-sm text-subtle">No origins yet. The widget cannot start a session.</li>}
          {app.domains.map((d) => (
            <li key={d} className="flex items-center justify-between py-2.5 font-mono text-[13px]">
              {d}
              <Button size="sm" variant="ghost" aria-label={`Remove ${d}`} onClick={() => run(() => call(`/v1/applications/${app.id}/domains?origin=${encodeURIComponent(d)}`, { method: "DELETE" }), "Origin removed")}><Trash2 size={14} /></Button>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          const o = origin.trim().replace(/\/+$/, "");
          if (o) run(async () => { await call(`/v1/applications/${app.id}/domains`, { method: "POST", json: { origin: o } }); setOrigin(""); }, "Origin added");
        }}>
          <Input aria-label="Add origin" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="https://staging.acme.com or chrome-extension://<id>" />
          <Button variant="outline"><Plus size={14} />Add</Button>
        </form>
        {err ? <ErrorNote error={err} /> : null}

        <h2 className="pt-4 text-sm font-medium">Tool signing secret</h2>
        <p className="text-[13px] text-muted">Your tool endpoints verify an HMAC-SHA256 of {"{tool, args, run_id, ts}"} with this secret. It is shown once and stored encrypted.</p>
        <div className="flex items-center gap-3">
          <Badge tone={app.has_tool_secret ? "ok" : "neutral"}>{app.has_tool_secret ? "Configured" : "Platform default"}</Badge>
          <Button size="sm" onClick={() => run(async () => { const r = await call<{ tool_secret: string }>(`/v1/applications/${app.id}/tool-secret`, { method: "POST" }); setSecret(r.tool_secret); }, "Secret generated")}>{app.has_tool_secret ? "Rotate" : "Generate"}</Button>
        </div>
        {secret && (
          <div className="rounded-lg border border-line-strong p-3">
            <p className="mb-2 text-xs text-warn">Copy it now. You will not see it again.</p>
            <div className="flex items-center gap-2"><code className="flex-1 break-all font-mono text-[12px]">{secret}</code><CopyButton value={secret} /></div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function Applications() {
  const { me, app, loading } = useVistra();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Applications" sub="Each application is one product you embed VISTRA into: its own origins, keys, knowledge and tools." actions={<Button variant="solid" data-vistra-target="applications.new" onClick={() => setOpen(true)}><Plus size={16} />New application</Button>} />
      {loading || !app ? <Skeleton className="h-72" /> : <Editor key={app.id + app.name + (app.tool_base_url ?? "") + app.domains.join()} app={app} />}
      <p className="mt-10 text-xs text-subtle">{me?.applications.length ?? 0} application(s) in this organization. Use the switcher in the sidebar to change the active one.</p>
      <CreateApp open={open} onClose={() => setOpen(false)} />
    </>
  );
}
