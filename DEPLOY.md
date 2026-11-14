# Deploying VISTRA from scratch

Three deployables plus one package release. They are separate on purpose:

| Piece | Where | Root | Who it is |
|---|---|---|---|
| API (FastAPI + LangGraph + worker) | Render (Docker) | `render.yaml` | VISTRA itself |
| Website + dashboard (`apps/web`) | Vercel project `vistra-web` | `apps/web` | VISTRA itself (Clerk sign-in, apps, keys, knowledge, logs) |
| Acme demo (`apps/demo`) | Vercel project `vistra-acme-demo` | `apps/demo` | A *customer* of VISTRA. It only knows an app ID + API key |
| `@boredooms/vistra-sdk`, `@boredooms/vistra-ghost-cursor` | npm | `packages/*` | What any customer site installs |
| Extension | GitHub Actions artifact / release zip | `apps/extension` | Runs VISTRA on sites you enable |

Acme and VISTRA are different sites with different origins. Acme never sees VISTRA's database or Clerk: it holds one
`sdk:session` API key on its server and mints short-lived session tokens for its browser.

Supabase (Tokyo project), Upstash Redis and Clerk are already set up and migrated (0001-0008). Production uses the same
values that are in your local `c:\vistra\.env`. Nothing new has to be created in Supabase.

## Live now

| | URL |
|---|---|
| API | https://vistra-api.onrender.com (`/readyz`) |
| Website + dashboard | https://vistra-web.vercel.app |
| Acme demo | https://vistra-acme-demo.vercel.app (connect on `/setup`) |
| npm | `@boredooms/vistra-sdk`, `@boredooms/vistra-ghost-cursor` (0.1.0) |

Redeploy from the CLI: `scripts/deploy/render_create.ps1` (first time) and `scripts/deploy/vercel_config.ps1`, then `vercel deploy --prod` from the repo root with `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` from `apps/<app>/.vercel/project.json`.

## 1. API on Render (do this first: everything else needs its URL)

1. render.com → **New → Blueprint** → connect GitHub repo `Boredooms/Vistra` → it reads `render.yaml` → service `vistra-api`.
2. Fill the `sync: false` variables. Copy each value from your local `.env`:

   | Variable | Value |
   |---|---|
   | `SUPABASE_DB_URL` | the Tokyo pooler URL, **port 5432** (session mode) |
   | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | from `.env` |
   | `REDIS_URL` | Upstash `rediss://...` from `.env` |
   | `GEMINI_API_KEY`, `NVIDIA_API_KEY` | from `.env` |
   | `CLERK_SECRET_KEY`, `CLERK_ISSUER`, `CLERK_JWKS_URL` | from `.env` |
   | `TOOL_SIGNING_SECRET`, `ENCRYPTION_KEY` | from `.env` (**must stay identical**, or stored tool secrets cannot be decrypted) |
   | `CORS_ALLOWED_ORIGINS` | `https://vistra-web.vercel.app,https://vistra-acme-demo.vercel.app` (your real Vercel URLs, comma separated, no trailing slash) |
   | `APP_URL` | `https://vistra-web.vercel.app` |
   | `API_URL` | `https://vistra-api.onrender.com` (shown by Render after the first deploy) |

3. Deploy. Check `https://vistra-api.onrender.com/readyz` returns `{"status":"ready"}`.
   Free plan sleeps after 15 min idle; the first request then takes about 50 s. Use a paid plan for demos.

## 2. Website + dashboard on Vercel

vercel.com → **Add New → Project** → import `Boredooms/Vistra` → **Root Directory `apps/web`** (framework Next.js, pnpm is detected from the lockfile). Environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_VISTRA_API_URL`, `VISTRA_API_URL` | `https://vistra-api.onrender.com` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | from `apps/web/.env.local` |
| `VISTRA_API_KEY` | the website's own `sdk:session` key (`WEB_VISTRA_API_KEY` in `.env`) |
| `NEXT_PUBLIC_VISTRA_APP_ID` | `app_vistra_web` |
| `NEXT_PUBLIC_SITE_URL` | `https://vistra-web.vercel.app` |
| `NEXT_PUBLIC_NPM_PUBLISHED` | `1` once the packages are on npm |

