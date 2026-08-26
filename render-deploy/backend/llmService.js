import './loadEnv.js';
import db from './db.js';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { checkDomainRelevance, generateRedirectMessage, generateIntroMessage } from './domainGuard.js';
import { runTools } from './services/tools.service.js';
import { analyzeMessage, redactPII } from './services/nlu.service.js';
import { runSlotEngine, runFlowEngine } from './services/engines.service.js';

/**
 * ============================================================
 * UNIVERSAL AI ENGINE  (Hybrid Router)
 * ------------------------------------------------------------
 * ORDER (mandatory):
 *   1. DOMAIN GUARD      -> out-of-domain => redirect (no AI cost)
 *   2. CURRENT-INFO?     -> NO  => LOCAL GGUF  (fallback: Groq cloud)
 *                           YES => GROQ web    (fallback: Gemini)
 *
 * Provider labels returned to the UI:
 *   'local'        -> "Local AI"      (GGUF via Python server)
 *   'cloud'        -> "Cloud AI"      (Groq normal model; used if local is down)
 *   'web'          -> "Web-enhanced"  (Groq compound / Gemini, has sources)
 *   'domain-guard' -> "Domain Guard"  (deterministic redirect)
 * ============================================================
 */

// --- Model configuration (override in .env if Groq renames a model) ----------
const LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || 'http://127.0.0.1:8000/api/chat';
const GROQ_WEB_MODEL = process.env.GROQ_WEB_MODEL || 'openai/gpt-oss-20b';      // built-in web search
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b'; // normal chat
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

const GROQ_KEY = process.env.GROQ_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const hasGroq = () => !!GROQ_KEY && GROQ_KEY !== 'MISSING_API_KEY' && !GROQ_KEY.startsWith('your_');
const hasGemini = () => !!GEMINI_KEY && GEMINI_KEY !== 'MISSING_API_KEY' && !GEMINI_KEY.startsWith('your_');

const groq = hasGroq() ? new Groq({ apiKey: GROQ_KEY }) : null;
const gemini = hasGemini() ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;

// --- Current-information detection -------------------------------------------
// Lives in ./currentInfo.js so it can be audited and tested on its own.
import { isCurrentQuery } from './currentInfo.js';

// --- Prompt builder for the local model --------------------------------------
/**
 * Conversation-handling rules appended to EVERY model's system prompt at call
 * time (local, Groq, Gemini, streamed or not). These fix the small-model habit
 * of replying "it seems like you meant X?" to a clear personal statement — a
 * dental bot must engage with "I got my sweet tooth at 8", not interrogate it.
 */
const CONVERSATION_RULES = `CONVERSATION HANDLING:
- When the user shares a personal experience, story, or statement about themselves related to your field (for example "I got my sweet tooth at age 8" or "I had a dental surgery"), respond directly and warmly to what they said. Do NOT reply "it seems like you meant X" or claim the message is unclear.
- When the user continues or elaborates on their previous message, respond to the new information directly instead of re-asking what they meant.
- Interpret casual phrasing and typos sensibly ("I have done my dental surger on age 8" means they had dental surgery at age 8).
- Only ask for clarification when a real question is missing essential details.
- Acknowledge the user's experience with empathy, then add useful information or a relevant follow-up question.`;

function buildLocalPrompt(bot, history, userMessage) {
  const profile = typeof bot.domainProfile === 'string'
    ? JSON.parse(bot.domainProfile)
    : bot.domainProfile;

  let p = `${bot.systemPrompt}\n`;
  p += `\n${CONVERSATION_RULES}\n`;
  if (profile?.description) {
    p += `\nDomain context: ${profile.description}\n`;
  }
  p += `\n--- Conversation ---\n`;
  for (const msg of history) {
    p += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
  }
  p += `User: ${userMessage}\nAssistant:`;
  return p;
}

// --- Providers ---------------------------------------------------------------
class LocalUnavailableError extends Error { }

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Small local models often keep role-playing after their answer: they repeat
 * the bot's own name ("Heal: ... Heal: ..."), invent "User:" turns, continue
 * the conversation themselves, or pad replies with emoji spam
 * ("🌟💖 🌟💖 🌟💖 …" × 40). Strip the leading name echo, cut at the first
 * line that starts a new speaker, and collapse emoji runs so the bot answers
 * ONCE with a clean reply.
 */
