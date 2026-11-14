import type { Metadata } from "next";
import { Reveal } from "@/components/home/Reveal";

export const metadata: Metadata = { title: "Packages" };

const PKGS: Array<{ name: string; install: string; desc: string; status: string; url?: string; snippet: string }> = [
  {
    name: "@boredooms/vistra-sdk", install: "npm i @boredooms/vistra-sdk", status: process.env.NEXT_PUBLIC_NPM_PUBLISHED === "1" ? "Published" : "Ready to publish", url: process.env.NEXT_PUBLIC_NPM_PUBLISHED === "1" ? "https://www.npmjs.com/package/@boredooms/vistra-sdk" : undefined,
    desc: "Framework-free browser SDK: sessions, streaming answers, citations, approvals, guides and element selection.",
    snippet: `const vistra = Vistra.init({ appId, apiUrl, getSessionToken });\nawait vistra.ask("How do I invite a teammate?");`,
  },
  {
    name: "@boredooms/vistra-ghost-cursor", install: "npm i @boredooms/vistra-ghost-cursor", status: process.env.NEXT_PUBLIC_NPM_PUBLISHED === "1" ? "Published" : "Ready to publish", url: process.env.NEXT_PUBLIC_NPM_PUBLISHED === "1" ? "https://www.npmjs.com/package/@boredooms/vistra-ghost-cursor" : undefined,
    desc: "The standalone guide cursor: semantic targeting, eased motion, reasoning bubbles, reduced motion. Zero dependencies.",
    snippet: `const cursor = new GhostCursor({ label: "Guide" });\nawait cursor.runFlow([{ target: { id: "nav.team" }, instruction: "Open Team." }]);`,
  },
  {
    name: "REST + SSE API", install: "POST /v1/sdk/messages", status: "Available",
    desc: "Everything the dashboard does, over HTTP. Errors are RFC 9457 problem documents with stable codes.",
    snippet: `curl -N -H "Authorization: Bearer $SDK_TOKEN" \\\n  -d '{"message":"What is in Starter?"}' $API/v1/sdk/messages`,
  },
];

export default function Packages() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-28 pt-40 md:pt-48">
      <h1 className="max-w-3xl text-display">Packages</h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-muted">Use the pieces on their own or together. TypeScript, ESM and CommonJS, typed declarations included.</p>
      <ul className="mt-16 divide-y divide-line border-y border-line">
        {PKGS.map((p) => (
          <li key={p.name}>
            <Reveal className="grid gap-6 py-10 md:grid-cols-[1fr_1.2fr] md:gap-12">
              <div>
                <div className="flex items-center gap-3"><h2 className="font-mono text-lg font-medium">{p.name}</h2><span className={`text-xs ${p.status === "Ready to publish" ? "text-warn" : "text-ok"}`}>{p.status}</span></div>
                <p className="mt-3 text-[15px] leading-7 text-muted">{p.desc}</p>
                <code className="mt-4 inline-block rounded-lg border border-line px-3 py-1.5 font-mono text-[13px] text-muted">{p.install}</code>
                {p.url && <a href={p.url} className="ml-3 text-sm underline decoration-line-strong underline-offset-4 hover:decoration-ink">npm</a>}
              </div>
              <pre className="code overflow-x-auto p-5">{p.snippet}</pre>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
