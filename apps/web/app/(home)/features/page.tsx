import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/home/Reveal";
import { HeroTitle } from "@/components/home/HeroTitle";

export const metadata: Metadata = { title: "Features" };

function Panel({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className="rounded-2xl border border-line-strong bg-raised p-5" role="group" aria-label={label}>{children}</div>;
}

const AGENT_ROWS: Array<[string, string]> = [
  ["Instructions", "Tone, terminology and scope, fenced below the safety rules"],
  ["Capabilities", "Answers, element explanations, guides, actions: each on or off"],
  ["Models", "Fast or default tier for planning and answering"],
  ["Evidence", "Strict, balanced or lenient citation threshold; chunks per answer"],
  ["Tools", "Per-tool enable, require approval, allow or deny"],
  ["Versions", "Every save is a version; publish any of them to roll forward or back"],
];

export default function Features() {
  return (
    <>
      <section className="px-5 pb-16 pt-40 md:pt-48">
        <div className="mx-auto max-w-6xl">
          <HeroTitle text="Understand. Guide. Execute." className="max-w-3xl text-display" />
          <p className="mt-8 max-w-xl text-lg leading-8 text-muted">Four capabilities, one agent runtime, each one built so you can see why it did what it did.</p>
        </div>
      </section>

      <section id="answers" className="mx-auto grid max-w-6xl scroll-mt-24 items-center gap-12 px-5 py-20 md:grid-cols-2">
        <Reveal>
          <h2 className="text-h2">Answers that show their source.</h2>
          <p className="mt-5 max-w-md text-[17px] leading-8 text-muted">Documents are split by heading, embedded with Gemini, and searched with vectors and Postgres full text fused by reciprocal rank. Tenant scope is applied inside the SQL. Every claim carries a citation; if nothing in your docs supports it, the answer says so.</p>
        </Reveal>
        <Panel label="Example answer with citations">
          <div className="ml-auto w-fit max-w-[85%] rounded-2xl bg-ink px-4 py-2 text-sm text-bg">What does the Starter plan include?</div>
          <p className="mt-4 text-[15px] leading-7">The Starter plan costs $12 per month for up to 5 team members <sup className="text-muted">[1]</sup>. It includes 10 active projects, 5 GB of storage and email support <sup className="text-muted">[1]</sup>.</p>
          <span className="mt-4 inline-block rounded-full border border-line-strong px-3 py-1 text-xs text-muted">[1] Pricing &gt; Starter plan</span>
        </Panel>
      </section>

      <section id="guides" className="border-y border-line bg-raised">
        <div className="mx-auto grid max-w-6xl scroll-mt-24 items-center gap-12 px-5 py-20 md:grid-cols-2">
          <Panel label="Example guide steps with reasoning">
            <ol className="space-y-4">
              {[["Team", "Members are managed on Team."], ["Invite member", "This opens the invitation form."], ["Name", "The invitation needs a name and an email."]].map(([t, r], i) => (
                <li key={t} className="flex gap-4">
                  <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-strong text-xs text-muted">{i + 1}</span>
                  <div><div className="text-sm font-medium">{t}</div><div className="mt-1 rounded-lg rounded-tl-sm border border-line-strong px-3 py-2 text-[13px] text-muted">{r}</div></div>
                </li>
              ))}
            </ol>
          </Panel>
          <Reveal>
            <h2 className="text-h2">A cursor that explains itself.</h2>
            <p className="mt-5 max-w-md text-[17px] leading-8 text-muted">Targets resolve in a fixed order: your target id, then role and accessible name, then label, data attribute, selector and text. Coordinates come last and only if you allow them. The cursor waits for the user to act; finishing a walkthrough is never recorded as a completed action.</p>
          </Reveal>
        </div>
      </section>

      <section id="actions" className="mx-auto grid max-w-6xl scroll-mt-24 items-center gap-12 px-5 py-20 md:grid-cols-2">
        <Reveal>
          <h2 className="text-h2">Actions that are approved, then proven.</h2>
          <p className="mt-5 max-w-md text-[17px] leading-8 text-muted">Runs are a LangGraph state machine checkpointed to Postgres. Approval is a durable interrupt: the run survives a restart and resumes exactly where it paused. Tool calls are HMAC-signed and replay-proof, and verification reads the record back before anything is called done.</p>
        </Reveal>
        <Panel label="Example run timeline">
          <ol className="relative border-l border-line-strong pl-6">
            {[["Intent", "action: create_project"], ["Policy", "require approval"], ["Approval", "approved, args hash bound"], ["Execution", "POST .../create_project 200"], ["Verification", "project found in list_projects"]].map(([k, v]) => (
              <li key={k} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-raised bg-ink" />
                <div className="text-sm font-medium">{k}</div><div className="font-mono text-[12px] text-muted">{v}</div>
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <section id="agents" className="border-t border-line bg-raised px-5 py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal><h2 className="max-w-2xl text-h2">Configure the agent without touching its safety rules.</h2></Reveal>
          <dl className="mt-12 grid gap-x-16 gap-y-8 md:grid-cols-2">
            {AGENT_ROWS.map(([t, d]) => (
              <Reveal key={t}><div className="border-t border-line-strong pt-4"><dt className="font-medium">{t}</dt><dd className="mt-1.5 text-[15px] text-muted">{d}</dd></div></Reveal>
            ))}
          </dl>
          <Link href="/sign-up" className="mt-12 inline-flex h-12 items-center rounded-xl bg-ink px-6 text-[15px] font-medium text-bg hover:bg-white">Configure yours</Link>
        </div>
      </section>
    </>
  );
}