Clerk dashboard → your instance → **Domains / Allowed origins**: add the Vercel URL. A development instance works on
`*.vercel.app` (with Clerk's dev banner); create a production instance when you have your own domain.

## 3. Acme demo on Vercel (a separate project)

Import the same repo again → **Root Directory `apps/demo`**. Environment variables:

| Variable | Value |
|---|---|
| `DEMO_DATABASE_URL` | from `apps/demo/.env.local` |
| `NEXT_PUBLIC_VISTRA_DASHBOARD_URL` | `https://vistra-web.vercel.app/dashboard` |
| `VISTRA_API_URL` (optional) | `https://vistra-api.onrender.com` |
| `VISTRA_API_KEY`, `NEXT_PUBLIC_VISTRA_APP_ID`, `TOOL_SIGNING_SECRET` (optional) | only to preconfigure. Otherwise paste on `/setup` |

Then connect it the way a real customer would:

1. In the dashboard, open your app (for example `app_130aacee2981`). Under **Allowed origins** type the demo origin
   (`https://vistra-acme-demo.vercel.app`, and `http://localhost:3001` for local) and **click + Add**: typing alone saves nothing.
2. Keys page → **Website widget (server)** preset → copy the key (shown once).
3. Optional, for actions: set the app's **Tool base URL** to `https://vistra-acme-demo.vercel.app` → **Generate** a tool secret → copy it.
4. Open `https://vistra-acme-demo.vercel.app/setup` → paste API URL, App ID, key (and tool secret) → **Verify and save**.
   The page checks the key, the app and the origin against the live API and shows the exact fix if one is wrong.
   The live panel on that page pings the backend every 5 s and lists every call the assistant makes, in real time.

## 4. npm packages

The publish blocked on npm's browser 2FA prompt: the token that was used can read but cannot skip 2FA for writes. Pick one:

- **CI (recommended):** npmjs.com → Access Tokens → **Generate New Token → Granular**, packages and scopes `@vistra`, Read and write,
  tick **Bypass two-factor authentication**. GitHub repo → Settings → Secrets → Actions → `NPM_TOKEN`. Then:
  `git tag v0.1.0 && git push origin v0.1.0` → workflow `release` publishes both packages and attaches the extension zip.
- **Manually:** `cd packages/ghost-cursor && pnpm publish --access public` (approve in the browser), then the same in `packages/sdk-core`.

## 5. Extension

GitHub → Actions → latest **ci** run → artifact `vistra-extension-unpacked`, or `pnpm --filter @vistra/extension build`.
Chrome/Edge → `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`.

1. Copy the origin shown on the extension's Settings page (`chrome-extension://<id>`; the ID is different on every
   machine for unpacked builds) → add it under the app's **Allowed origins** in the dashboard.
2. Keys page → **Browser extension** preset → paste the key, the App ID and the API URL into the extension Settings → **Save and test**.
   For a Render API URL the extension asks for permission to reach that host. Accept it.
3. On any site: toolbar icon → **Enable on this site** → the blob appears. **Explain this page** sends a screenshot.

## 6. Adding VISTRA to any site (what a customer does)

```bash
npm i @boredooms/vistra-sdk
```

```ts
import { Vistra, mountWidget } from "@boredooms/vistra-sdk";

const vistra = Vistra.init({
  appId: "app_xxx",
  apiUrl: "https://vistra-api.onrender.com",
  // your server route that calls POST /v1/sdk/sessions with your sdk:session key (never ship the key to the browser)
  getSessionToken: (prev) => fetch("/api/vistra/session", { method: "POST", body: JSON.stringify({ session_id: prev?.session_id }) }).then((r) => r.json()),
});
mountWidget(vistra, { citationHref: (c) => `/docs#${c.anchor}` });
```

`apps/demo/app/api/vistra/session/route.ts` is a complete server route to copy.

## Checklist of origins and keys

| Where | Add |
|---|---|
| Dashboard → app → Allowed origins | every site origin that embeds the widget (demo Vercel URL, `http://localhost:3001`), and `chrome-extension://<id>` for the extension |
| Render `CORS_ALLOWED_ORIGINS` | the website and demo Vercel URLs (browser calls go straight to the API) |
| Clerk → allowed origins | the website's Vercel URL |
| Dashboard → Keys | one *Website widget (server)* key per site, one *Browser extension* key per browser |

Rotate every credential that was pasted into chat (Supabase, Clerk, Gemini, NVIDIA, Upstash, QStash, the `vsk_live_...`
key and the npm token) once deployment works.
