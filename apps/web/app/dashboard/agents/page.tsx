"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Playground } from "@/components/dash/Playground";
import { Card, DetailHeader, DetailTag, Segmented, Toggle } from "@/components/dash/primitives";
import { Badge, Button, ErrorNote, Field, Select, Skeleton, Textarea, timeAgo, useToast } from "@/components/ui";
import { useGet, useVistra } from "@/lib/api";

type Policy = "default" | "allow" | "require_approval" | "deny";
interface Version {
  id: string; version: number; instructions: string; notes: string | null; created_at: string; published_at: string | null; runs: number;
  capabilities: { answer: boolean; explain_element: boolean; guide: boolean; actions: boolean };
  model_config: { planner: "fast" | "default"; answer: "fast" | "default" };
  retrieval_config: { top_k: number; strictness: "strict" | "balanced" | "lenient" };
  guide_config: { max_steps: number };
  tool_config: Record<string, { enabled: boolean; policy: Policy }>;
}
interface Agent { id: string; name: string; status: string; description: string | null; current_version_id: string | null; versions: Version[]; tools: Array<{ name: string; side_effect: boolean; policy: string; description: string }> }
type Draft = Omit<Version, "id" | "version" | "created_at" | "published_at" | "runs">;

const CAPS: Array<[keyof Draft["capabilities"], string, string]> = [
  ["answer", "Answer questions", "Cited answers from your knowledge. Refuses when evidence is missing."],
  ["explain_element", "Explain selected elements", "Uses the element's role, accessible name and visible text."],
  ["guide", "Guided walkthroughs", "Moves the Ghost Cursor over real controls. Never clicks for the user."],
  ["actions", "Actions", "Proposes tool calls. Policy decides, the user approves, VISTRA verifies."],
];
const DEFAULT_POLICY: Record<string, string> = { allow: "Allowed", require_approval: "Requires approval", allow_roles: "Owners and admins" };

function toDraft(v: Version | undefined): Draft {
  return {
    instructions: v?.instructions ?? "", notes: null,
    capabilities: v?.capabilities ?? { answer: true, explain_element: true, guide: true, actions: true },
    model_config: v?.model_config ?? { planner: "fast", answer: "fast" },
    retrieval_config: v?.retrieval_config ?? { top_k: 8, strictness: "balanced" },
    guide_config: v?.guide_config ?? { max_steps: 6 },
    tool_config: v?.tool_config ?? {},
  };
}

