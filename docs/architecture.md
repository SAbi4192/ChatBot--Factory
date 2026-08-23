# Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                     FRONTEND (React 19 + Vite 8)               │
│                                                               │
│  Auth pages    Dashboard    Factory    Library    Chat         │
│  Settings      Analytics    Moderation  Agent      Templates    │
│  KB view       Bot editor  Flow builder  Widget config       │
│                                                               │
│  UI lib: framer-motion · cmdk · sonner · recharts · @xyflow   │
└──────────────┬────────────────────────────────────────────────┘
               │  HTTP + SSE (Vite proxy → :3001)
               ▼
┌───────────────────────────────────────────────────────────────┐
│                     BACKEND (Express 5)                        │
│                                                               │
│  Public routes:  /api/health  /api/auth  /api/share           │
│                  /api/public  /widget.js  /widget/:botId       │
│                                                               │
│  Protected routes (JWT + org scoping):                         │
│    /api/orgs  /api/bots  /api/bots/custom  /api/templates      │
│    /api/chat  /api/conversations  /api/search  /api/analytics  │
│    /api/moderation  /api/handoff  /api/bots/:id/kb             │
│                                                               │
│  Middleware: helmet · CORS · rate-limit · Zod · JWT · RBAC    │
│                                                               │
│  Services: generator · domainGuard · llmService · currentInfo   │
│            auth · org · analytics · nlu · tools · agent        │
│            customBot · builder · engines · rag · share          │
│            audit · templates · intelligence                     │
│                                                               │
│  Data layer: Prisma ORM (SQLite default, Postgres-ready)       │
└──────────────┬────────────────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────────────────┐
│                     AI PROVIDERS                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │ Local    │  │ Groq     │  │ Gemini   │                     │
│  │ GGUF     │  │ Cloud    │  │ Cloud    │                     │
│  │ :8000    │  │ API      │  │ API      │                     │
│  └──────────┘  └──────────┘  └──────────┘                     │
│                                                               │
│  Hybrid router: Local → Groq → Gemini (auto)                  │
│  Domain Guard: 5-layer deterministic relevance check          │
│  Tools: Weather (Open-Meteo), Calculator, Reminders, URL      │
└───────────────────────────────────────────────────────────────┘
```

## Key design decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Database | SQLite (Prisma) | Zero-config demo; Postgres-ready schema |
| Auth | JWT + token-version rotation | Stateless, no refresh-token table |
| Streaming | SSE (not WebSockets) | HTTP-only, no extra dependency |
| Vector store | Keyword scoring (SQLite) | No ChromaDB server to manage |
| Multi-tenancy | orgId on every query | Data-layer isolation, not just route-level |
| Frontend state | React context + localStorage | No state library dependency |
| UI animations | framer-motion | Declarative, spring physics, reduced-motion support |
| Charts | recharts | React-native, SVG-based, exportable |

## Demo flow

1. Open `localhost:5173` → login page
2. Sign in as `admin@factory.local` / `admin123` → Factory HQ workspace with 598 bots
3. Chat with any bot → Domain Guard → hybrid AI router → response
4. Dashboard → analytics charts, real-time polling, quota meters
5. Factory → produce 1000 bots in one run
6. Custom bot → "Cooking assistant that suggests recipes" → AI designs everything
7. Library → search, filter, favorites, provenance badges
8. Chat → SSE streaming, fork, export, pin, share link, reactions, context meter
9. Knowledge base → upload a PDF → bot answers with cited sources
10. Widget → copy one `<script>` tag → paste into any HTML page → bubble appears
11. Templates → install "Customer Support" → launches a configured bot
12. Agent → start a handoff → queue → pickup → co-pilot → reply → close