# Universal Chatbot Factory — Enterprise Upgrade Roadmap

> Locked feature inventory for the Training & Placement evaluation build.
> Legend: ✅ KEEP (full build) · 🔧 SIMPLIFY (essence kept, lighter build) · ✂️ CUT (with reason)

**Deployment target:** localhost only (`start_all.bat` → Python LLM :8000, Express :3001, Vite :5173).
**Guiding rule:** the app must work and demo after every checkpoint. Nothing risky sits on the critical path.

---

## Checkpoint 0 — Foundation (bugs, security, restructure, Prisma) ✅ DONE

> Commits: `58e96d3` (0.0) · `b0c7d8d` (0.1) · `041db29` (0.2) · `db8edea` (0.3) · `877ddad` (0.4)

- ✅ Fix orphaned messages on conversation delete (transactional cascade)
- ✅ Add `DELETE /api/bots/:botId` with cascade
- ✅ Frontend batch loop for >50 bot generation (server keeps 50/request cap)
- ✅ Fix Gemini model default mismatch (`gemini-2.5-flash`)
- ✅ Remove dead code: `src/App.css`, unused `generateBots` wrapper
- ✅ Consolidate stray test files into `tests/legacy/`
- ✅ Normalize snake_case/camelCase at the API boundary
- ✅ Security: helmet, CORS allowlist, express-rate-limit, Zod validation on every endpoint, central error handler
- ✅ Backend restructure: `routes/` + `services/` + `middleware/`
- ✅ Prisma ORM + full enterprise schema (14 models), SQLite provider default, one-time legacy data migration script

## Checkpoint 1 — UI Overhaul (design system, layout, motion)

- Evolved Foundry design tokens (deep void black, glass surfaces, amber accent, shadows)
- Reusable UI component library (Button, Input, Card, Modal, Drawer, Tabs, Badge, Avatar, Tooltip, Skeleton)
- Collapsible sidebar nav + top bar (breadcrumbs, notifications, +New Bot)
- Framer Motion everywhere: page transitions, staggered lists, card tilt/glow, spring modals, animated counters
- Dashboard home page (welcome banner, quick actions, recent bots, activity feed, provider status)
- Cmd+K spotlight search (cmdk), keyboard shortcuts + overlay
- Skeletons for every loading state, illustrated empty states, toasts (sonner), custom confirm dialogs
- Accessibility: ARIA, keyboard nav, focus trap, skip link, reduced motion, contrast
- Responsive: mobile bottom tabs, tablet hamburger

## Checkpoint 2 — Auth & Tenancy

- JWT access + refresh tokens with rotation, bcrypt passwords
- Animated login/register pages, password strength meter, remember me
- RBAC: Admin / Editor / Viewer, protected routes + middleware
- Organizations (workspaces) with isolated bots/conversations/KB/analytics
- Org switcher, org settings, invite links (no email server), org roles
- Activity log (audit trail), usage quotas with meters (80% warn / 100% block)
- Account settings: change password, display name, avatar

## Checkpoint 3 — Custom Bot Creator ⭐ (flagship innovation)

- Natural-language bot creation: "describe it → AI designs the whole bot"
- LLM generates name, domain, personality, system prompt, welcome, 4 starters, domain profile, design DNA, avatar
- Auto-themed Design DNA (coding → Terminal, cooking → Sunset/Amber)
- Live preview card + per-section regenerate (name/theme/avatar)
- Template-based fallback when no API key (demo never dead-ends)
- `creation_method: 'custom' | 'factory'` provenance badges

## Checkpoint 4 — Streaming & Conversation Features

- SSE token streaming (`text/event-stream`), progressive render + animated cursor, graceful fallback
- Message editing + fork (branch switcher dropdown)
- Conversation export: Markdown, JSON, CSV, TXT, themed print-to-PDF
- Full-text conversation search with highlights
- Pin messages, reactions (👍/👎 → CSAT), copy message
- Share conversation read-only link (`/share/:id`)
- Sliding window + auto-summarization, context usage meter, manual summarize button

## Checkpoint 5 — RAG Knowledge Base

## Checkpoint 6 — Analytics & Insights

- Overview cards (animated counters): bots, conversations, messages, avg response time, CSAT
- Charts (recharts): conversations over time, provider donut, top bots, domain distribution,
  response-time histogram, CSAT trend, peak-usage heatmap, token/cost estimation, conversation length
