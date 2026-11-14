import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked, type Tokens } from "marked";
import { parse } from "node-html-parser";
import type { ReactNode } from "react";
import { DOCS, slug } from "@/lib/targets";

export const dynamic = "force-static";

type Block = { kind: "h"; depth: number; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] };

function mdBlocks(src: string): Block[] {
  const out: Block[] = [];
  for (const t of marked.lexer(src)) {
    if (t.type === "heading") out.push({ kind: "h", depth: (t as Tokens.Heading).depth, text: (t as Tokens.Heading).text });
    else if (t.type === "paragraph") out.push({ kind: "p", text: (t as Tokens.Paragraph).text });
    else if (t.type === "list") out.push({ kind: "ul", items: (t as Tokens.List).items.map((i) => i.text) });
  }
  return out;
}

function htmlBlocks(src: string): Block[] {
  const root = parse(src);
  const out: Block[] = [];
  for (const el of root.querySelectorAll("h1, h2, h3, p, ul")) {
    if (el.closest("nav")) continue;
    const tag = el.tagName.toLowerCase();
    if (/^h\d$/.test(tag)) out.push({ kind: "h", depth: Number(tag[1]), text: el.text.trim() });
    else if (tag === "p") out.push({ kind: "p", text: el.text.replace(/\s+/g, " ").trim() });
    else out.push({ kind: "ul", items: el.querySelectorAll("li").map((li) => li.text.replace(/\s+/g, " ").trim()) });
  }
  return out;
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith("`") ? <code key={i} className="rounded bg-panel px-1 text-[0.9em]">{part.slice(1, -1)}</code> : part,
  );
}

export default async function Docs() {
  const docs = await Promise.all(
    DOCS.map(async (d) => {
      const raw = await readFile(path.join(process.cwd(), "content", d.file), "utf8");
      return { ...d, blocks: d.type === "md" ? mdBlocks(raw) : htmlBlocks(raw) };
    }),
  );
  return (
    <div className="max-w-3xl">
      <h1 className="page-title">Docs</h1>
      <p className="page-sub">The same documents VISTRA indexed. Citation chips in the assistant link to these headings.</p>
      {docs.map((d) => {
        const base = slug(d.title);
        return (
          <article key={d.file} className="surface mt-6 p-7">
            {d.blocks.map((b, i) => {
              if (b.kind === "h") {
                const id = `${base}--${b.text === d.title ? "top" : slug(b.text)}`;
                const cls = b.depth === 1 ? "text-xl font-semibold" : "mt-6 text-base font-semibold";
                return b.depth === 1 ? (
                  <h2 key={i} id={id} className={`${cls} scroll-mt-6 target:bg-accent-soft target:outline target:outline-2 target:outline-offset-4 target:outline-[var(--accent)]`}>{b.text}</h2>
                ) : (
                  <h3 key={i} id={id} className={`${cls} scroll-mt-6 rounded target:bg-accent-soft target:outline target:outline-2 target:outline-offset-4 target:outline-[var(--accent)]`}>{b.text}</h3>
                );
              }
              if (b.kind === "p") return <p key={i} className="mt-2 max-w-[70ch] text-[14px] leading-6 text-ink">{inline(b.text)}</p>;
              return (
                <ul key={i} className="mt-2 list-disc pl-5 max-w-[70ch] text-[14px] leading-6 text-ink">
                  {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
                </ul>
              );
            })}
          </article>
        );
      })}
    </div>
  );
}