export function cleanLocalResponse(text, botName) {
  let t = String(text || '').trim();
  if (!t) return t;

  const nameRe = botName ? `(?:${escapeRe(String(botName).trim())}\\s*:|assistant\\s*:)` : '(?:assistant\\s*:)';

  // Strip the leading "BotName:" / "Assistant:" echo the model prepends.
  t = t.replace(new RegExp(`^${nameRe}`, 'i'), '').trim();

  // Cut at the first later line that starts a new speaker.
  const out = [];
  for (const line of t.split('\n')) {
    const trimmed = line.trim();
    if (out.length > 0 && /^(user|human|you)\s*:/i.test(trimmed)) break;
    if (out.length > 0 && botName && new RegExp(`^${escapeRe(String(botName).trim())}\\s*:`, 'i').test(trimmed)) break;
    out.push(line);
  }
  return collapseEmojiSpam(out.join('\n').trim());
}

/**
 * Collapse decorative emoji spam: runs of 3+ identical emojis shrink to one,
 * and the whole reply keeps at most 8 emoji characters total.
 */
export function collapseEmojiSpam(text) {
  let t = String(text || '');
  // "🌟💖 🌟💖 🌟💖" -> "🌟💖"
  t = t.replace(/(\p{Extended_Pictographic})(?:\s*\1){2,}/gu, '$1');
  // Drop emojis beyond the first 8.
  let count = 0;
  let out = '';
  for (const ch of t) {
    if (/\p{Extended_Pictographic}/u.test(ch)) {
      count += 1;
      if (count > 8) continue;
    }
    out += ch;
  }
  return out.trim();
}

