import { accessibleName, defaultIsVisible, normalizePath, roleOf } from "@vistra/ghost-cursor";
import type { KnownTarget, Selection } from "./types";

const MAX_SUMMARY = 8000;
const MAX_AUTO_TARGETS = 120;
const MAX_ROUTES = 60;
const SENSITIVE = /password|passcode|otp|one-time|cvv|cvc|card.?number|iban|ssn|social security/i;

export function isPrivate(el: Element): boolean {
  if (el.closest("[data-vistra-private]")) return true;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.type === "password") return true;
    if ((el.getAttribute("autocomplete") ?? "").toLowerCase().startsWith("cc-")) return true;
    if (SENSITIVE.test(`${el.name} ${el.id} ${el.getAttribute("aria-label") ?? ""} ${el.placeholder ?? ""}`)) return true;
  }
  return false;
}

export function describeElement(el: Element): Selection {
  const priv = isPrivate(el);
  const input = el as HTMLInputElement;
  const state = ["disabled", "checked", "expanded", "selected", "pressed", "invalid"]
    .filter((a) => el.getAttribute(`aria-${a}`) === "true" || (a === "disabled" && input.disabled))
    .join(",");
  const heading = el.closest("section,article,tr,li,form,dialog,[role=dialog]")?.querySelector("h1,h2,h3,h4,th,label,strong,legend")?.textContent?.trim();
  const anchor = el.closest("[data-vistra-target]");
  const sel: Selection = {
    role: roleOf(el) || el.tagName.toLowerCase(),
    name: accessibleName(el).slice(0, 200),
    tag: el.tagName.toLowerCase(),
    ...(anchor ? { target_id: anchor.getAttribute("data-vistra-target") ?? undefined } : {}),
    ...(state ? { state } : {}),
    ...(heading ? { near: heading.slice(0, 200) } : {}),
    private: priv,
  };
  if (!priv) sel.text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (el instanceof HTMLInputElement) {
    sel.input_type = el.type;
    sel.autocomplete = el.getAttribute("autocomplete") ?? undefined;
  }
  return sel;
}

/** Bounded accessibility-flavoured outline of the visible page: landmarks, headings, controls, table headers. */
export function summarizePage(doc: Document): string {
  const lines: string[] = [];
  let size = 0;
  const els = doc.querySelectorAll("h1,h2,h3,nav,main,[role=main],button,a[href],input,select,textarea,[role=tab],[role=dialog],[role=status],table caption,th");
  for (const el of Array.from(els)) {
    if (isPrivate(el) || el.closest("[data-vistra-ui]") || !defaultIsVisible(el)) continue;
    const role = roleOf(el) || el.tagName.toLowerCase();
    const name = accessibleName(el).slice(0, 90);
    if (!name && role !== "navigation" && role !== "main") continue;
    const line = `${role}: ${name}`;
    size += line.length + 1;
    if (size > MAX_SUMMARY - 200) break;
    lines.push(line);
  }
  // a short excerpt of visible main text helps "explain this page" on arbitrary sites
  const main = (doc.querySelector("main,[role=main],article") as HTMLElement | null) ?? doc.body;
  const text = (main?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, Math.max(0, MAX_SUMMARY - size - 40));
  if (text) lines.push(`text: ${text}`);
  return lines.join("\n").slice(0, MAX_SUMMARY);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/**
 * Target catalog = host-declared targets + data-vistra-target anchors + (optionally) auto-discovered controls.
 * Auto targets carry role + accessible name, which is what the Ghost Cursor resolves when no anchor exists.
 */
export function collectTargets(doc: Document, host: KnownTarget[], route: string, autoDiscover = true): KnownTarget[] {
  const map = new Map<string, KnownTarget>();
  for (const t of host) map.set(t.id, t);
  for (const el of Array.from(doc.querySelectorAll("[data-vistra-target]"))) {
    const id = el.getAttribute("data-vistra-target");
    if (!id || isPrivate(el) || el.closest("[data-vistra-ui]")) continue;
    const prev = map.get(id);
    map.set(id, { ...prev, id, role: roleOf(el) || prev?.role, name: accessibleName(el).slice(0, 120) || prev?.name, route: prev?.route ?? route });
  }
  if (autoDiscover) {
    let n = 0;
    const seen = new Set(Array.from(map.values()).map((t) => `${t.role}|${t.name}`));
    for (const el of Array.from(doc.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],summary"))) {
      if (n >= MAX_AUTO_TARGETS) break;
      if (el.closest("[data-vistra-target],[data-vistra-ui]") || isPrivate(el) || !defaultIsVisible(el)) continue;
      const role = roleOf(el);
      const name = accessibleName(el).replace(/\s+/g, " ").trim().slice(0, 80);
      if (!role || !name || seen.has(`${role}|${name}`)) continue;
      seen.add(`${role}|${name}`);
      const isNav = !!el.closest("nav,header,[role=navigation]");
      map.set(`auto:${role}:${slug(name)}`, { id: `auto:${role}:${slug(name)}`, role, name, route: isNav ? "*" : route });
      n++;
    }
  }
  return Array.from(map.values()).slice(0, 200);
}

/** Same-origin paths linked from the page plus host-declared routes. */
export function collectRoutes(doc: Document, extra: string[] = []): string[] {
  const origin = doc.defaultView?.location.origin ?? "";
  const set = new Set(extra.map(normalizePath));
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    if (set.size >= MAX_ROUTES) break;
    try {
      const u = new URL(a.getAttribute("href") ?? "", doc.baseURI);
      if (u.origin === origin && /^https?:$/.test(u.protocol)) set.add(normalizePath(u.pathname));
    } catch {
      /* ignore malformed */
    }
  }
  return Array.from(set).slice(0, MAX_ROUTES);
}
