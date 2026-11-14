"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function InviteMember() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email }) });
    setBusy(false);
    if (!res.ok) return setErr((await res.json()).error ?? "Could not send the invitation");
    setName("");
    setEmail("");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button data-vistra-target="team.invite" onClick={() => setOpen(true)} className="btn btn-primary">
        Invite member
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[oklch(0.2_0.02_235/0.35)] p-4" role="presentation" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form onSubmit={submit} role="dialog" aria-label="Invite member" className="dialog-in surface w-full max-w-sm p-6 shadow-2xl">
            <h2 className="text-[16px] font-semibold">Invite member</h2>
            <p className="mt-1 text-[13px] text-muted">They get an email invite and join as a member.</p>
            <label htmlFor="inv-name" className="field mt-5">Name</label>
            <input id="inv-name" data-vistra-target="invite.name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="input" />
            <label htmlFor="inv-email" className="field mt-4">Email</label>
            <input id="inv-email" type="email" data-vistra-target="invite.email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="input" />
            {err && <p role="alert" className="mt-3 text-[13px] text-danger">{err}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">Cancel</button>
              <button data-vistra-target="invite.submit" className="btn btn-primary" disabled={busy}>{busy ? "Sending..." : "Send invitation"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
