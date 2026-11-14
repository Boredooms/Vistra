/** Route matching for multi-page guides. Patterns: "*", "/team", "/projects/[id]", "/projects/:id", "/docs/*". */
export function normalizePath(p: string): string {
  const path = (p.split(/[?#]/)[0] ?? "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/$/, "") : path || "/";
}

export function routeMatches(pattern: string | undefined | null, path: string): boolean {
  if (!pattern || pattern === "*") return true;
  const pat = normalizePath(pattern);
  const cur = normalizePath(path);
  if (pat.endsWith("/*")) {
    const base = pat.slice(0, -2) || "/";
    return cur === base || cur.startsWith(base === "/" ? "/" : base + "/");
  }
  const ps = pat.split("/");
  const cs = cur.split("/");
  if (ps.length !== cs.length) return false;
  return ps.every((seg, i) => /^\[.+\]$|^:.+$/.test(seg) || seg === cs[i]);
}

/** Same-origin links that lead to `route`, best first (visible, shortest text). */
export function linksToRoute(doc: Document, route: string, isVisible: (el: Element) => boolean): HTMLAnchorElement[] {
  const origin = doc.defaultView?.location.origin ?? "";
  const out: HTMLAnchorElement[] = [];
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    let url: URL;
    try {
      url = new URL(a.getAttribute("href") ?? "", doc.baseURI);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    if (routeMatches(route, url.pathname) && isVisible(a)) out.push(a);
  }
  return out.sort((x, y) => (x.textContent ?? "").trim().length - (y.textContent ?? "").trim().length);
}
