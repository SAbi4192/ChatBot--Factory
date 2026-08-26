# Render Deployment Plan — Chatbot Factory (Scarlet)

## Goal
Deploy the project to Render as a single Web Service from the existing GitHub repo `SAbi4192/ChatBot--Factory` (commit `v5`). The repo root is the deploy root; the verified `render-deploy/` package serves as a backup reference.

## Decisions (confirmed with user)
- **Database:** Fresh DB (free, demo use). Push code only — DB not committed. Render creates schema via migrations on first deploy; data resets on redeploy.
- **GitHub:** Repo `SAbi4192/ChatBot--Factory` already exists with commit `v5` pushed — no new repo needed.
- **Service type:** One Web Service (Express serves API + frontend from `dist/` + widget + SPA fallback).
- **Node version:** `NODE_VERSION=22.22.0` — **required, not optional**: `better-sqlite3@13.0.3` declares `engines: node >=22` (verified in its package.json), and Vite 8.2.2 requires `>=20.19.0 || >=22.12.0` (verified). Pinned exactly via the `NODE_VERSION` env var so Render never silently picks a different Node. Do NOT use Node 20 (fails better-sqlite3 engine check).

## Prerequisite check (already done)
- Local `main` at commit `v5` (6408a1e) pushed to `origin/main` on `SAbi4192/ChatBot--Factory`.
- Repo content (all tracked files) matches the content tested in the `render-deploy/` package — same source, same domain knowledge, same prisma schema/migrations, same frontend.
- `render-deploy/` package (207 files, verified byte-for-byte) and `render-deploy.zip` (2.31 MB) are available as a verified backup of the deployable source — but the actual deployment uses the repo root directly.
- `render-deploy/.gitignore` correctly excludes `node_modules`, `dist`, `.env`, `data/`, `*.db`, `models/*.gguf`.
- Server listens on `process.env.PORT` (server.js:9). No code changes needed.

---

## Step 1 — Verify the repo is pushed to GitHub (DONE)
Your repo `https://github.com/SAbi4192/ChatBot--Factory.git` is already the `origin` remote of this project. Commit `v5` (6408a1e) is pushed to `origin/main` and contains all the source code tested in the render-deploy package (domain knowledge, prisma migrations, all backend routes/services, frontend, tests, docker, etc.). No action needed.

> The `.gitignore` already excludes `data/`, `*.db`, `.env`, `node_modules`, `dist`, `models/*.gguf` from git — so the repo on GitHub contains only source code, matching the user's fresh-DB choice. `.env.example` IS committed (placeholders only).

---

## Step 2 — Create the Web Service on Render
1. Log in to https://dashboard.render.com (sign up with GitHub if new).
2. **New + → Web Service → Connect a repository** → select `SAbi4192/ChatBot--Factory`.
3. Service settings:
   - **Name:** `chatbot-factory` (or similar)
   - **Region:** any (e.g. Frankfurt / Oregon)
   - **Runtime:** `Node` — exact version pinned via the `NODE_VERSION` env var (see Step 3), not the dashboard dropdown
   - **Root Directory:** `/` (repo root)
   - **Build Command:** `npm ci && npx prisma generate && npm run build`
   - **Start Command:** `mkdir -p data && npx prisma migrate deploy && node backend/server.js`
     - **`mkdir -p data` is required (verified):** Prisma resolves the SQLite `file:` URL **relative to `prisma/schema.prisma`** — `DATABASE_URL="file:../data/chatbot_factory.db"` (in `.env` and the Render env) therefore opens `<repo-root>/data/chatbot_factory.db`. `data/` is git-ignored, so the fresh clone has no `data/` dir, and Prisma's SQLite driver does **not** create parent directories (verified: only `rag.service.js:22` calls `mkdirSync`, for `backend/data/uploads`). Without `mkdir -p data`, the first `migrate deploy` fails with "unable to open database file". The command runs from the repo root on Render, so `mkdir -p data` creates exactly the directory Prisma expects.
     - **Fail-fast (no `db push` fallback):** the original `2>/dev/null || npx prisma db push --accept-data-loss` was a Docker-volume hack for pre-existing DBs with schema drift. On Render the DB is always fresh (or a known migration history), so `migrate deploy` either succeeds or the deploy fails loudly — masking failures with `db push` could silently desync the schema. If a deploy fails here, the DB migration history is the problem, and it should be fixed rather than bypassed.
   - **Instance Type:** Free (512 MB RAM / 1 GB disk) — sufficient, no local model
   - **Health Check Path (optional):** `/api/health` (returns `{ok:true,...}`, HTTP 200)

---

## Step 3 — Environment variables (in Render → Environment tab)
| Variable | Value |
|---|---|
| `NODE_VERSION` | `22.22.0` — **exact pin**; Render uses this to select the runtime/build Node (satisfies Vite's `>=22.12.0` and better-sqlite3's `>=22` floors) |
| `GROQ_API_KEY` | your `gsk_…` key (recommended → cloud AI works) |
| `GEMINI_API_KEY` | your key (optional secondary) |
| `JWT_SECRET` | a long random string (e.g. `openssl rand -hex 32` locally) |
| `AI_PROVIDER` | `auto` (default; normal→local-then-Groq, current-info→Groq web) |
| `CORS_ORIGINS` | *(optional)* comma-separated external widget origins |
| `DATABASE_URL` | `file:../data/chatbot_factory.db` — Render's `PORT` is injected automatically |

