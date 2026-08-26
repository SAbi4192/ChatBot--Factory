# Scarlet Chatbot Factory — Demo Script

A ready-to-follow walkthrough for evaluations, viva, or demo day.
Total: **~5 minutes** (an extended 10-minute version is included).

---

## 0. Elevator pitch (30 seconds)

> "This is a chatbot factory — one application that procedurally manufactures
> any number of domain-specialized AI assistants, from 1 to 5000, all sharing a
> single frontend, backend, database, and one local AI model. Each bot gets its
> own domain, personality, system prompt, guardrails, and visual identity. A
> five-layer Domain Guard keeps every bot on-topic, RAG lets them answer from
> your documents with citations, and everything degrades gracefully — local
> model first, cloud AI as a fallback, and profile answers when everything is
> offline."

---

## 1. Pre-demo checklist (before you start)

- [ ] Backend running: `npm run server` (port 3001) — or `docker compose -f docker/docker-compose.yml up`
- [ ] Frontend running: `npm run dev` (port 5173)
- [ ] (Optional but best) Local model up: `start_llm.bat` — verify with the green LOCAL dot on the Factory hub
- [ ] Logged in, and the dashboard shows a few bots (run `npm run seed` once if the workspace is empty)
- [ ] One PDF/TXT document ready to upload for the RAG section
- [ ] Browser window maximized; **hard-refresh** (Ctrl+Shift+R) before starting

---

## 2. The 5-minute script

### Minute 1 — The Factory (generation at scale)

1. Open **Dashboard** → click **"Generate Random Bots"**.
2. Type `10`, click **Produce**. Let the production-run screen finish (~10–20s).
3. Narrate: *"One request created ten bots — each with a unique domain,
   personality, system prompt, guardrails, and a full visual Design DNA:
   avatar shape, corner radius, glow, heading font, background pattern —
   not just colors."*
4. Open **Library** — hover a card to show the personality/welcome preview,
   then click into a bot.

### Minute 2 — The Chat experience

1. Send: *"Hi!"* → the bot answers conversationally (in-character AI reply, not a canned script).
2. Ask something in its domain (e.g. for a dental bot): *"How often should I floss?"*
   — detailed, domain-aware answer.
3. Click the **Speaker** icon on the reply — it reads the answer aloud.
4. Click **Compare** in the header → the same question answered side-by-side
   by Local / Groq / Gemini (if keys are configured).
5. Click the **Translate** icon on a reply → choose **தமிழ்** or **हिन्दी** →
   the message is translated in place.

### Minute 3 — The Domain Guard (the "wow" moment)

1. Ask the bot something clearly out of scope: *"Who is Donald Trump?"*
2. Narrate: *"The guard detects the question is about a person with no
   connection to this field — even with zero keyword overlap — and replies
   firmly in character instead of hallucinating."*
3. Click the **guard** label (shield icon) to show the explainability panel:
   which layer decided, and why.
4. Ask a personal statement: *"I got my sweet tooth at age 8."* → the bot
   engages with the experience instead of asking "did you mean…?".

### Minute 4 — RAG + voice

1. Open the bot's **Knowledge** page, upload the prepared document, wait for
   chunking, then ask a question answered only by that document → the reply
   shows **Sources**.
2. Click the **mic** button in the composer, speak a question → it appears as
   text and gets answered.
3. Mention: *"Speech recognition and synthesis run entirely in the browser —
   no backend cost."*

### Minute 5 — Analytics + human handoff

1. Open **Analytics**: point at the provider donut, response-time histogram,
   and the new **sentiment trend** chart (7-day conversation mood).
2. Open **Agent inbox**: show the queue, a co-pilot suggestion, and a canned reply.
3. Close with: *"Everything is persisted in a 14-model relational schema;
   tests: 211 domain-guard assertions + unit + integration suites; and the
   whole stack runs with `docker compose up`."*

---

## 3. Extended (10-minute) version

- **Custom bot creator (flagship):** Factory → Custom Chatbot → describe a bot
  in plain English → AI designs name/personality/theme/prompts → regenerate
  the name → Create. Watch the confetti.
- **Template marketplace:** browse and instantiate a template.
- **Flow builder:** open a bot → Flow builder → wire Message → Question → AI →
  Handoff nodes, save, and trigger the flow in chat.
- **Slot forms:** configure fields (name/email/date) → any new conversation
  collects them one by one with validation and confirmation.
- **Widget:** Widget config page → copy the embed code → open the public share
  URL / an HTML file with the widget → chat from a "different website".
- **Moderation:** block a flagged message and re-approve from the queue.
- **Share link:** share a conversation and open the public share page.
- **Showcase mode:** Library → Showcase — a timed slideshow across bots.

---

## 4. Likely questions and one-line answers

| Question | Answer |
| --- | --- |
| "How does the bot know what's off-topic?" | A 5-layer guard: social → own-field evidence → foreign-field redirect → context → LLM classifier; proper-noun detection catches person questions with zero keyword overlap. |
| "What happens if the local model is off?" | It degrades gracefully: profile replies for greetings, deterministic redirects, and Groq/Gemini for real answers. |
| "Is it one model for every bot?" | Yes — the same local GGUF, but each bot has a unique system prompt + domain profile, so they behave as distinct experts. |
| "How is this different from just calling ChatGPT?" | Procedural generation at scale, domain safety with explainability, RAG with citations, deterministic engines, hybrid provider routing, and full multi-tenant product features around it. |
| "Why SQLite?" | Zero-config for demo; the Prisma schema is provider-portable, so Postgres is a config change. |
| "Where do the answers come from in the compare view?" | Local GGUF, Groq (llama-3.3-70b), and Gemini — the same router that serves chat, run side by side. |

---

## 5. Troubleshooting during the demo

- **Red LOCAL dot** on the Factory hub → local model server is down; either
  start it or rely on Groq/Gemini keys — the demo still works.
- **Bots missing** → run `npm run seed` and refresh.
- **Compare shows one provider** → only that provider's key is configured
  (local needs the model server; Groq/Gemini need keys in `.env`).
- **Mic button error** → the browser blocks mic access; use Chrome/Edge and
  allow the permission prompt.