async function fetchFromLocal(bot, history, userMessage) {
  const promptText = buildLocalPrompt(bot, history, userMessage);
  let resp;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    resp = await fetch(LOCAL_LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText, temperature: 0.7, max_tokens: 500 }),
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch (e) {
    throw new LocalUnavailableError(`Local LLM not reachable: ${e.message}`);
  }
  if (!resp.ok) throw new LocalUnavailableError(`Local LLM error: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  const text = cleanLocalResponse(data.response || data.text || '', bot.name);
  if (!text) throw new LocalUnavailableError('Local LLM returned empty response');
  return { response: text, sources: null, provider: 'local' };
}

async function fetchFromGroqChat(bot, history, userMessage) {
  if (!groq) throw new Error('Groq not configured');
  const messages = [
    { role: 'system', content: `${bot.systemPrompt}\n\n${CONVERSATION_RULES}` },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];
  const completion = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 2000
  });
  const response = completion.choices?.[0]?.message?.content?.trim() || 'No response generated.';
  return { response, sources: null, provider: 'cloud' };
}

// Compound models perform web search server-side; do NOT pass a tools param.
function extractGroqSources(message) {
  const sources = [];
  try {
    const tools = message?.executed_tools || message?.tool_calls || [];
    for (const t of tools) {
      const results = t?.search_results?.results || t?.search_results || t?.output?.results;
      if (Array.isArray(results)) {
        for (const r of results) {
          const title = r.title || r.name;
          const url = r.url || r.link;
          if (title || url) sources.push(url ? `${title || url} (${url})` : title);
        }
      }
    }
  } catch { /* best-effort */ }
  return sources;
}

async function fetchFromGroqWeb(bot, history, userMessage) {
  if (!groq) throw new Error('Groq not configured');
  const messages = [
    { role: 'system', content: `${bot.systemPrompt}\n\n${CONVERSATION_RULES}\n\nWhen answering questions about current/recent information, use web search and cite what you find.` },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];
  const completion = await groq.chat.completions.create({
    model: GROQ_WEB_MODEL,
    messages
  });
  const msg = completion.choices?.[0]?.message;
  const response = msg?.content?.trim() || 'No response generated.';
  const sources = extractGroqSources(msg);
  return {
    response,
    sources: sources.length ? sources : ['Groq web search'],
    provider: 'web'
  };
}

async function fetchFromGemini(bot, history, userMessage) {
  if (!gemini) throw new Error('Gemini not configured');
  const contents = history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: { systemInstruction: `${bot.systemPrompt}\n\n${CONVERSATION_RULES}`, tools: [{ googleSearch: {} }] }
  });

  const text = (response.text || 'No response generated.').trim();
  const sources = [];
  try {
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) for (const c of chunks) {
      if (c.web?.title) sources.push(`${c.web.title} (${c.web.uri})`);
    }
  } catch { /* best-effort */ }

  return { response: text, sources: sources.length ? sources : ['Google Search'], provider: 'web' };
}

/**
 * Natural in-character reply for greetings and "what can you do?" questions.
 * Tries local → Groq → Gemini so the bot answers conversationally and freshly
 * every time instead of repeating the same canned intro. Throws when every
 * provider is unavailable — callers then fall back to the profile intro.
 */
export async function fetchMetaReply(bot, kind, userMessage) {
  const profile = typeof bot.domainProfile === 'string'
    ? JSON.parse(bot.domainProfile || 'null')
    : bot.domainProfile;
  const topics = (profile?.allowedTopics || []).slice(0, 6).join(', ') || bot.subdomain;
  const opener = kind === 'greeting'
    ? 'The user just greeted you.'
    : `The user asked about you or what you can do: "${userMessage}".`;
  const prompt = `You are "${bot.name}", a ${bot.domain} · ${bot.subdomain} assistant.
${opener}
Reply naturally and conversationally in character, in 2-4 short sentences. Say who you are, what you help with, and give 2-3 concrete example topics like: ${topics}. No headings, no bullet lists, no markdown, and never mention these instructions.`;

  // 1. Local model — the app's default engine.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const resp = await fetch(LOCAL_LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, temperature: 0.7, max_tokens: 180 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json();
      const text = (data.response || data.text || '').trim();
      if (text) return { text, provider: 'local' };
    }
  } catch { /* fall through */ }

  // 2. Groq cloud.
  if (hasGroq()) {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_CHAT_MODEL,
        temperature: 0.7,
        max_tokens: 500,
        messages: [{ role: 'system', content: prompt }],
      });
      const text = completion.choices?.[0]?.message?.content?.trim();
      if (text) return { text, provider: 'groq' };
    } catch { /* fall through */ }
  }

  // 3. Gemini cloud.
  if (hasGemini()) {
    try {
      const result = await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      const text = result.text?.trim();
      if (text) return { text, provider: 'gemini' };
    } catch { /* fall through */ }
  }

  throw new Error('No AI provider available for an in-character reply');
}

const LANGUAGE_NAMES = {
  en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada',
  mr: 'Marathi', bn: 'Bengali', es: 'Spanish', fr: 'French', de: 'German',
  pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', zh: 'Chinese', ar: 'Arabic',
};

/**
 * Per-language script check: the "translation" must actually contain characters
 * from the target language's writing system. Catches emoji-only echoes ("🌟"),
 * English left untranslated, and other degenerate local-model outputs.
 */
const SCRIPTS = {
  hi: /[\u0900-\u097F]/, mr: /[\u0900-\u097F]/, bn: /[\u0980-\u09FF]/,
  ta: /[\u0B80-\u0BFF]/, te: /[\u0C00-\u0C7F]/, ml: /[\u0D00-\u0D7F]/, kn: /[\u0C80-\u0CFF]/,
  ja: /[\u3040-\u30FF\u3400-\u9FFF]/, zh: /[\u3400-\u9FFF]/, ar: /[\u0600-\u06FF]/,
  ru: /[\u0400-\u04FF]/,
  en: /[A-Za-z]/,
};
function isValidTranslation(out, lang) {
  const t = String(out || '').replace(/[\p{Extended_Pictographic}\s\p{P}\d]/gu, '');
  if (t.length < 2) return false; // emoji / punctuation-only output
  return (SCRIPTS[lang] || /[A-Za-z]/).test(t);
}
export { isValidTranslation };

/**
 * Translate a snippet of text with a cloud provider (Groq or Gemini). ALL
 * providers are queried in parallel and the first VALID result wins (fastest
 * provider wins when it works; a garbage output is rejected and the next
 * attempt is used). Emojis are stripped from the input so the model can't
 * echo them.
 *
 * IMPORTANT: the tiny local GGUF model cannot translate — even for Latin
 * scripts it echoes the prompt and mixes languages. Translation therefore
 * requires a working Groq or Gemini key, and the error message says so
 * instead of serving garbage.
 */
export async function translateText(text, lang) {
  const langName = LANGUAGE_NAMES[lang] || lang;
  const cleanText = String(text || '')
    .replace(/[\p{Extended_Pictographic}\u200D]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
  const prompt = `Translate the following text to ${langName}. Respond with ONLY the translated text — no explanations, no quotes, no emojis.\n\n${cleanText}`;

  const makeValid = (attempt) => (async () => {
    const out = await attempt; // `attempt` is an already-started promise — await it, don't call it
    if (!isValidTranslation(out, lang)) throw new Error('unusable translation output');
    return out;
  })();

  const attempts = [];

  // 1. Groq — with a model fallback chain for accounts with limited access.
  if (hasGroq()) {
    attempts.push(makeValid((async () => {
      const candidates = [...new Set([GROQ_CHAT_MODEL, 'openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile'])];
      for (const model of candidates) {
        try {
          const completion = await groq.chat.completions.create({
            model,
            temperature: 0.2,
            max_tokens: 2000, // gpt-oss is a reasoning model — it needs headroom after reasoning tokens
            messages: [{ role: 'user', content: prompt }],
          });
          const out = completion.choices?.[0]?.message?.content?.trim();
          if (out) return out;
          throw new Error('empty');
        } catch (e) {
          // Model-name errors (404 / not exist / decommissioned) mean "try the
          // next candidate"; anything else is a real failure.
          if (!/404|not exist|does not exist|decommissioned|invalid_request/i.test(e.message)) throw e;
        }
      }
      throw new Error('all groq models unavailable');
    })()));
  }

  // 2. Gemini.
  if (hasGemini()) {
    attempts.push(makeValid((async () => {
      try {
        const result = await gemini.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        const out = result.text?.trim();
        if (out) return out;
      } catch { /* this attempt failed */ }
      throw new Error('gemini unavailable');
    })()));
  }

  if (!attempts.length) throw new Error('No AI provider available for translation');
  try {
    return await Promise.any(attempts);
  } catch {
    throw new Error(
      'Translation needs a working Groq or Gemini API key — the local model cannot translate reliably. Add a key in .env (Gemini quota resets hourly).'
    );
  }
}

// --- Web chain: Groq -> Gemini -> (last resort) local ------------------------
async function answerWeb(bot, history, userMessage, log) {
  if (hasGroq()) {
    try { return await fetchFromGroqWeb(bot, history, userMessage); }
    catch (e) { log.push(`Groq web failed: ${e.message}`); }
  }
  if (hasGemini()) {
    try { return await fetchFromGemini(bot, history, userMessage); }
    catch (e) { log.push(`Gemini failed: ${e.message}`); }
  }
  // Last resort so the demo never dead-ends
  try {
    const r = await fetchFromLocal(bot, history, userMessage);
    return { ...r, response: `${r.response}\n\n_(Note: live web lookup was unavailable, so this uses the local model's knowledge and may not be up to date.)_` };
  } catch (e) { log.push(`Local last-resort failed: ${e.message}`); }
  throw new Error('All web providers unavailable');
}