> **Do NOT set `NODE_ENV=production`** — it causes `npm ci` to skip devDependencies (`tsc`, `vite`, `prisma`), breaking the build. The Dockerfile sets `NODE_ENV=production` after `npm ci`, not before. Render's build phase runs without it, and the app doesn't need it at runtime.

No `.env` file is needed — Render injects these.

> **Secrets warning:** the local `.env` (git-ignored, never pushed) currently holds **live Groq and Gemini API keys**. Do NOT paste them into this plan file, the repo, or the deployment package. When configuring Render, open `.env` and copy the actual key values directly into Render's Environment tab (Render stores them encrypted; they are never committed).

---

## Step 4 — Deploy & verify
1. Click **Create Web Service** → Render runs the build, then starts the app.
2. Open the service URL: `https://chatbot-factory.onrender.com`
   - Login page should render (SPA served by Express).
3. First launch creates a fresh empty DB (migrations applied). **No bootstrap admin is created on an empty DB** — use the **Register** page to create your personal workspace + org, then generate bots via the **Factory** page. (No Render Shell / seed procedure needed; the seed flow was removed because Render Shell is not reliably available on the free tier.)

4. Smoke checks:
   - `GET /api/health` → `{"ok":true,...}` with `groq:true` if you set the key
   - Register/login → generate a bot → send a chat → reply streams or answers via Groq
   - `GET /widget.js` → 200
   - `GET /widget/<botId>` → renders the embeddable widget iframe

---

## Step 5 — Future code updates
Render auto-deploys on every push to `main` (or use **Manual Deploy → Deploy latest commit** to re-run the build). Because `data/` is git-ignored, each deploy starts from a fresh empty DB unless you set up a Persistent Disk (see Notes). If you make local changes, commit and push them from the project root — Render rebuilds and restarts automatically.

---

## Notes / risks
- **Free tier disk:** the free plan's ephemeral disk (~1 GB) holds: git clone (~102 MB) + source (~2 MB) + `node_modules` after `npm ci` (~664 MB) + `dist` (~2 MB) ≈ **770 MB — fits but tight**. If a deploy fails with "no space left", switch to Starter plan. The runtime DB stays small (~MBs) until real usage.
- **`data/` directory does not exist in git:** it's git-ignored, so the start command must create it (`mkdir -p data`) before Prisma opens the SQLite file — already included in the Start Command above. Same for `backend/data/uploads`, which `rag.service.js` auto-creates at module load.
- **Free tier spin-down:** Render free services spin down after 15 min of inactivity. The first request after idle triggers a cold start (~30–60s). Upgrade to a paid plan (Starter, $7/mo) for always-on + Persistent Disk support.
- **Ephemeral disk:** On the free plan, `data/chatbot_factory.db` lives on Render's ephemeral filesystem — data resets on every redeploy/restart. Acceptable for demo. For persistence later: attach a **Persistent Disk** ($7/mo) mounted at `/var/data`, set `DATABASE_URL=file:/var/data/chatbot_factory.db`, and upload the real DB once via Render Shell.
- **No local GGUF:** `models/` is not deployed. The router gracefully falls back local → Groq → Gemini → profile intro. With `GROQ_API_KEY` set, all real questions are answered by cloud AI; the app is fully functional without the 2 GB model.
- **better-sqlite3 (verified):** devDependency (tests only, not used by build/runtime). v13.0.3 requires `node >=22` and ships platform-specific N-API prebuilds **inside the npm tarball** (`prebuilds/linux-x64.node`; `lib/binding.js` loads the shipped prebuild; `gypfile: false`, no install script) → `npm ci` on Render (Linux x64, Node 22) extracts the prebuilt binary directly and does **not** run node-gyp. The workspace installation on this machine (Windows, Node 24) also uses the shipped prebuilds successfully. Clean-install failure on Node 24 was a local node-gyp/VS-toolchain artifact, not a package problem. Pin to 22 LTS for certainty.
- **Widget on external sites:** add those origins to `CORS_ORIGINS`.

## Validation
- [ ] Repo `SAbi4192/ChatBot--Factory` shows `v5` on `main`; `git status` shows no `.env`, `data/`, `node_modules`, `models`, `dist` tracked
- [ ] Render build succeeds on **Node 22.22.0** (npm ci → prisma generate → npm run build; no node-gyp for better-sqlite3)
- [ ] Service boots; `GET /api/health` returns 200 `{ok:true}`
- [ ] SQLite path verified: `data/chatbot_factory.db` exists at the repo root after first boot (Start Command's `mkdir -p data` + `migrate deploy` created it)
- [ ] Register → generate bot → chat answers (profile intro without key, cloud AI with Groq/Gemini keys set)
- [ ] Frontend `/` serves the built SPA (200)
- [ ] Widget: `GET /widget.js` → 200; `GET /widget/<botId>` renders iframe
- [ ] RAG: upload a small PDF/TXT → document status becomes `ready`
- [ ] No API key values appear in the repo, Render logs, or plan file