export default function Agents() {
  const { app, call } = useVistra();
  const toast = useToast();
  const list = useGet<Array<{ id: string }>>(app ? `/v1/applications/${app.id}/agents` : null);
  const agentId = list.data?.[0]?.id;
  const agent = useGet<Agent>(agentId ? `/v1/agents/${agentId}` : null);
  const current = useMemo(() => agent.data?.versions.find((v) => v.id === agent.data?.current_version_id), [agent.data]);
  const [draft, setDraft] = useState<Draft>(toDraft(undefined));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (current) setDraft(toDraft(current)); }, [current]);

  const dirty = current ? JSON.stringify({ ...toDraft(current), notes: null }) !== JSON.stringify({ ...draft, notes: null }) : false;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save(publish: boolean) {
    if (!agentId) return;
    setBusy(true); setErr(null);
    try {
      const r = await call<{ version: number }>(`/v1/agents/${agentId}/versions?publish=${publish}`, { method: "POST", json: { ...draft, notes: notes || null } });
      await agent.mutate();
      setNotes("");
      toast(publish ? `Version ${r.version} is live` : `Saved draft version ${r.version}`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  async function publish(v: number) {
    if (!agentId) return;
    try { await call(`/v1/agents/${agentId}/versions/${v}/publish`, { method: "POST" }); await agent.mutate(); toast(`Version ${v} is live`); } catch (e) { toast(String(e), "bad"); }
  }

  async function setStatus(status: "published" | "paused") {
    if (!agentId) return;
    try { await call(`/v1/agents/${agentId}`, { method: "PATCH", json: { status } }); await agent.mutate(); toast(status === "paused" ? "Agent paused: runs use platform defaults" : "Agent resumed"); } catch (e) { toast(String(e), "bad"); }
  }

  if (list.error || agent.error) return <ErrorNote error={list.error ?? agent.error} />;
  if (!agent.data) return <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]"><Skeleton className="h-[38rem]" /><Skeleton className="h-[38rem]" /></div>;
  const a = agent.data;

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5"><h2 className="text-[15px] font-medium">{a.name}</h2><Badge tone={a.status === "published" ? "ok" : "warn"}>{a.status}</Badge>{current && <DetailTag>live v{current.version}</DetailTag>}</div>
          <p className="mt-1 text-[13px] text-muted">{a.description} Every change creates a new version; runs record which version answered.</p>
        </div>
        {a.status === "published"
          ? <Button onClick={() => setStatus("paused")}><Pause size={14} />Pause</Button>
          : <Button variant="solid" onClick={() => setStatus("published")}><Play size={14} />Resume</Button>}
      </Card>

      <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card className="flex flex-col gap-5">
            <DetailHeader title="Instructions" subtitle="Tone, terminology and scope. Cannot override citations, approvals or verification." />
            <Textarea aria-label="Agent instructions" value={draft.instructions} maxLength={4000} onChange={(e) => set("instructions", e.target.value)}
              placeholder="e.g. Answer in at most three sentences. Call workspaces 'teams'. Only discuss Acme Workspace." className="min-h-28 font-sans text-sm" />
            <p className="-mt-3 text-right text-xs text-subtle num">{draft.instructions.length}/4000</p>
          </Card>

          <Card className="flex flex-col gap-4">
            <DetailHeader title="Capabilities" subtitle="Turned-off capabilities are refused politely instead of run." />
            <ul className="divide-y divide-line">
              {CAPS.map(([key, title, body]) => (
                <li key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0"><p className="text-sm font-medium">{title}</p><p className="text-[13px] text-muted">{body}</p></div>
                  <Toggle label={title} checked={draft.capabilities[key]} onChange={(v) => set("capabilities", { ...draft.capabilities, [key]: v })} />
                </li>
              ))}
            </ul>
          </Card>

          <Card className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <DetailHeader title="Models" subtitle="Fast is Gemini Flash Lite; Default is Gemini Flash." />
              <Field label="Planner"><Segmented label="Planner model" value={draft.model_config.planner} onChange={(v) => set("model_config", { ...draft.model_config, planner: v })} options={[{ value: "fast", label: "Fast" }, { value: "default", label: "Default" }]} /></Field>
              <Field label="Answers"><Segmented label="Answer model" value={draft.model_config.answer} onChange={(v) => set("model_config", { ...draft.model_config, answer: v })} options={[{ value: "fast", label: "Fast" }, { value: "default", label: "Default" }]} /></Field>
            </div>
            <div className="space-y-4">
              <DetailHeader title="Retrieval and guides" />
              <Field label="Evidence strictness" hint="Strict refuses more often; lenient cites weaker matches.">
                <Segmented label="Evidence strictness" value={draft.retrieval_config.strictness} onChange={(v) => set("retrieval_config", { ...draft.retrieval_config, strictness: v })}
                  options={[{ value: "strict", label: "Strict" }, { value: "balanced", label: "Balanced" }, { value: "lenient", label: "Lenient" }]} />
              </Field>
              <Field label={`Chunks retrieved: ${draft.retrieval_config.top_k}`} htmlFor="topk">
                <input id="topk" type="range" min={1} max={20} value={draft.retrieval_config.top_k} onChange={(e) => set("retrieval_config", { ...draft.retrieval_config, top_k: Number(e.target.value) })} className="w-full accent-white" />
              </Field>
              <Field label={`Max guide steps: ${draft.guide_config.max_steps}`} htmlFor="gsteps">
                <input id="gsteps" type="range" min={1} max={12} value={draft.guide_config.max_steps} onChange={(e) => set("guide_config", { max_steps: Number(e.target.value) })} className="w-full accent-white" />
              </Field>
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <DetailHeader title="Tools and policy" subtitle="Unregistered tools are always denied. Side effects are always verified." />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead><tr className="text-[12px] text-subtle"><th className="pb-2 font-medium">Tool</th><th className="pb-2 font-medium">Default</th><th className="pb-2 font-medium">Policy for this agent</th><th className="pb-2 text-right font-medium">Enabled</th></tr></thead>
                <tbody className="divide-y divide-line border-t border-line">
                  {a.tools.map((t) => {
                    const s = draft.tool_config[t.name] ?? { enabled: true, policy: "default" as Policy };
                    const upd = (patch: Partial<typeof s>) => set("tool_config", { ...draft.tool_config, [t.name]: { ...s, ...patch } });
                    return (
                      <tr key={t.name}>
                        <td className="py-3"><span className="font-mono text-[12.5px]">{t.name}</span><span className="block text-xs text-subtle">{t.side_effect ? "side effect" : "read only"}</span></td>
                        <td className="text-[13px] text-muted">{DEFAULT_POLICY[t.policy] ?? t.policy}</td>
                        <td className="pr-3">
                          <Select aria-label={`Policy for ${t.name}`} value={s.policy} onChange={(e) => upd({ policy: e.target.value as Policy })} disabled={!s.enabled}>
                            <option value="default">Use default</option><option value="require_approval">Require approval</option>
                            <option value="allow" disabled={t.policy === "allow_roles"}>Allow without approval</option><option value="deny">Deny</option>
                          </Select>
                        </td>
                        <td className="text-right"><Toggle label={`Enable ${t.name}`} checked={s.enabled} onChange={(v) => upd({ enabled: v })} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1"><Field label="Change note" htmlFor="vnote"><input id="vnote" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="What changed and why" className="h-9 w-full rounded-lg border border-line-strong bg-raised px-3 text-sm placeholder:text-subtle focus:border-ink focus:outline-none" /></Field></div>
            <div className="flex gap-2">
              <Button disabled={busy || !dirty} onClick={() => current && setDraft(toDraft(current))}>Discard</Button>
              <Button disabled={busy || !dirty} onClick={() => save(false)}>Save draft</Button>
              <Button variant="solid" data-vistra-target="agents.publish" disabled={busy || !dirty} onClick={() => save(true)}>{busy ? "Saving..." : "Save and publish"}</Button>
            </div>
          </Card>
          {err ? <ErrorNote error={err} /> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Playground publishedVersion={current?.version} />
          <Card className="flex flex-col gap-4">
            <DetailHeader title="Versions" subtitle="Publish any version to roll forward or back instantly." />
            <ul className="divide-y divide-line border-t border-line">
              {a.versions.map((v) => {
                const live = v.id === a.current_version_id;
                return (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">v{v.version}{live && <Badge tone="ok">live</Badge>}{!v.published_at && <Badge>draft</Badge>}</p>
                      <p className="truncate text-xs text-muted">{v.notes || "No note"} · {timeAgo(v.created_at)} · <span className="num">{v.runs}</span> runs</p>
                    </div>
                    {!live && <Button size="sm" onClick={() => publish(v.version)}>Publish</Button>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
