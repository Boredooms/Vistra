"use client";

import { gsap } from "gsap";
import { useEffect, useRef } from "react";

/** Word-by-word reveal on first paint. Text is fully visible without JS and with reduced motion. */
export function HeroTitle({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const words = el.querySelectorAll("[data-w]");
    const tl = gsap.fromTo(words, { yPercent: 105 }, { yPercent: 0, duration: 1.05, ease: "expo.out", stagger: 0.06, delay: 0.05 });
    return () => { tl.kill(); gsap.set(words, { clearProps: "all" }); };
  }, []);
  return (
    <h1 ref={ref} className={className} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <span data-w className="inline-block">{w}&nbsp;</span>
        </span>
      ))}
    </h1>
  );
}
