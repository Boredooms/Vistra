import type { Config } from "tailwindcss";

const v = (n: string) => `var(--${n})`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), panel: v("panel"), ink: v("ink"), muted: v("muted"), line: v("line"),
        accent: v("accent"), "accent-soft": v("accent-soft"), ok: v("ok"), danger: v("danger"), warn: v("warn"),
      },
    },
  },
  plugins: [],
};
export default config;