- Per-bot analytics: most-asked questions, intent breakdown, sentiment, guard trigger rate, RAG hit rate, drop-off
- Real-time monitoring via 5s polling (active conversations, messages/min, provider load, error rate)
- CSV export + chart PNG/SVG export, on-demand reports saved to DB + Reports page

## Checkpoint 7 — NLU & Guardrails

- Intent classification (rule-based first pass + optional LLM)
- Entity extraction (dates, numbers, emails, URLs, phone)
- Sentiment analysis (lexicon-based, offline, deterministic) + message indicators + auto-escalation
- Language detection + "reply in user's language" prompt injection
- PII detection & optional redaction, toxicity filter, prompt-injection protection
- Groundedness score (RAG hallucination approximation), moderation dashboard, per-bot guardrail toggles

## Checkpoint 8 — Bot Builder & Versioning

- Bot configuration panel: identity, personality sliders, system prompt editor with {{variables}},
  appearance editor with live preview, behavior toggles, starter-question manager, guard strictness
- Prompt testing playground (split-screen editor ↔ test chat, token counter)
- Bot versioning: snapshot per save, history, rollback, published marker
- Templates marketplace: 15 pre-built templates, category filters, one-click create, save-as-template
- Slot filling / multi-step forms with validation, progress, summary, export
- Visual flow builder (reactflow): 5 node types (Message, Question, Condition, AI, Handoff) + simulator

## Checkpoint 9 — Advanced AI, Handoff & Widget

- Per-bot model selection + model comparison view (side-by-side)
- Multi-modal: image upload → Gemini vision, file upload → context, voice input (Web Speech API),
  voice output (SpeechSynthesis, per-bot toggle)
- Function calling/tools: weather (Open-Meteo, no key), calculator, web search, reminders, URL fetcher, custom HTTP
- Agentic workflows: predefined multi-step flows with visible progress
- Human handoff: triggers (explicit request, sentiment crash, guard blocks, manual), agent queue,
  co-pilot suggestions, canned responses, internal notes, transfer, close → back to bot
- Embeddable widget: one `<script>` tag, iframe isolation, bot theme, pre-chat form, unread badge,
  typing indicator, offline message, config page with embed code + CORS allowlist

## Checkpoint 10 — Polish, Docker & Testing

- Dockerfile + docker-compose (app + postgres + llm, healthchecks, volumes) — optional path,
  `start_all.bat` stays primary
- Vitest unit tests (generator, domain guard, currentInfo, NLU, guardrails)
- Supertest API integration tests (auth, CRUD, chat)
- RTL component tests (critical components), Playwright E2E (3 golden paths)
- 70% coverage target on core backend services
- Prettier, Husky pre-commit hooks, TypeScript strict, JSDoc, ADRs in docs/
- Demo mode seed script, onboarding tour, Domain Guard explainability panel, architecture diagram

---

## Cuts (10, each justified)

1. OAuth2 — fragile in demos; JWT covers the auth credit
2. Billing/subscriptions — excluded by project scope
3. 2FA / login history — overkill for college scope
4. react-i18next UI translation — low ROI, days of work
5. Redis — nothing needs it at demo scale
6. ChromaDB server — replaced by SQLite vector store (same demo, one fewer service)
7. Code executor tool — security liability
8. Rich link previews — flaky on arbitrary URLs
9. @-mention multi-bot chats — complex, untested by evaluators
10. Full light theme — dark is the signature; accent picker instead

## Additions (beyond the original prompt)

- Demo Mode / seed script (evaluation never starts from an empty screen)
- First-run onboarding tour
- Domain Guard explainability panel (shows which layer fired and why)
- Architecture diagram + ADRs in docs/
- Global Error Boundaries + graceful provider degradation UI


- Upload PDF/DOCX/TXT/CSV/JSON per bot (drag-drop with progress)
- Pipeline: pdf-parse/mammoth extract → recursive chunking (500/50 overlap) → embed → store
- SQLite-backed vector store (no ChromaDB server); Gemini embeddings, keyword/BM25 offline fallback
- Query: embed question → top-5 chunks → inject context → cited sources in chat UI
- KB management page: document list with processing/ready/failed status, chunk counts, delete
- URL crawling: paste URL → fetch → strip HTML → index
- Long-term memory: cross-conversation recall, "what does this bot remember?" panel, per-bot toggle
