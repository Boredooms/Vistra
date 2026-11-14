"use client";

import { GhostCursor, type GuideStep } from "@boredooms/vistra-ghost-cursor";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

const STEPS: GuideStep[] = [
  { target: { id: "stage.team" }, instruction: "Open the Team page.", action: "view", reason: "Members are managed on Team, so that is where an invitation starts." },
  { target: { id: "stage.invite" }, instruction: "Choose Invite member.", action: "view", reason: "This opens the form. Only owners and admins see it, and you are an admin." },
  { target: { id: "stage.name" }, instruction: "Type your teammate's name.", action: "view", reason: "The invitation needs a name and an email before it can be sent." },
];

const MEMBERS = [["Dev Owner", "Owner"], ["Priya Nair", "Admin"], ["Marcus Lee", "Member"]];

/** The real @boredooms/vistra-ghost-cursor moving over live DOM. The surrounding "product" is a stand-in for yours. */
export function HeroStage() {
  const root = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<"dash" | "team">("dash");
  const [dialog, setDialog] = useState(false);
  const [typed, setTyped] = useState("");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let cursor: GhostCursor | null = null;
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const reset = () => { setPage("dash"); setDialog(false); setTyped(""); };
    const loop = async () => {
      if (dead) return;
      reset();
      await new Promise((r) => (timer = setTimeout(r, 900)));
      if (dead) return;
      cursor = new GhostCursor({
        label: "VISTRA",
        autoAdvanceMs: 2600,
        theme: { accent: "#fafafa", ink: "#0a0a0a", surface: "#171717", text: "#fafafa" },
        onEvent: (e) => {
          if (e.type === "step.completed") {
            if (e.stepIndex === 0) setPage("team");
            if (e.stepIndex === 1) setDialog(true);
          }
          if (e.type === "cursor.hovering" && e.stepIndex === 2) {
            const name = "Jordan Kim";
            let i = 0;
            const iv = setInterval(() => { i++; setTyped(name.slice(0, i)); if (i >= name.length) clearInterval(iv); }, 90);
          }
        },
      });
      const res = await cursor.runFlow(STEPS);
      cursor.destroy();
      cursor = null;
      if (dead || res.status === "cancelled") return;
      timer = setTimeout(loop, 3200);
    };

    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !dead && !cursor && !playing) { setPlaying(true); void loop(); }
      if (!entry?.isIntersecting && cursor) { cursor.cancel(); setPlaying(false); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { dead = true; io.disconnect(); if (timer) clearTimeout(timer); cursor?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={root} className="relative mx-auto w-full max-w-4xl" aria-label="Live preview of the Ghost Cursor guiding a user through inviting a teammate" role="img">
      <div className="overflow-hidden rounded-2xl border border-line-strong bg-raised shadow-[0_40px_120px_rgb(0_0_0/0.55)]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-hover" /><span className="h-2.5 w-2.5 rounded-full bg-hover" /><span className="h-2.5 w-2.5 rounded-full bg-hover" />
          <span className="ml-3 rounded-md bg-bg px-3 py-1 font-mono text-[11px] text-subtle">acme.app/{page === "dash" ? "dashboard" : "team"}</span>
        </div>
        <div className="grid min-h-[22rem] grid-cols-[11rem_1fr]">
          <aside className="space-y-1 border-r border-line p-3 text-[13px]">
            <div className="mb-3 px-2 font-semibold">Acme</div>
            {[["Dashboard", "dash"], ["Projects", "x"], ["Team", "team"], ["Billing", "x"]].map(([l, k]) => (
              <div key={l} data-vistra-target={l === "Team" ? "stage.team" : undefined} className={clsx("rounded-md px-2 py-1.5", page === k ? "bg-hover text-ink" : "text-muted")}>{l}</div>
            ))}
          </aside>
          <div className="relative p-6">
            {page === "dash" ? (
              <div>
                <div className="text-lg font-semibold">Dashboard</div>
                <div className="mt-4 grid grid-cols-3 gap-6 text-sm text-muted">
                  {[["Projects", "4"], ["Overdue", "1"], ["Members", "3"]].map(([k, v]) => <div key={k}><div>{k}</div><div className="num mt-1 text-2xl font-semibold text-ink">{v}</div></div>)}
                </div>
                <div className="mt-8 h-24 rounded-lg border border-dashed border-line-strong" />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">Team</div>
                  <div data-vistra-target="stage.invite" className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-bg">Invite member</div>
                </div>
                <ul className="mt-5 divide-y divide-line text-sm">
                  {MEMBERS.map(([n, r]) => <li key={n} className="flex justify-between py-2.5"><span>{n}</span><span className="text-muted">{r}</span></li>)}
                </ul>
              </div>
            )}
            {dialog && (
              <div className="absolute inset-0 grid place-items-center bg-black/55">
                <div className="w-64 rounded-xl border border-line-strong bg-panel p-4">
                  <div className="mb-3 text-sm font-semibold">Invite member</div>
                  <div className="text-xs text-muted">Name</div>
                  <div data-vistra-target="stage.name" className="mt-1 h-8 rounded-md border border-line-strong bg-raised px-2.5 py-1.5 text-[13px]">{typed}<span className="ml-px inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-ink" /></div>
                  <div className="mt-3 text-xs text-muted">Email</div>
                  <div className="mt-1 h-8 rounded-md border border-line-strong bg-raised" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
