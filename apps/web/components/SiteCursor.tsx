"use client";

import { gsap } from "gsap";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Figma-style pointer: a dot with a name pill that follows the real pointer with eased lag.
 * Elements can opt into a label with data-cursor="Open". Fine pointers + no reduced-motion only;
 * everywhere else the system cursor is untouched.
 */
export function SiteCursor() {
  const path = usePathname();
  const dot = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  const on = !path.startsWith("/dashboard") && !path.startsWith("/sign-");

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!on || !fine || calm || !dot.current || !tag.current) return;
    const root = document.documentElement;
    root.classList.add("has-site-cursor");
    const d = dot.current;
    const t = tag.current;
    const dx = gsap.quickTo(d, "x", { duration: 0.12, ease: "power3.out" });
    const dy = gsap.quickTo(d, "y", { duration: 0.12, ease: "power3.out" });
    const tx = gsap.quickTo(t, "x", { duration: 0.45, ease: "power3.out" });
    const ty = gsap.quickTo(t, "y", { duration: 0.45, ease: "power3.out" });
    let label = "";
    const move = (e: PointerEvent) => {
      dx(e.clientX);
      dy(e.clientY);
      tx(e.clientX + 14);
      ty(e.clientY + 16);
      gsap.to(d, { opacity: 1, duration: 0.2, overwrite: "auto" });
    };
    const over = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      const hit = el.closest("[data-cursor]") as HTMLElement | null;
      const interactive = el.closest("a,button,[role=button],summary,label");
      const next = hit?.dataset.cursor ?? "";
      if (next !== label) {
        label = next;
        t.textContent = next;
        gsap.to(t, { opacity: next ? 1 : 0, scale: next ? 1 : 0.8, duration: 0.2, ease: "power2.out" });
      }
      gsap.to(d, { scale: interactive || hit ? 2.6 : 1, duration: 0.25, ease: "power3.out", overwrite: "auto" });
    };
    const leave = () => gsap.to([d, t], { opacity: 0, duration: 0.2 });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerover", over, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      root.classList.remove("has-site-cursor");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerover", over);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, [on, path]);

  if (!on) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[90]">
      <div ref={dot} className="absolute -left-[5px] -top-[5px] h-[10px] w-[10px] rounded-full bg-white opacity-0 mix-blend-difference" />
      <div ref={tag} className="absolute left-0 top-0 rounded-full rounded-tl-sm bg-white px-2.5 py-1 text-[11px] font-semibold text-black opacity-0" />
    </div>
  );
}