// --- Normal chain: local -> Groq cloud -> graceful offline --------------------
async function answerNormal(bot, history, userMessage, log) {
  try { return await fetchFromLocal(bot, history, userMessage); }
  catch (e) {
    log.push(`Local unavailable (${e.message}); falling back to Groq cloud`);
    if (hasGroq()) { try { return await fetchFromGroqChat(bot, history, userMessage); } catch (e2) { log.push(`Groq cloud failed: ${e2.message}`); } }
    if (hasGemini()) { try { return await fetchFromGemini(bot, history, userMessage); } catch (e3) { log.push(`Gemini failed: ${e3.message}`); } }
    // Graceful degradation — the demo never dead-ends, even with every provider down.
    const offlineMsg = "I'm sorry — none of the AI providers are reachable right now. Check that the local LLM server is running, or that your Groq/Gemini API keys are valid.";
    log.push('All providers offline — returning graceful message');
    return { response: offlineMsg, sources: null, provider: 'local' };
  }
}

// ============================================================================
const uid = () => Math.random().toString(36).substring(2, 11);

// Shared: run the Domain Guard + current-info router and persist the answer.
// `history` must be the messages that came BEFORE `userMessage`.
// Exported so the fork flow can route without duplicating the user message.
export async function routeAndPersist(bot, conversationId, userMessage, history) {
  // ---- 1. DOMAIN GUARD ----
  const relevance = await checkDomainRelevance(bot, userMessage, history);
  console.log(`\n[DomainGuard] Bot: ${bot.domain} · ${bot.subdomain} | Query: "${userMessage}"`);
  console.log(`  Layer: ${relevance.layer ?? '?'} | Result: ${relevance.result} | Confidence: ${relevance.confidence} | ${relevance.reason}`);

  // ---- 1a. NLU + GUARDRAILS ----
  const nlu = analyzeMessage(userMessage);
  const redacted = redactPII(userMessage);
  if (nlu.toxicity.toxic) {
    const blockMsg = `I'm unable to assist with that language. Please keep our conversation respectful.`;
    const aid = uid();
    await db.addMessage(aid, conversationId, 'assistant', blockMsg, Date.now(), 'domain-guard', null, null, { ...nlu, blocked: 'toxicity' });
    return { response: blockMsg, messageId: aid, provider: 'domain-guard', sources: null, nlu };
  }
  if (nlu.injection.injected) {
    const blockMsg = `I understand you're being creative, but I need to stay on topic. Let's try a different approach.`;
    const aid = uid();
    await db.addMessage(aid, conversationId, 'assistant', blockMsg, Date.now(), 'domain-guard', null, null, { ...nlu, blocked: 'injection' });
    return { response: blockMsg, messageId: aid, provider: 'domain-guard', sources: null, nlu };
  }

  if (!relevance.relevant) {
    console.log(`[Router] Action: DOMAIN_REDIRECT`);
    const redirectMsg = generateRedirectMessage(bot, userMessage);
    const aid = uid();
    await db.addMessage(aid, conversationId, 'assistant', redirectMsg, Date.now(), 'domain-guard', null);
    return { response: redirectMsg, messageId: aid, provider: 'domain-guard', sources: null };
  }

  // ---- 1b. GREETING / "WHAT CAN YOU DO?" ----
  // Answered naturally by the AI when any provider is available — fresh and
  // conversational every time — falling back to the bot's profile intro when
  // every provider is offline. Crucially it is never a refusal: a bot that
  // rejects "hi" looks broken.
  if (relevance.kind === 'greeting' || relevance.kind === 'meta') {
    console.log(`[Router] Action: SOCIAL_REPLY (${relevance.kind})`);
    let reply;
    let provider = 'profile';
    try {
      const r = await fetchMetaReply(bot, relevance.kind, userMessage);
      reply = r.text;
      provider = r.provider;
    } catch {
      reply = generateIntroMessage(bot, relevance.kind);
    }
    const aid = uid();
    await db.addMessage(aid, conversationId, 'assistant', reply, Date.now(), provider, null);
    return { response: reply, messageId: aid, provider, sources: null };
  }

  // ---- 1c. DETERMINISTIC ENGINES (slot forms / visual flows) ----
  const persistEngine = async (role, content, provider) => {
    const aid = uid();
    await db.addMessage(aid, conversationId, role, content, Date.now(), provider, null);
  };
  try {
    const slotResult = await runSlotEngine(bot, conversationId, userMessage, persistEngine);
    if (slotResult) {
      return { response: slotResult.response, messageId: uid(), provider: 'profile', sources: null, engine: 'slots' };
    }
    const flowResult = await runFlowEngine(bot, conversationId, userMessage, history, persistEngine);
    if (flowResult) {
      return { response: flowResult.response, messageId: uid(), provider: 'profile', sources: null, engine: 'flow', handoff: flowResult.handoff };
    }
  } catch (e) {
    console.warn(`[engines] skipped (${e.message})`);
  }

  // ---- 1d. TOOLS (weather, calculator, reminders, URL fetch) ----
  const toolResult = await runTools(userMessage, bot.orgId);
  if (toolResult.matched) {
    console.log(`[Router] Action: TOOL (${toolResult.text.slice(0, 60)})`);
    const aid = uid();
    await db.addMessage(aid, conversationId, 'assistant', toolResult.text, Date.now(), 'tools', null);
    return { response: toolResult.text, messageId: aid, provider: 'tools', sources: null };
  }

  // ---- 2. CURRENT-INFO ROUTER ----
  const mode = (process.env.AI_PROVIDER || 'auto').toLowerCase();
  const current = isCurrentQuery(userMessage);
  let useWeb;
  if (mode === 'local') useWeb = false;
  else if (mode === 'groq' || mode === 'gemini') useWeb = true;
  else /* auto */             useWeb = current;

  console.log(`[CurrentRouter] Current: ${current ? 'YES' : 'NO'} | Mode: ${mode} | Path: ${useWeb ? 'WEB' : 'LOCAL'}`);

  const log = [];
  let result;
  const startedAt = Date.now();
  try {
    result = useWeb
      ? await answerWeb(bot, history, userMessage, log)
      : await answerNormal(bot, history, userMessage, log);
  } catch (e) {
    if (log.length) console.log('  ' + log.join('\n  '));
    throw e;
  }
  const responseMs = Date.now() - startedAt;
  if (log.length) console.log('  ' + log.join('\n  '));
  console.log(`[Router] Answered via: ${result.provider} (${responseMs}ms)`);

  const aid = uid();
  await db.addMessage(aid, conversationId, 'assistant', result.response, Date.now(), result.provider, result.sources, responseMs);
  return { response: result.response, messageId: aid, provider: result.provider, sources: result.sources, responseMs };
}

