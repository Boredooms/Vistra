"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge, Button, Dialog, Empty, ErrorNote, Field, Input, Select, Skeleton, Textarea, timeAgo, useToast } from "@/components/ui";
import { useGet, useVistra } from "@/lib/api";
import { statusTone } from "@/lib/format";

interface Source { id: string; source_type: string; title: string; url: string | null; created_at: string; job_status: string | null; job_error: string | null; chunks: number }
interface Hit { chunk_id: string; title: string; section: string | null; content: string; cos_sim: number | null; vector_rank: number | null; fts_rank: number | null; rrf: number; passes_threshold: boolean }

function AddSource({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { app, call } = useVistra();
  const toast = useToast();
  const [type, setType] = useState("markdown");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Dialog open={open} onClose={onClose} title="Add knowledge source" wide>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (!app?.collection_id) return;
        setBusy(true); setErr(null);
        try {
          await call(`/v1/collections/${app.collection_id}/sources`, { method: "POST", json: { source_type: type, title: title || undefined, url: type === "url" ? url : undefined, content: type === "url" ? undefined : content } });
          toast("Indexing started"); setTitle(""); setUrl(""); setContent(""); onDone(); onClose();
        } catch (x) { setErr(x); } finally { setBusy(false); }
      }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="st"><Select id="st" value={type} onChange={(e) => setType(e.target.value)}><option value="markdown">Markdown</option><option value="text">Plain text</option><option value="html">HTML</option><option value="url">Public URL</option></Select></Field>
          <Field label="Title" htmlFor="ti"><Input id="ti" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pricing" /></Field>
        </div>
        {type === "url" ? (
          <Field label="URL" htmlFor="ur" hint="Fetched server-side. Private and link-local addresses are blocked."><Input id="ur" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.acme.com/pricing" /></Field>
        ) : (
          <Field label="Content" htmlFor="co"><Textarea id="co" required value={content} onChange={(e) => setContent(e.target.value)} placeholder="# Pricing&#10;&#10;## Starter plan&#10;..." /></Field>
        )}
        {err ? <ErrorNote error={err} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button variant="solid" disabled={busy}>{busy ? "Starting..." : "Index"}</Button></div>
      </form>
    </Dialog>
  );
}

function Playground() {
  const { call, app } = useVistra();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="mt-12">
      <h2 className="text-sm font-medium">Retrieval playground</h2>
      <p className="mt-1 text-[13px] text-muted">Runs the same hybrid search (vector + full text, fused with RRF) your assistant uses, with the scores visible.</p>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null);
        try { const r = await call<{ results: Hit[] }>("/v1/knowledge/search", { method: "POST", json: { query: q }, appId: app?.id }); setHits(r.results); } catch (x) { setErr(x); } finally { setBusy(false); }
      }}>
        <Input aria-label="Search query" value={q} onChange={(e) => setQ(e.target.value)} placeholder="What does the Starter plan include?" />
        <Button variant="solid" disabled={busy || !q.trim()}><Search size={14} />{busy ? "Searching" : "Search"}</Button>
      </form>
      {err ? <div className="mt-3"><ErrorNote error={err} /></div> : null}
      {hits && (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {hits.length === 0 && <li className="py-4 text-sm text-muted">No results.</li>}
          {hits.map((h) => (
            <li key={h.chunk_id} className="py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{h.title}</span><span className="text-subtle">{h.section?.split(" > ").slice(1).join(" > ")}</span>
                <span className="ml-auto flex gap-1.5 num">
                  <Badge>{h.cos_sim != null ? `sim ${h.cos_sim.toFixed(2)}` : "no vector"}</Badge>
                  {h.vector_rank && <Badge>vec #{h.vector_rank}</Badge>}{h.fts_rank && <Badge>fts #{h.fts_rank}</Badge>}
                  <Badge tone={h.passes_threshold ? "ok" : "warn"}>{h.passes_threshold ? "cited" : "below threshold"}</Badge>
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[13px] text-muted">{h.content}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Knowledge() {
  const { app, call } = useVistra();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const src = useGet<Source[]>(app?.collection_id ? `/v1/collections/${app.collection_id}/sources` : null, { refreshInterval: (d) => (d?.some((s) => s.job_status === "queued" || s.job_status === "running") ? 2000 : 0) });
  return (
    <>
      <PageHeader title="Knowledge" sub="Documents your assistant can cite. Each is parsed, chunked by heading and embedded for hybrid search. Retrieval is scoped to this application in SQL." actions={<Button variant="solid" data-vistra-target="knowledge.add" onClick={() => setOpen(true)} disabled={!app?.collection_id}><Plus size={16} />Add source</Button>} />
      {src.error ? <ErrorNote error={src.error} /> : null}
      {src.isLoading ? <Skeleton className="h-48" /> : src.data?.length ? (
        <table className="w-full text-left text-sm">
          <thead className="text-[13px] text-subtle"><tr className="border-b border-line"><th className="py-2 font-medium">Source</th><th className="font-medium">Type</th><th className="font-medium">Chunks</th><th className="font-medium">Status</th><th className="font-medium">Added</th><th /></tr></thead>
          <tbody className="divide-y divide-line">
            {src.data.map((s) => (
              <tr key={s.id}>
                <td className="max-w-xs truncate py-3 font-medium" title={s.url ?? s.title}>{s.title}</td>
                <td className="text-muted">{s.source_type}</td>
                <td className="num text-muted">{s.chunks}</td>
                <td><Badge tone={statusTone(s.job_status ?? "")}>{s.job_status ?? "unknown"}</Badge>{s.job_error && <span className="ml-2 text-xs text-bad" title={s.job_error}>error</span>}</td>
                <td className="text-muted">{timeAgo(s.created_at)}</td>
                <td className="text-right"><Button size="sm" variant="ghost" aria-label={`Delete ${s.title}`} onClick={async () => { if (!confirm(`Delete "${s.title}" and its chunks?`)) return; try { await call(`/v1/collections/${app?.collection_id}/sources/${s.id}`, { method: "DELETE" }); await src.mutate(); toast("Source deleted"); } catch (x) { toast(String(x), "bad"); } }}><Trash2 size={14} /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty title="No documents yet" body="Add your docs so answers come with citations to the real source instead of model guesses." action={<Button variant="solid" onClick={() => setOpen(true)}>Add source</Button>} />}
      <Playground />
      <AddSource open={open} onClose={() => setOpen(false)} onDone={() => src.mutate()} />
    </>
  );
}
