import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked, type Tokens } from "marked";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Docs" };

const FILES = [
  ["quickstart.md", "Quickstart"],
  ["guides-and-cursor.md", "Guides and the Ghost Cursor"],
  ["actions-and-security.md", "Actions and security"],
  ["sdk-reference.md", "SDK reference"],
] as const;

/** Must match app/knowledge/parsing.py::slug so citation anchors resolve to real headings. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

type Block = { k: "h"; d: number; t: string } | { k: "p"; t: string };

function blocks(src: string): Block[] {
  const out: Block[] = [];
  for (const t of marked.lexer(src)) {
    if (t.type === "heading") out.push({ k: "h", d: (t as Tokens.Heading).depth, t: (t as Tokens.Heading).text });
    else if (t.type === "paragraph") out.push({ k: "p", t: (t as Tokens.Paragraph).text });
  }
  return out;
}

export default async function Docs() {
  const docs = await Promise.all(
    FILES.map(async ([f, title]) => ({ title, base: slug(title), blocks: blocks(await readFile(path.join(process.cwd(), "content", "docs", f), "utf8")) })),
  );
  return (
    <>
      <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-28 pt-32 md:grid-cols-[14rem_1fr]">
        <aside className="md:sticky md:top-28 md:h-fit">
          <h1 className="text-sm font-medium">Documentation</h1>
          <nav aria-label="Docs" className="mt-4 space-y-2 text-sm">
            {docs.map((d) => <a key={d.base} href={`#${d.base}--top`} className="block text-muted hover:text-ink">{d.title}</a>)}
          </nav>
        </aside>
        <div className="max-w-2xl space-y-20">
          {docs.map((d) => (
            <article key={d.base}>
              {d.blocks.map((b, i) => {
                if (b.k === "p") return <p key={i} className="mt-3 text-[16px] leading-8 text-muted">{b.t.replace(/\*\*/g, "")}</p>;
                const id = `${d.base}--${b.t === d.title ? "top" : slug(b.t)}`;
                return b.d === 1 ? (
                  <h2 key={i} id={id} className="scroll-mt-28 text-3xl font-semibold tracking-tight target:text-white">{b.t}</h2>
                ) : (
                  <h3 key={i} id={id} className="mt-10 scroll-mt-28 text-lg font-semibold tracking-tight target:bg-hover target:px-2 target:-mx-2 target:rounded-md">{b.t}</h3>
                );
              })}
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
