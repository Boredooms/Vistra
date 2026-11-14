import type { Metadata } from "next";
import { Reveal } from "@/components/home/Reveal";

export const metadata: Metadata = { title: "Security" };

const ITEMS: Array<[string, string]> = [
  ["Row level security, forced", "Every tenant table carries an organization id with RLS enabled and forced. Requests run as a non-bypass database role; a test proves a second organization reads nothing."],
  ["Retrieval filtered in SQL", "Organization and application scope apply inside the hybrid search query, before any content reaches a model."],
  ["Keys never reach the browser", "API keys are SHA-256 hashed and shown once. Browsers hold only 15 minute, audience-bound session tokens minted for listed origins."],
  ["Signed, replay-proof tool calls", "Each call carries an HMAC of tool, arguments, run id and timestamp, rejected after 60 seconds or on reuse. Per-application secrets are encrypted at rest."],
  ["Approval bound to arguments", "An approval covers the SHA-256 of the exact arguments you saw. Changed arguments invalidate it."],
  ["Private fields never captured", "Password fields, card fields and anything marked data-vistra-private are dropped before context leaves the page."],
  ["Failure is visible", "Retries, circuit breaker, fallback provider and verification outcomes are recorded on every run and shown in the dashboard."],
  ["Audited", "Key creation and revocation, agent publishes, approvals and policy denials are written to an append-only audit trail."],
];

export default function Security() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-28 pt-40 md:pt-48">
      <h1 className="max-w-3xl text-display">Built so one customer can never see another.</h1>
      <dl className="mt-16 grid gap-x-16 gap-y-10 md:grid-cols-2">
        {ITEMS.map(([t, d]) => (
          <Reveal key={t}><div className="border-t border-line-strong pt-5"><dt className="font-medium">{t}</dt><dd className="mt-2 text-[15px] leading-7 text-muted">{d}</dd></div></Reveal>
        ))}
      </dl>
    </section>
  );
}
