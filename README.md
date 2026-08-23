# Universal Chatbot Factory

One application that procedurally manufactures any number of domain-specialized chatbots — from a single bot to thousands — all sharing **one** frontend, **one** backend, **one** SQLite database, and **one** local AI model (with optional cloud AI for current-information questions).

Every generated bot is genuinely different: its own domain and specialty, personality, system prompt, guardrails, starter questions, welcome message, and a full visual "Design DNA" (theme, layout, message style, background). A bot's domain is a **behavioral constraint**, not just a label — each bot politely refuses questions outside its specialty.

---

## What makes it interesting

- **Procedural generation at scale.** Set a quantity (1–5000) and the factory forges that many bots in one bulk database transaction.
- **Custom bot creator (⭐ flagship).** Describe any bot in plain English — the AI designs the name, personality, prompts, theme, and starters; regenerate any part until it feels right.
- **Domain Guard.** A five-layer relevance check (greetings → evidence → redirect → context → LLM classifier) keeps each bot on-topic with an explainability panel.
- **Hybrid AI routing.** Normal questions use the local GGUF model; current-info questions route to web-enabled cloud AI; every provider down still degrades gracefully.
- **RAG knowledge base.** Upload PDF/DOCX/TXT/CSV/JSON or crawl a URL — the bot answers with cited sources.
- **SSE token streaming** with an animated cursor and a graceful non-streaming fallback.
- **Prisma ORM with a 14-model enterprise schema** — bots, conversations, messages, users, organizations, knowledge bases, analytics, agent sessions, versions, and widget configs.
- **Auth & multi-tenancy** — JWT with refresh rotation, RBAC, isolated workspaces, invite codes, usage quotas with 80% warn / 100% block.
- **Analytics** — recharts dashboards, live 5s polling, CSV/SVG export.
- **NLU & guardrails** — intents, entities, sentiment, language, PII redaction, toxicity, prompt-injection blocking, moderation dashboard.
- **Human-in-the-loop** — agent queue, AI co-pilot suggestions, canned responses, internal notes.
- **Embeddable widget** — one `<script>` tag puts any bot on any website.
- **Security hardening** — helmet headers, CORS allowlist, rate limiting, Zod validation, central error handler.

---

## Prerequisites

- **Node.js 18+** (for the frontend and backend)
- **Python 3.9+** (only if you want the local model; optional)
- The local model file at `models/llm-model.gguf` (optional — cloud AI is used if it is absent)

---

## Quick start (Windows, one click)

```bat
npm install        # first time only
start_all.bat
```

This opens three windows — the local LLM server, the backend API, and the frontend. When the **frontend** window prints a `Local:` URL (usually `http://localhost:5173`), open it in your browser.

> **Fresh clone?** The SQLite database is git-ignored. Run `npm run prisma:migrate` once before the first start to create it (see below).

## Manual start (any OS, three terminals)

```bash
# 0) First time only: install dependencies + create the database
npm install
npm run prisma:migrate    # applies prisma/migrations (SQLite file in data/)

# 1) (Optional) local model server — Windows
install_deps.bat      # first time only, sets up the Python venv
start_llm.bat         # serves models/llm-model.gguf on port 8000

# 2) Backend API (Express + Prisma) on port 3001
npm run server

# 3) Frontend (Vite) on port 5173
npm run dev
```

Then open the URL Vite prints.

---

## Configuration

Copy the template and add your keys:

```bash
copy .env.example .env    # Windows   (cp on macOS/Linux)
```

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `auto` (recommended), `local`, `groq`, or `gemini` |
| `GROQ_API_KEY` | Enables web-enhanced answers + cloud fallback (optional) |
| `GEMINI_API_KEY` | Secondary web/fallback provider + vision (optional) |
| `PORT` | Backend port (default `3001`) |
| `LOCAL_LLM_URL` | Where the Python model server listens |
| `DATABASE_URL` | SQLite file for Prisma (default `file:../data/chatbot_factory.db`) |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API cross-origin (optional) |
| `JWT_SECRET` | Signs access/refresh tokens — **change in production** |
| `BOOTSTRAP_ADMIN_EMAIL/PASSWORD` | First-run admin account (defaults: `admin@factory.local` / `admin123`) |

