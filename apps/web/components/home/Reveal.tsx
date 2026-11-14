"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, type ElementType, type ReactNode } from "react";

/** Scroll reveal that keeps content visible by default: it only animates elements still below the fold on mount. */
export function Reveal({ children, as: Tag = "div", className, delay = 0, y = 28 }: { children: ReactNode; as?: ElementType; className?: string; delay?: number; y?: number }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return; // already visible: leave it alone
    const tween = gsap.fromTo(el, { y, opacity: 0, filter: "blur(6px)" }, {
      y: 0, opacity: 1, filter: "blur(0px)", duration: 0.9, delay, ease: "expo.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
    return () => { tween.scrollTrigger?.kill(); tween.kill(); gsap.set(el, { clearProps: "all" }); };
  }, [delay, y]);
  return <Tag ref={ref} className={className}>{children}</Tag>;
}
