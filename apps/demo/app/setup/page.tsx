"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveFeed } from "@/components/LiveFeed";

type Pub = { configured: boolean; source?: "setup" | "env"; apiUrl?: string; appId?: string; appName?: string | null; keyHint?: string; hasToolSecret?: boolean };
type Result = { ok: boolean; code?: string; detail?: string; hint?: string; capabilities?: Record<string, boolean>; ai?: { mode: string; simulated: boolean }; toolsHint?: string | null };

const DASH = process.env.NEXT_PUBLIC_VISTRA_DASHBOARD_URL ?? "http://localhost:3000/dashboard";

export default function Setup() {
  const [pub, setPub] = useState<Pub | null>(null);
  const [apiUrl, setApiUrl] = useState("http://localhost:8000");
  const [appId, setAppId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [toolSecret, setToolSecret] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const origin = typeof window === "undefined" ? "http://localhost:3001" : location.origin;

  const load = () => fetch("/api/setup", { cache: "no-store" }).then((r) => r.json()).then((p: Pub) => {
    setPub(p);
    if (p.apiUrl) setApiUrl(p.apiUrl);
    if (p.appId) setAppId(p.appId);
  });
  useEffect(() => { void load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiUrl, appId, apiKey, toolSecret }) });
      const body = (await r.json()) as Result;
      setRes(body);
      if (body.ok) {
        setApiKey("");
        setToolSecret("");
        await load();
        window.dispatchEvent(new Event("vistra:config-changed"));
      }
    } catch {
      setRes({ ok: false, code: "NETWORK", detail: "The setup request did not complete." });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/setup", { method: "DELETE" });
    setRes(null);
    await load();
    window.dispatchEvent(new Event("vistra:config-changed"));
    setBusy(false);
  }

  return (
    <div>
      <h1 className="page-title">Connect VISTRA</h1>
      <p className="page-sub">Acme talks to VISTRA with an application ID and an API key. The key stays on Acme&apos;s server: the browser only ever receives short-lived session tokens.</p>

      {pub?.configured && (
        <section className="surface mt-6 flex flex-wrap items-center justify-between gap-4 px-5 py-4" aria-label="Current connection">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-ok" />
            <div>
              <div className="font-medium">Connected to {pub.appName ?? pub.appId}</div>
              <div className="text-xs text-muted">
                {pub.appId} · key {pub.keyHint} · {pub.hasToolSecret ? "tool calls signed" : "no tool secret"} · {pub.source === "env" ? "from .env (paste below to override)" : "saved on this server"}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {pub.source === "setup" && <button onClick={disconnect} disabled={busy} className="btn btn-ghost">Disconnect</button>}
            <Link href="/dashboard" className="btn btn-primary">Open workspace</Link>
          </div>
        </section>
      )}

      <LiveFeed />

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1.15fr]">
        <ol className="space-y-6 text-[13.5px]">
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">1</span>
            <div>
              <div className="font-medium">Create an application</div>
              <p className="mt-0.5 text-muted">In the <a href={`${DASH}/applications`} target="_blank" rel="noreferrer" className="text-accent hover:underline">VISTRA dashboard</a>, add an app and allow this origin:</p>
              <code className="mt-1.5 inline-block rounded-md bg-panel px-2 py-1 text-xs">{origin}</code>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">2</span>
            <div>
              <div className="font-medium">Create an API key</div>
              <p className="mt-0.5 text-muted">Keys page, preset <b className="font-medium text-ink">Website widget (server)</b> (scope <code>sdk:session</code>). The key is shown once; paste it here.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-panel text-xs font-semibold text-muted">3</span>
            <div>
              <div className="font-medium">Optional: let the assistant act</div>
              <p className="mt-0.5 text-muted">Set the app&apos;s tool URL to the address below and rotate a tool secret. Without it, answers and guides work and actions are refused.</p>
              <code className="mt-1.5 inline-block rounded-md bg-panel px-2 py-1 text-xs">{origin}/api/vistra/tools</code>
            </div>
          </li>
        </ol>

        <form onSubmit={submit} className="surface p-6" aria-label="VISTRA connection">
          <label htmlFor="api-url" className="field">API URL</label>
          <input id="api-url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} className="input" inputMode="url" required />
          <label htmlFor="app-id" className="field mt-4">App ID</label>
          <input id="app-id" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="app_..." className="input font-mono" required />
          <label htmlFor="api-key" className="field mt-4">API key</label>
          <div className="relative">
            <input id="api-key" type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={pub?.keyHint ?? "vk_..."} autoComplete="off" className="input pr-16 font-mono" required />
            <button type="button" onClick={() => setShowKey((s) => !s)} className="btn btn-ghost btn-sm absolute right-1 top-[calc(50%+3px)] -translate-y-1/2">{showKey ? "Hide" : "Show"}</button>
          </div>
          <label htmlFor="tool-secret" className="field mt-4">Tool secret <span className="font-normal text-muted">(optional)</span></label>
          <input id="tool-secret" type="password" value={toolSecret} onChange={(e) => setToolSecret(e.target.value)} placeholder="vts_..." autoComplete="off" className="input font-mono" />
          <p className="hint">We check the key, the app and this origin against the live API before saving anything.</p>

          {res && !res.ok && (
            <div role="alert" className="mt-4 rounded-lg bg-[var(--danger-soft)] px-3 py-2.5 text-[13px] text-danger">
              <div className="font-medium">{res.detail}</div>
              {res.hint && <div className="mt-0.5">{res.hint}</div>}
            </div>
          )}
          {res?.ok && (
            <div role="status" className="mt-4 rounded-lg bg-[var(--ok-soft)] px-3 py-2.5 text-[13px] text-ok">
              <div className="font-medium">Connected. The assistant is live on every page.</div>
              <div className="mt-0.5">
                Model: {res.ai?.simulated ? "simulated" : res.ai?.mode}
                {res.capabilities?.screenshot_vision ? " · screenshot understanding available" : ""}
              </div>
              {res.toolsHint && <div className="mt-0.5 text-warn">{res.toolsHint}</div>}
            </div>
          )}
          <div className="mt-5 flex justify-end">
            <button className="btn btn-primary" disabled={busy}>{busy ? "Checking..." : "Verify and save"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
