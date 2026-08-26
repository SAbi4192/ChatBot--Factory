# Presentation & Demo Guide

A ready-to-follow script for presenting the Universal Chatbot Factory. Budget about 5–7 minutes. Practice the run once before the test.

---

## 1. Pre-flight (do this before you present)

1. Launch everything: double-click **`start_all.bat`** (or run the three `npm`/Python commands manually — see `README.md`).
2. Wait for the frontend window to print a `Local:` URL, then open it in your browser.
3. On the Factory screen, look at the top-right status dots:
   - **LOCAL** green = the Python model server is up.
   - **GROQ** green = cloud AI is configured (web answers + fallback).
   - If both are grey, the app still works — the Domain Guard and redirects run with no AI, and you can explain that gracefully.
4. Click **Reset all** in the Library once beforehand if you want a clean slate for the live demo.

> Tip: even if the local model and cloud keys are all unavailable, the domain-guard portion of the demo still works, because relevance is decided deterministically first.

---

## 2. The 30-second pitch (say this first)

> "This is one application — one frontend, one backend, one database, one local AI model — that can manufacture any number of specialized chatbots. Each bot has its own domain, personality, guardrails, and visual identity. A bot's domain isn't just a label: it's a rule the bot enforces, so it stays on topic and refuses things outside its specialty."

---

## 3. Live demo script

### A. Manufacture bots at scale
1. On the Factory screen, click the **100** preset (or type any number).
2. Click **Produce 100**. Narrate the production run: "It's generating 100 bots — each with a unique Design DNA, domain profile, personality, and guardrails — in a single bulk transaction."
3. You land in the **Library**. Point at the stats strip: total bots, distinct domains, themes, personalities.

### B. Show that bots are genuinely different
4. Scroll the grid — point out the different monogram colors and the little **DNA swatches** on each card. "Each card previews that bot's theme."
5. Type a domain in **search**, e.g. `Legal`, to filter. Then try `Astronomy` or `Gaming` to show the spread.
6. Click **Showcase** (top right). Bots auto-rotate every few seconds — a fast way to show that themes, layouts, and message styles really differ. Use the on-screen **‹ ❚❚ ›** controls to pause or step; **Exit** returns to the Library.

### C. Prove the Domain Guard works (the key moment)
7. From the Library, search `Immigration` (or `Legal`) and open a **Legal · Immigration** bot.
8. Say `hi`, then ask `what can you do?` — the bot introduces itself from its own profile and lists what it covers. Badge: **Bot Profile**. Mention that this costs no AI call and works even with every provider offline.
9. Ask **on-topic** questions — it answers:
   - `How can I move to the USA from India?`
   - `Which visa should I apply for to work abroad?`
   - `Can I switch employers on an H-1B?` (shows that product/programme names count as in-domain)
10. Ask an **off-topic** question — it politely refuses and redirects instead of answering:
   - `Write me a Python function to reverse a string`
   - `What's a good recipe for biryani?`
11. Point at the small badge under each answer: **Domain Guard** for the redirect, **Bot Profile** for the introduction, **Local AI** (or **Cloud AI** / **Web-enhanced**) for a real answer.

> Worth saying out loud: the guard is tuned so that **refusing a fair question is treated as the worse failure**. Off-topic is detected *positively* — the question has to match another field's vocabulary — so an unusual phrasing gets answered in character rather than rejected.

### D. Current-information routing (only if a cloud key is green)
11. Ask something time-sensitive in an on-topic bot, e.g. in a Technology · AI bot: `What are the latest AI model releases?` — the answer is labelled **Web-enhanced** and shows **Sources**.
12. Explain the routing: "Normal questions use the local model for free; only questions that need current info go to the web."

### E. Nice touches to mention
13. Click **Regenerate** under the last answer to get a fresh response.
14. Start a **New chat** to show conversations are isolated and persisted; refresh the page to prove history survives (SQLite).

---

## 4. Verification checklist (tick these while rehearsing)