export async function generateChatResponse(botId, conversationId, userMessage) {
  const bot = await db.getBot(botId);
  if (!bot) throw new Error('Bot not found');

  const messages = await db.getMessages(conversationId);
  const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

  // Persist the user message up front so it is never lost, even if the AI call fails.
  const nlu = analyzeMessage(userMessage);
  await db.addMessage(uid(), conversationId, 'user', userMessage, Date.now(), 'user', null, null, nlu);

  return routeAndPersist(bot, conversationId, userMessage, history);
}

// Regenerate the most recent assistant reply for a conversation.
export async function regenerateChatResponse(botId, conversationId) {
  const bot = await db.getBot(botId);
  if (!bot) throw new Error('Bot not found');

  let messages = await db.getMessages(conversationId);
  // Drop trailing assistant message(s) so we can produce a fresh one.
  while (messages.length && messages[messages.length - 1].role === 'assistant') {
    await db.deleteMessage(messages[messages.length - 1].id);
    messages.pop();
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new Error('Nothing to regenerate — no previous user message found.');
  }
  const lastUser = messages[messages.length - 1];
  const history = messages.slice(0, -1).slice(-10).map(m => ({ role: m.role, content: m.content }));

  return routeAndPersist(bot, conversationId, lastUser.content, history);
}

