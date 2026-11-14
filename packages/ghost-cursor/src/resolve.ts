import type { Strategy, TargetSpec } from "./types";

export interface Resolution {
  element: Element | null;
  strategy: Strategy | null;
  point?: { x: number; y: number };
}

export interface ResolveOptions {
  document: Document;
  allowCoordinateFallback: boolean;
  isVisible: (el: Element) => boolean;
}

const IMPLICIT_ROLES: Record<string, string> = {
  button: "button",
  a: "link",
  textarea: "textbox",
  select: "combobox",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  nav: "navigation",
  main: "main",
  table: "table",
  ul: "list",
  li: "listitem",
  dialog: "dialog",
};

export function roleOf(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit.split(/\s+/)[0] ?? "";
  const tag = el.tagName.toLowerCase();
  if (tag === "a" && !el.hasAttribute("href")) return "";
  if (tag === "input") {
    const t = (el.getAttribute("type") ?? "text").toLowerCase();
    if (t === "checkbox") return "checkbox";
    if (t === "radio") return "radio";
    if (t === "button" || t === "submit" || t === "reset") return "button";
    return "textbox";
  }
  return IMPLICIT_ROLES[tag] ?? "";
}

const clean = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

export function accessibleName(el: Element): string {
  const doc = el.ownerDocument;
  const aria = clean(el.getAttribute("aria-label"));
  if (aria) return aria;
  const by = el.getAttribute("aria-labelledby");
  if (by) {
    const t = by
      .split(/\s+/)
      .map((id) => clean(doc.getElementById(id)?.textContent))
      .filter(Boolean)
      .join(" ");
    if (t) return t;
  }
  const id = el.getAttribute("id");
  if (id) {
    const lab = Array.from(doc.querySelectorAll("label")).find((l) => l.getAttribute("for") === id);
    if (lab) return clean(lab.textContent);
  }
  const wrap = el.closest("label");
  if (wrap && wrap !== el) return clean(wrap.textContent);
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") {
    return clean(el.getAttribute("placeholder")) || clean(el.getAttribute("title"));
  }
  if (tag === "img") return clean(el.getAttribute("alt"));
  return clean(el.textContent) || clean(el.getAttribute("title"));
}

export function defaultIsVisible(el: Element): boolean {
  const win = el.ownerDocument.defaultView;
  if (!win) return false;
  const cs = win.getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

const norm = (s: string) => s.toLowerCase();

const esc = (s: string): string =>
  typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");

function firstVisible(els: Iterable<Element>, ok: (e: Element) => boolean): Element | null {
  for (const e of els) if (ok(e)) return e;
  return null;
}

function isSafeSelector(doc: Document, sel: string): boolean {
  if (sel.length > 200 || /[<>]\s*script|javascript:/i.test(sel)) return false;
  try {
    doc.createDocumentFragment().querySelector(sel); // syntax check only
    return true;
  } catch {
    return false;
  }
}

/**
 * Normative order: data-vistra-target -> role+name -> label/aria-label -> stable data attribute ->
 * validated CSS selector -> visible text -> coordinates (only if allowed).
 */
export function resolveTarget(spec: TargetSpec, o: ResolveOptions): Resolution {
  const doc = o.document;
  const vis = o.isVisible;

  if (spec.id) {
    const el = firstVisible(doc.querySelectorAll(`[data-vistra-target="${esc(spec.id)}"]`), vis);
    if (el) return { element: el, strategy: "data-vistra-target" };
  }

  if (spec.role && spec.name) {
    const want = norm(spec.name);
    const cands = Array.from(doc.querySelectorAll("*")).filter((e) => roleOf(e) === spec.role && vis(e));
    const exact = cands.find((e) => norm(accessibleName(e)) === want);
    const partial = exact ?? cands.find((e) => norm(accessibleName(e)).includes(want));
    if (partial) return { element: partial, strategy: "role-name" };
  }

  const label = spec.label ?? spec.name;
  if (label) {
    const want = norm(label);
    const byAria = firstVisible(doc.querySelectorAll("[aria-label]"), (e) => norm(clean(e.getAttribute("aria-label"))) === want && vis(e));
    if (byAria) return { element: byAria, strategy: "label" };
    for (const l of Array.from(doc.querySelectorAll("label"))) {
      if (norm(clean(l.textContent)) !== want) continue;
      const forId = l.getAttribute("for");
      const ctl = forId ? doc.getElementById(forId) : l.querySelector("input,select,textarea,button");
      if (ctl && vis(ctl)) return { element: ctl, strategy: "label" };
    }
    const ph = firstVisible(doc.querySelectorAll("[placeholder]"), (e) => norm(clean(e.getAttribute("placeholder"))) === want && vis(e));
    if (ph) return { element: ph, strategy: "label" };
  }

  if (spec.attr) {
    const sel = `[${esc(spec.attr.name)}="${esc(spec.attr.value)}"]`;
    const el = firstVisible(doc.querySelectorAll(sel), vis);
    if (el) return { element: el, strategy: "data-attribute" };
  }

  if (spec.selector && isSafeSelector(doc, spec.selector)) {
    const el = firstVisible(doc.querySelectorAll(spec.selector), vis);
    if (el) return { element: el, strategy: "selector" };
  }

  if (spec.text) {
    const want = norm(clean(spec.text));
    const interactive = "a,button,[role],input,select,textarea,h1,h2,h3,h4,h5,h6,label,li,td,th,span,p,div";
    const el = firstVisible(doc.querySelectorAll(interactive), (e) => {
      if (!vis(e)) return false;
      const own = clean(Array.from(e.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" "));
      return norm(own) === want || (e.children.length === 0 && norm(clean(e.textContent)) === want);
    });
    if (el) return { element: el, strategy: "text" };
  }

  if (spec.coordinates && o.allowCoordinateFallback) {
    const { x, y } = spec.coordinates;
    const el = doc.elementFromPoint(x, y);
    return { element: el, strategy: "coordinates", point: { x, y } };
  }
  return { element: null, strategy: null };
}
