// Builds the unpacked extension into dist/. Load it at chrome://extensions (Developer mode > Load unpacked).
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const e2e = process.argv.includes("--e2e");
// --e2e: test build with <all_urls> pre-granted so Playwright needs no permission prompt. Never ship it.
const out = e2e ? "dist-e2e" : "dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = { bundle: true, target: "chrome116", minify: process.argv.includes("--minify"), sourcemap: false, logLevel: "info" };
await build({ ...common, entryPoints: { background: "src/background.ts", popup: "src/popup.ts", options: "src/options.ts" }, outdir: out, format: "esm" });
// content scripts cannot be ES modules
await build({ ...common, entryPoints: { content: "src/content.ts" }, outdir: out, format: "iife" });
cpSync("static", out, { recursive: true });
if (e2e) {
  const m = JSON.parse(readFileSync(`${out}/manifest.json`, "utf8"));
  m.host_permissions = ["<all_urls>"];
  m.name += " (e2e)";
  writeFileSync(`${out}/manifest.json`, JSON.stringify(m, null, 2));
}

// Monochrome blob icon, generated so the repo carries no binary assets.
function png(size) {
  const px = Buffer.alloc((size * 4 + 1) * size);
  const c = size / 2, r = size * 0.42;
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const a = Math.atan2(y - c, x - c);
      const rr = r * (1 + 0.07 * Math.sin(3 * a) + 0.04 * Math.cos(2 * a));
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const alpha = Math.max(0, Math.min(1, rr - d + 0.5));
      const dot = d < size * 0.09 ? 0 : 245;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      px[o] = px[o + 1] = px[o + 2] = dot; px[o + 3] = Math.round(alpha * 255);
    }
  }
  const crc = (buf) => { let c2 = ~0; for (const b of buf) { c2 ^= b; for (let k = 0; k < 8; k++) c2 = (c2 >>> 1) ^ (0xedb88320 & -(c2 & 1)); } return ~c2 >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(px)), chunk("IEND", Buffer.alloc(0))]);
}
for (const s of [16, 48, 128]) writeFileSync(`${out}/icon${s}.png`, png(s));
console.log("extension built ->", out);
