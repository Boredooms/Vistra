import Link from "next/link";
import { HeroStage } from "@/components/home/HeroStage";
import { HeroTitle } from "@/components/home/HeroTitle";
import { Reveal } from "@/components/home/Reveal";

const CODE = `import { Vistra } from "@vistra/sdk-core";

const vistra = Vistra.init({
  appId: "app_...",
  apiUrl: "https://api.vistra.dev",
  getSessionToken: (prev) =>
    fetch("/api/vistra/session", { method: "POST" }).then((r) => r.json()),
});

vistra.on("token", (e) => render(e.text));
await vistra.ask("Show me how to invite a teammate");`;

const PILLARS: Array<[string, string, string]> = [
  ["Answers that show their source", "Hybrid vector and full-text search over your own documents. Every claim links to the exact section, and missing evidence is refused, not invented.", "/features#answers"],
  ["A cursor that explains itself", "The agent travels to real controls found by role and accessible name, with a short reasoning bubble beside the pointer.", "/features#guides"],
  ["Actions that are approved, then proven", "The model proposes, policy decides, you approve the exact arguments, and VISTRA reads the state back before calling it done.", "/features#actions"],
];

export default function Home() {
  return (
    <>
      <section className="grain relative overflow-hidden px-5 pb-20 pt-40 md:pb-28 md:pt-52">
        <div className="mx-auto max-w-6xl">
          <HeroTitle text="Your product, with a guide that points." className="max-w-4xl text-display" />
          <div className="mt-10 grid gap-10 md:grid-cols-[1.4fr_1fr] md:items-end">
            <p className="max-w-xl text-lg leading-8 text-muted">
              VISTRA embeds an agent in your app. It answers from your docs with citations, moves a visible cursor to the control a user needs, and runs actions only after approval, then checks they happened.
            </p>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link href="/sign-up" data-cursor="Free" className="inline-flex h-12 items-center rounded-xl bg-ink px-6 text-[15px] font-medium text-bg transition-colors hover:bg-white">Start building</Link>
              <Link href="/features" className="inline-flex h-12 items-center rounded-xl border border-line-strong px-6 text-[15px] font-medium transition-colors hover:bg-hover">See how it works</Link>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="live" className="border-y border-line bg-raised px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <h2 id="live" className="max-w-xl text-h2">Watch it guide.</h2>
            <p className="max-w-sm text-sm leading-6 text-muted">This is the real <span className="font-mono text-ink">@vistra/ghost-cursor</span> package walking a stand-in product. Your users see the same thing over your UI.</p>
          </Reveal>
          <HeroStage />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-28">
        <ul className="grid gap-x-12 gap-y-14 md:grid-cols-3">
          {PILLARS.map(([t, d, href]) => (
            <li key={t}>
              <Reveal>
                <h3 className="text-xl font-semibold tracking-tight">{t}</h3>
                <p className="mt-3 text-[15px] leading-7 text-muted">{d}</p>
                <Link href={href} className="mt-4 inline-block text-sm underline decoration-line-strong underline-offset-4 hover:decoration-ink">How it works</Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-line bg-raised px-5 py-28">
        <div className="mx-auto grid max-w-6xl gap-14 md:grid-cols-[1fr_1.15fr]">
          <Reveal>
            <h2 className="text-h2">One route on your server. One import in the browser.</h2>
            <p className="mt-5 max-w-md text-[17px] leading-8 text-muted">Your API key stays on your server and trades for a 15 minute session token that refreshes itself. Sessions only start from origins you list.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/packages" className="inline-flex h-11 items-center rounded-xl border border-line-strong px-5 text-sm font-medium hover:bg-hover">Packages</Link>
              <Link href="/docs" className="inline-flex h-11 items-center rounded-xl border border-line-strong px-5 text-sm font-medium hover:bg-hover">Quickstart</Link>
            </div>
          </Reveal>
          <Reveal delay={0.1}><pre className="code overflow-x-auto p-6 text-[13px]" data-cursor="Copy">{CODE}</pre></Reveal>
        </div>
      </section>

      <section className="px-5 py-28">
        <Reveal className="mx-auto max-w-6xl rounded-3xl border border-line-strong bg-raised px-8 py-20 text-center md:px-16">
          <h2 className="mx-auto max-w-2xl text-h2">Give your users a guide they can follow.</h2>
          <p className="mx-auto mt-5 max-w-lg text-muted">Free while in open beta. Create an application, add a key, index your docs, configure your agent.</p>
          <Link href="/sign-up" data-cursor="Go" className="mt-9 inline-flex h-12 items-center rounded-xl bg-ink px-7 text-[15px] font-medium text-bg hover:bg-white">Create your account</Link>
        </Reveal>
      </section>
    </>
  );
}
