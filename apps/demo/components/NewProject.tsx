"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewProject() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setBusy(false);
    if (!res.ok) return setErr((await res.json()).error ?? "Could not create the project");
    setName("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button data-vistra-target="projects.new" onClick={() => setOpen(true)} className="btn btn-primary">
        <span aria-hidden="true" className="text-base leading-none">+</span> New project
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex items-start gap-2" aria-label="New project">
      <div>
        <label className="sr-only" htmlFor="project-name">Project name</label>
        <input id="project-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" aria-invalid={!!err} className="input mt-0 w-56" />
        {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
      </div>
      <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? "Creating..." : "Create"}</button>
      <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">Cancel</button>
    </form>
  );
}