// ============================================================================
// ADVANCED AI (Checkpoint 9) — vision + model comparison
// ============================================================================

/**
 * Analyze an image with Gemini vision. Returns the text description.
 */
export async function visionAnalyze(bot, imageBase64, mime, prompt = 'Describe this image.') {
  if (!gemini) throw new Error('Gemini not configured — vision requires a Gemini API key');
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mime || 'image/png', data: imageBase64 } },
      ],
    }],
  });
  return (response.text || 'I could not interpret that image.').trim();
}

/**
 * Compare the same message across every configured provider (side-by-side
 * view). All three run in parallel; a failing provider reports its error
 * instead of silently disappearing, so the UI always shows three columns.
 */
export async function compareModels(bot, userMessage) {
  const results = [];

  const run = async (provider, model, fn) => {
    try {
      const r = await fn();
      results.push({ provider, model, response: r.response });
    } catch (e) {
      results.push({ provider, model, response: `Unavailable: ${e.message}` });
    }
  };

  // Groq model fallback chain: accounts differ in which models they can call,
  // so if the configured model 404s, try common alternatives.
  const runGroq = async () => {
    const candidates = [...new Set([GROQ_CHAT_MODEL, 'openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile'])];
    const last = candidates[candidates.length - 1];
    for (const model of candidates) {
      try {
        const r = await fetchFromGroqChatWithModel(bot, [], userMessage, model);
        results.push({ provider: 'groq', model, response: r.response });
        return;
      } catch (e) {
        if (model === last || !/404|not exist|does not exist|decommissioned|invalid_request/i.test(e.message)) {
          results.push({ provider: 'groq', model: GROQ_CHAT_MODEL, response: `Unavailable: ${e.message}` });
          return;
        }
      }
    }
  };

  await Promise.all([
    run('local', 'Local GGUF', () => fetchFromLocal(bot, [], userMessage)),
    hasGroq() ? runGroq() : run('groq', GROQ_CHAT_MODEL, async () => { throw new Error('no Groq API key configured'); }),
    run('gemini', GEMINI_MODEL, () => fetchFromGemini(bot, [], userMessage)),
  ]);

  return results.sort((a, b) => (a.provider === 'local' ? -1 : b.provider === 'local' ? 1 : 0));
}