**Security:** `.env` holds live secrets and is git-ignored. Keys are read only by the backend — they are never sent to the browser. Do not commit `.env` or the `data/` folder.

---

## How a message is handled

```
user message + history + bot profile
        │
        ▼
   DOMAIN GUARD ──(off-topic)──► polite redirect (no AI call)
        │ (on-topic)
        ▼
   needs current info?
    ├─ no  ──► LOCAL model  ──(if down)──► Groq → Gemini
    └─ yes ──► Groq web     ──(if down)──► Gemini → local
        │
        ▼
   answer + provider label (Local AI / Cloud AI / Web-enhanced / Domain Guard)
        │
        ▼
   persisted to SQLite
```

---

## Architecture

```
src/                     React 19 + Vite + TypeScript
  pages/                 Dashboard, Factory, Library, Chat, Auth, Settings,
                         OrgSettings, KB, Analytics, Moderation, Agent,
                         Templates, BotEditor, FlowBuilder, WidgetConfig,
                         Search, Share
  components/            ui/ (Button, Modal, Drawer, Card, Skeleton, ...)
                         layout/ (AppShell, Sidebar, TopBar), CommandPalette,
                         CustomBotCreator, OnboardingTour, ShortcutsOverlay
  auth/                  AuthContext, token storage
  services/db.ts         typed API client (auth headers, auto-refresh)
backend/
  app.js                 Express app factory (importable for tests)
  server.js              entry point — bootstrap + listen
  routes/                health, auth, orgs, bots, customBot, templates,
                         handoff, conversations, intelligence, search, share,
                         rag, analytics, moderation, public, widget, chat
  services/              generator, domainGuard, llmService, currentInfo,
                         auth, org, audit, bot, conversation, chat, customBot,
                         builder, engines, nlu, tools, agent, rag, analytics,
                         share, intelligence, templates
  middleware/            validate (Zod), rateLimits, errorHandler, auth (JWT/RBAC)
  db.js                  data-access layer on Prisma (camelCase contract)
prisma/
  schema.prisma          14-model enterprise schema (SQLite default)
  migrations/            versioned migration history
scripts/
  migrate-legacy-data.mjs  one-time better-sqlite3 → Prisma import
  seed-demo.mjs            demo mode — fill the workspace with data
docker/                  Dockerfile + docker-compose (optional path)
docs/
  architecture.md        stack diagram + decisions + demo flow
  adr/                   Architecture Decision Records
tests/
  unit/                  vitest (NLU, guardrails, generator, tools)
  integration/           supertest against an isolated test DB
widget/                  (served by backend: /widget.js + /widget/:botId)
data/                    SQLite database (created at runtime, git-ignored)
```

**Security layers** (all active in dev too): helmet security headers, CORS allowlist (`CORS_ORIGINS`), per-IP rate limiting (300 req/min general, 60 req/min AI, 20 req/min auth), Zod validation of every request body, and a central error handler that returns consistent JSON without leaking internals.

**Database:** Prisma ORM over SQLite (zero-config, demo-safe). The schema is provider-portable — switching to PostgreSQL means changing the datasource provider and `DATABASE_URL`, then re-migrating. `npm run prisma:studio` opens the ORM's GUI to inspect data.

**Tests:** `npm test` runs the suite (unit + integration) against a throwaway test database; `npm run seed` fills the workspace with demo data (bots, conversations, feedback, analytics history) so the evaluation never starts from an empty screen.

---

## Troubleshooting

- **"Could not reach the factory backend"** — the backend isn't running. Start it with `npm run server` (port 3001).
- **Answers say the local model was unavailable** — the Python server on port 8000 isn't up, or the model file is missing. Run `start_llm.bat`, or set a `GROQ_API_KEY` in `.env` so cloud AI answers instead.
- **Bots don't appear after generating** — confirm the backend window shows no errors and that `data/` is writable.
- **Port already in use** — change `PORT` in `.env` (backend) or run Vite on another port with `npm run dev -- --port 5174`.

See `PRESENTATION.md` for a ready-to-follow demo script and verification checklist.
