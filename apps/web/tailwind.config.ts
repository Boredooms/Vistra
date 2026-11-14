import type { Config } from "tailwindcss";

// Monochrome design tokens (OKLCH, chroma 0). Functional status hues are the only chroma in the product.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "oklch(0.118 0 0)", // sidebar / outer layer
        bg: "oklch(0.145 0 0)",
        "chart-1": "oklch(0.95 0 0)",
        "chart-2": "oklch(0.74 0 0)",
        "chart-3": "oklch(0.55 0 0)",
        "chart-4": "oklch(0.40 0 0)",
        raised: "oklch(0.185 0 0)",
        panel: "oklch(0.215 0 0)",
        hover: "oklch(0.26 0 0)",
        line: "oklch(1 0 0 / 0.09)",
        "line-strong": "oklch(1 0 0 / 0.18)",
        ink: "oklch(0.975 0 0)",
        muted: "oklch(0.74 0 0)",
        subtle: "oklch(0.62 0 0)",
        ok: "oklch(0.8 0.15 160)",
        warn: "oklch(0.82 0.13 85)",
        bad: "oklch(0.72 0.17 25)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        display: ["clamp(2.75rem, 7.2vw, 5.75rem)", { lineHeight: "0.98", letterSpacing: "-0.035em", fontWeight: "600" }],
        h2: ["clamp(1.9rem, 4vw, 3.1rem)", { lineHeight: "1.04", letterSpacing: "-0.03em", fontWeight: "600" }],
      },
      transitionTimingFunction: { out: "cubic-bezier(0.16, 1, 0.3, 1)" },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        blob: {
          "0%,100%": { borderRadius: "46% 54% 58% 42% / 48% 44% 56% 52%" },
          "50%": { borderRadius: "56% 44% 42% 58% / 54% 56% 44% 46%" },
        },
      },
      animation: { shimmer: "shimmer 1.4s infinite", blob: "blob 9s ease-in-out infinite" },
    },
  },
  plugins: [],
};
export default config;