/** fetchFromGroqChat with an explicit model override. */
async function fetchFromGroqChatWithModel(bot, history, userMessage, model) {
  if (!groq) throw new Error('Groq not configured');
  const messages = [
    { role: 'system', content: `${bot.systemPrompt}\n\n${CONVERSATION_RULES}` },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];
  const completion = await groq.chat.completions.create({
    model,
    messages,
    temperature: 0.7,
    max_tokens: 2000
  });
  const response = completion.choices?.[0]?.message?.content?.trim() || 'No response generated.';
  return { response, sources: null, provider: 'cloud' };
}

// Report which providers are available (used by /api/health + the UI status dot).
export async function getProviderStatus() {  let localReachable = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const resp = await fetch(LOCAL_LLM_URL.replace(/\/api\/chat$/, '/health'), { signal: controller.signal });
    clearTimeout(timeout);
    localReachable = resp.ok;
  } catch { /* local server not up */ }

  return {
    mode: (process.env.AI_PROVIDER || 'auto').toLowerCase(),
    local: localReachable,
    groq: hasGroq(),
    gemini: hasGemini(),
    localUrl: LOCAL_LLM_URL
  };
}

// ============================================================================
// STREAMING (SSE) — token-by-token responses for the chat UI
// ============================================================================

/**
 * Stream an assistant reply token by token. `emit(token)` is called for each
 * chunk. Falls back to a single full emission (non-streaming providers).
 *
 * Routing mirrors generateChatResponse: Domain Guard -> profile -> AI chain.
 */
export async function streamChatResponse(botId, conversationId, userMessage, emit) {
  const bot = await db.getBot(botId);
  if (!bot) throw new Error('Bot not found');

  const messages = await db.getMessages(conversationId);
  const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

  // Persist the user message up front.
  await db.addMessage(uid(), conversationId, 'user', userMessage, Date.now());

  // ---- 1. DOMAIN GUARD ----
  const relevance = await checkDomainRelevance(bot, userMessage, history);
  if (!relevance.relevant) {
    const redirectMsg = generateRedirectMessage(bot, userMessage);
    const aid = uid();
    await db.addMessage(aid, conversationId, 'assistant', redirectMsg, Date.now(), 'domain-guard', null);
    emit(redirectMsg);
    return { response: redirectMsg, messageId: aid, provider: 'domain-guard', sources: null, streamed: false };
  }

  // ---- 1b. GREETING / META ----
  if (relevance.kind === 'greeting' || relevance.kind === 'meta') {
    let reply;
    let provider = 'profile';
    try {
      const r = await fetchMetaReply(bot, relevance.kind, userMessage);
      reply = r.text;
      provider = r.provider;
    } catch {
      reply = generateIntroMessage(bot, relevance.kind);
    }
    const aid = uid();
    await db.addMessage(aid, conversationId, 'assistant', reply, Date.now(), provider, null);
    emit(reply);
    return { response: reply, messageId: aid, provider, sources: null, streamed: false };
  }

  // ---- 2. STREAM from Groq (supports streaming) ----
  if (hasGroq()) {
    try {
      return await streamFromGroq(bot, history, userMessage, emit, conversationId);
    } catch (e) {
      console.warn(`[stream] Groq failed (${e.message}); falling back to non-streaming`);
    }
  }

  // ---- 3. NON-STREAMING FALLBACK (Gemini / local / any) ----
  const result = await routeAndPersist(bot, conversationId, userMessage, history);
  emit(result.response);
  return { ...result, streamed: false };
}

