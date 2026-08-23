# Universal Chatbot Factory

One application that procedurally manufactures any number of domain-specialized chatbots — from a single bot to thousands — all sharing **one** frontend, **one** backend, **one** SQLite database, and **one** local AI model (with optional cloud AI for current-information questions).

Every generated bot is genuinely different: its own domain and specialty, personality, system prompt, guardrails, starter questions, welcome message, and a full visual "Design DNA" (theme, layout, message style, background). A bot's domain is a **behavioral constraint**, not just a label — each bot politely refuses questions outside its specialty.

---

## What makes it interesting

- **Procedural generation at scale.** Set a quantity (1–5000) and the factory forges that many bots in one bulk database transaction.
- **Domain Guard.** A two-layer relevance check (deterministic keyword/intent matching, then an LLM yes/no fallback) keeps each bot on-topic. Off-topic questions get a friendly redirect and cost no AI call.
- **Hybrid AI routing.** Normal questions are answered by the local GGUF model; questions that need current information are routed to web-enabled cloud AI. If the local model is down, Groq/Gemini transparently cover it, so the demo never dead-ends.
- **Per-bot Design DNA.** Each bot's theme is scoped to the chat view, so 1,000 bots really can look like 1,000 different products.
- **Prisma ORM with a 14-model enterprise schema** — bots, conversations, messages, users, organizations, knowledge bases, analytics, agent sessions, versions, and widget configs, all with typed queries and migration history.
- **Security hardening** — helmet headers, CORS allowlist, per-IP rate limiting, Zod validation on every endpoint, and a central error handler.
- **Everything persists** in SQLite: bots, conversations, and messages (with their provider label and sources).

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
| `GEMINI_API_KEY` | Secondary web/fallback provider (optional) |
| `PORT` | Backend port (default `3001`) |
| `LOCAL_LLM_URL` | Where the Python model server listens |
| `DATABASE_URL` | SQLite file for Prisma (default `file:../data/chatbot_factory.db`) |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API cross-origin (optional) |

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
  pages/FactoryView      production console — choose a quantity, forge bots
  pages/LibraryView      catalogue of all bots — search, filter, showcase
  pages/ChatView         chat + per-bot Design DNA engine
  services/db.ts         typed API client
backend/
  server.js              thin app setup — middleware, mount routers, listen
  routes/                HTTP layer: health, bots, conversations, chat
  services/              business logic: bot, conversation, chat
  middleware/            validate (Zod), rateLimits, errorHandler
  generator.js           procedural bot generator (domains, DNA, guard profiles)
  domainGuard.js         two-layer domain relevance check
  llmService.js          hybrid AI router (local + Groq + Gemini)
  db.js                  data-access layer on Prisma (camelCase API contract)
prisma/
  schema.prisma          14-model enterprise schema (SQLite default)
  migrations/            versioned migration history
scripts/
  migrate-legacy-data.mjs  one-time better-sqlite3 → Prisma import
run_llm.py               Python server for the local GGUF model
data/                    SQLite database (created at runtime, git-ignored)
```

**Security layers** (all active in dev too): helmet security headers, CORS allowlist (`CORS_ORIGINS`), per-IP rate limiting (300 req/min general, 60 req/min on AI endpoints), Zod validation of every request body, and a central error handler that returns consistent JSON without leaking internals.

**Database:** Prisma ORM over SQLite (zero-config, demo-safe). The schema is provider-portable — switching to PostgreSQL means changing the datasource provider and `DATABASE_URL`, then re-migrating. `npm run prisma:studio` opens the ORM's GUI to inspect data.

---

## Troubleshooting

- **"Could not reach the factory backend"** — the backend isn't running. Start it with `npm run server` (port 3001).
- **Answers say the local model was unavailable** — the Python server on port 8000 isn't up, or the model file is missing. Run `start_llm.bat`, or set a `GROQ_API_KEY` in `.env` so cloud AI answers instead.
- **Bots don't appear after generating** — confirm the backend window shows no errors and that `data/` is writable.
- **Port already in use** — change `PORT` in `.env` (backend) or run Vite on another port with `npm run dev -- --port 5174`.

See `PRESENTATION.md` for a ready-to-follow demo script and verification checklist.
