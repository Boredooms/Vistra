import { Show } from "@clerk/nextjs";
import Link from "next/link";

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight" data-cursor="Home">
      <span aria-hidden className="grid h-6 w-6 place-items-center rounded-[7px] bg-ink">
        <svg width="12" height="12" viewBox="0 0 28 28"><path d="M3 2 L3 22 L8.5 17 L12.5 26 L16 24.5 L12 15.5 L19.5 15.5 Z" fill="#0a0a0a" /></svg>
      </span>
      vistra
    </Link>
  );
}

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-md [background:oklch(0.145_0_0/0.8)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Wordmark />
        <nav aria-label="Main" className="hidden items-center gap-8 text-sm text-muted md:flex">
          <Link href="/features" data-vistra-target="site.features" className="hover:text-ink">Features</Link>
          <Link href="/packages" data-vistra-target="site.packages" className="hover:text-ink">Packages</Link>
          <Link href="/security" data-vistra-target="site.security" className="hover:text-ink">Security</Link>
          <Link href="/docs" data-vistra-target="site.docs" className="hover:text-ink">Docs</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Show when="signed-out">
            <Link href="/sign-in" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink">Sign in</Link>
            <Link href="/sign-up" data-vistra-target="site.start" data-cursor="Free" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg transition-colors hover:bg-white">Get started</Link>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard" data-vistra-target="site.dashboard" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg hover:bg-white">Dashboard</Link>
          </Show>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const cols: Array<[string, Array<[string, string]>]> = [
    ["Product", [["Features", "/features"], ["Packages", "/packages"], ["Security", "/security"], ["Dashboard", "/dashboard"]]],
    ["Developers", [["Quickstart", "/docs#quickstart--top"], ["SDK reference", "/docs#sdk-reference--top"], ["Security", "/docs#actions-and-security--top"]]],
    ["Account", [["Sign in", "/sign-in"], ["Create account", "/sign-up"]]],
  ];
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted">An agent for your product that answers with citations, points with a real cursor, and acts only with approval.</p>
        </div>
        {cols.map(([h, links]) => (
          <div key={h}>
            <h2 className="text-sm font-medium">{h}</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              {links.map(([l, href]) => <li key={l}><Link href={href} className="hover:text-ink">{l}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-6 text-xs text-subtle">
        <span>&copy; {new Date().getFullYear()} VISTRA. Open beta.</span>
        <span>Understand. Guide. Execute.</span>
      </div>
    </footer>
  );
}