async function streamFromGroq(bot, history, userMessage, emit, conversationId) {
  const messages = [
    { role: 'system', content: `${bot.systemPrompt}\n\n${CONVERSATION_RULES}` },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];
  const stream = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 2000,
    stream: true,
  });

  let full = '';
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) { full += delta; emit(delta); }
  }
  const response = (full || 'No response generated.').trim();

  const aid = uid();
  await db.addMessage(aid, conversationId, 'assistant', response, Date.now(), 'cloud', null);
  return { response, messageId: aid, provider: 'cloud', sources: null, streamed: true };
}

// ============================================================================
// CONVERSATION INTELLIGENCE — sliding window + auto-summarization
// ============================================================================

const WINDOW_CHARS = 12000; // ~3000 tokens — when history exceeds this, older turns are condensed

/**
 * Build the history for an LLM call with a sliding window: if the recent
 * turns are too long, the older ones are replaced by a single summary line
 * (heuristic when the LLM summary is unavailable — deterministic, offline).
 */
export async function buildWindowedHistory(bot, conversationId, maxTurns = 10) {
  const messages = await db.getMessages(conversationId);
  if (!messages.length) return [];

  const recent = messages.slice(-maxTurns).map(m => ({ role: m.role, content: m.content }));
  let chars = recent.reduce((acc, m) => acc + m.content.length, 0);
  if (chars <= WINDOW_CHARS) return recent;

  const older = messages.slice(0, -maxTurns).map(m => ({ role: m.role, content: m.content }));
  let summary;
  try {
    summary = await summarizeText(older.map(m => `${m.role}: ${m.content}`).join('\n'));
  } catch {
    // Offline heuristic summary: first user intent + last user message.
    const firstUser = older.find(m => m.role === 'user');
    const lastUser = [...older].reverse().find(m => m.role === 'user');
    summary = `Earlier in this conversation: "${firstUser?.content?.slice(0, 120) ?? ''}" ... "${lastUser?.content?.slice(0, 120) ?? ''}" (older messages condensed).`;
  }
  return [{ role: 'system', content: `Summary of earlier conversation: ${summary}` }, ...recent];
}

/**
 * Summarize a block of text with any available provider, local-first:
 *   1. Local GGUF (the app's default engine)
 *   2. Groq cloud
 *   3. Gemini cloud
 * Throws only when every provider is unavailable — callers then fall back
 * to the deterministic heuristic summary.
 */
export async function summarizeText(text) {
  const payload = text.slice(0, 6000);

  // 1. Local model — same endpoint the chat uses, lower temperature + shorter
  // output so it stays concise instead of continuing the conversation.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const resp = await fetch(LOCAL_LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `Summarize the following conversation in a short paragraph (2-4 sentences). Keep names, decisions, and key facts. Do not continue the conversation.\n\n${payload}`,
        temperature: 0.3,
        max_tokens: 400,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (resp.ok) {
      const data = await resp.json();
      const text = cleanLocalResponse(data.response || data.text || '', null);
      if (text) return text;
    }
  } catch { /* fall through to cloud providers */ }

  // 2. Groq cloud.
  if (hasGroq()) {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_CHAT_MODEL,
        temperature: 0.3,
        max_tokens: 800,
        messages: [
          { role: 'system', content: 'Summarize the following conversation concisely in 2-4 sentences. Keep names, decisions, and key facts. Do not continue the conversation.' },
          { role: 'user', content: payload },
        ],
      });
      const out = completion.choices?.[0]?.message?.content?.trim();
      if (out) return out;
    } catch { /* fall through */ }
  }

  // 3. Gemini cloud.
  if (hasGemini()) {
    try {
      const result = await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Summarize the following conversation concisely in 2-4 sentences. Keep names, decisions, and key facts. Do not continue the conversation.\n\n${payload}` }] }],
      });
      const out = result.text?.trim();
      if (out) return out;
    } catch { /* fall through */ }
  }

  throw new Error('No AI provider available for summarization');
}