- [ ] Generating N bots creates N visibly different bots (name, domain, theme).
- [ ] Library search and All/Recent/Favorites filters work.
- [ ] Favoriting a bot (star) persists after a refresh.
- [ ] On-topic question → real answer with a provider badge.
- [ ] `hi` / `what can you do?` → the bot introduces itself, badge **Bot Profile** (never a refusal).
- [ ] A brand-name question in a Technology · Hardware bot (`Which is better, Intel or AMD?`) → answered.
- [ ] Off-topic question → polite redirect labelled **Domain Guard**, no wrong answer.
- [ ] Conversations persist across refresh; multiple chats per bot are isolated.
- [ ] Each bot's theme is scoped to its chat — going Back to the Library shows the app's own dark "Foundry" theme, not the bot's.
- [ ] Regenerate produces a new response.
- [ ] If the local model is off, answers still come back (cloud fallback) or the guard still redirects.

### Domain Guard acceptance examples (from the project spec)

For a **Legal · Immigration** bot, these should be treated as follows:

| Question | Expected |
| --- | --- |
| How can I move to the USA from India? | ✅ Answered |
| Which visa should I apply for to work abroad? | ✅ Answered |
| How does the green card process work? | ✅ Answered |
| Write a Python program to sort a list | ⛔ Redirect |
| Suggest a good biryani recipe | ⛔ Redirect |
| Who won the cricket match yesterday? | ⛔ Redirect |

### Proving it, with numbers

Two harnesses run the guard with **no local model and no cloud keys**, so every decision is deterministic and reproducible:

```
npm run test:domain    # 211 acceptance cases, expect "211 passed, 0 failed"
npm run test:sweep     # self-consistency sweep across every specialty
```

`test:sweep` is the interesting one to quote. It asks every generated bot the starter
questions the app itself suggests, and then asks it every *other* domain's questions:

- own-question refusal rate: **0%** — no bot ever refuses a question it suggested
- cross-domain redirect rate: **97%** — and the remainder are cases with no vocabulary
  evidence either way, which the LLM classifier resolves at runtime

If asked why it isn't 100%: the last few percent are questions that share no
recognisable vocabulary with any field ("solve 2x + 5 = 17"). Rather than guess, the
guard defers to the yes/no classifier when a model is available, and otherwise answers
in character — because the bot's system prompt still pins it to its specialty.

---

## 5. Likely questions (and answers)

- **"How does it scale to thousands of bots?"** — Bots are generated in one SQLite bulk transaction, and the Library renders in windowed pages, so the UI stays responsive.
- **"How does the domain restriction actually work?"** — A precedence chain, first match wins. Greetings and "what can you do?" are always allowed and answered from the bot's own profile. Then evidence that the question *is* in the bot's field (its topics, synonyms, and a shared lexicon of real brand and product names — Intel, Ryzen, H-1B, ETF). Then evidence it belongs to a *different* field, which is what triggers a redirect. Then conversation context, then a strict yes/no LLM classification. Off-topic never reaches the answering model.
- **"Why not just reject anything you don't recognise?"** — Because that was the original bug. A bot that refuses "which is better, Intel or AMD?" looks broken, and unrecognised wording is common. Off-topic is now detected positively — the question must match another field's vocabulary — so the safe default is to answer, in character.
- **"How do older bots in the database get the new vocabulary?"** — The lexicon is looked up by domain and specialty *name* at request time, not baked into each row, so bots generated before it existed behave identically. No regeneration, no migration.
- **"What if the internet or the model is down?"** — The router falls back (local ↔ cloud), and everything above the classifier needs no AI at all, so domain behaviour is identical offline. That is exactly how the test harnesses are run.
- **"Where are the API keys?"** — Only in `.env` on the server, read by the backend. They are never exposed to the browser, and `.env` is git-ignored.
- **"Is the domain a real constraint or just a prompt?"** — Both: the system prompt tells the bot its scope, and the Domain Guard enforces it in code before any answer is generated.
