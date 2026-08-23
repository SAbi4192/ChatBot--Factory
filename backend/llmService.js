import db from './db.js';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { checkDomainRelevance, generateRedirectMessage, generateIntroMessage } from './domainGuard.js';

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
const GROQ_WEB_MODEL = process.env.GROQ_WEB_MODEL || 'groq/compound-mini';      // built-in web search
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile'; // normal chat
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

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
function buildLocalPrompt(bot, history, userMessage) {
  const profile = typeof bot.domainProfile === 'string'
    ? JSON.parse(bot.domainProfile)
    : bot.domainProfile;

  let p = `${bot.systemPrompt}\n`;
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

async function fetchFromLocal(bot, history, userMessage) {
  const promptText = buildLocalPrompt(bot, history, userMessage);
  let resp;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    resp = await fetch(LOCAL_LLM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText, temperature: 0.7, max_tokens: 800 }),
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch (e) {
    throw new LocalUnavailableError(`Local LLM not reachable: ${e.message}`);
  }
  if (!resp.ok) throw new LocalUnavailableError(`Local LLM error: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  const text = (data.response || data.text || '').trim();
  if (!text) throw new LocalUnavailableError('Local LLM returned empty response');
  return { response: text, sources: null, provider: 'local' };
}

async function fetchFromGroqChat(bot, history, userMessage) {
  if (!groq) throw new Error('Groq not configured');
  const messages = [
    { role: 'system', content: bot.systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];
  const completion = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 900
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
    { role: 'system', content: `${bot.systemPrompt}\n\nWhen answering questions about current/recent information, use web search and cite what you find.` },
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
    config: { systemInstruction: bot.systemPrompt, tools: [{ googleSearch: {} }] }
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

// --- Normal chain: local -> Groq cloud ---------------------------------------
async function answerNormal(bot, history, userMessage, log) {
  try { return await fetchFromLocal(bot, history, userMessage); }
  catch (e) {
    log.push(`Local unavailable (${e.message}); falling back to Groq cloud`);
    if (hasGroq()) { try { return await fetchFromGroqChat(bot, history, userMessage); } catch (e2) { log.push(`Groq cloud failed: ${e2.message}`); } }
    if (hasGemini()) { try { return await fetchFromGemini(bot, history, userMessage); } catch (e3) { log.push(`Gemini failed: ${e3.message}`); } }
    throw new Error('No AI provider available (local server down and no working cloud key)');
  }
}

// ============================================================================
const uid = () => Math.random().toString(36).substring(2, 11);

// Shared: run the Domain Guard + current-info router and persist the answer.
// `history` must be the messages that came BEFORE `userMessage`.
async function routeAndPersist(bot, conversationId, userMessage, history) {
  // ---- 1. DOMAIN GUARD ----
  const relevance = await checkDomainRelevance(bot, userMessage, history);
  console.log(`\n[DomainGuard] Bot: ${bot.domain} · ${bot.subdomain} | Query: "${userMessage}"`);
  console.log(`  Layer: ${relevance.layer ?? '?'} | Result: ${relevance.result} | Confidence: ${relevance.confidence} | ${relevance.reason}`);

  if (!relevance.relevant) {
    console.log(`[Router] Action: DOMAIN_REDIRECT`);
    const redirectMsg = generateRedirectMessage(bot);
    const aid = uid();
    db.addMessage(aid, conversationId, 'assistant', redirectMsg, Date.now(), 'domain-guard', null);
    return { response: redirectMsg, messageId: aid, provider: 'domain-guard', sources: null };
  }

  // ---- 1b. GREETING / "WHAT CAN YOU DO?" ----
  // Answered straight from the bot's own profile: instant, costs no AI call, and
  // works even with every provider offline. Crucially it is never a refusal —
  // a bot that rejects "hi" looks broken.
  if (relevance.kind === 'greeting' || relevance.kind === 'meta') {
    console.log(`[Router] Action: BOT_PROFILE_REPLY (${relevance.kind})`);
    const introMsg = generateIntroMessage(bot, relevance.kind);
    const aid = uid();
    db.addMessage(aid, conversationId, 'assistant', introMsg, Date.now(), 'profile', null);
    return { response: introMsg, messageId: aid, provider: 'profile', sources: null };
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
  try {
    result = useWeb
      ? await answerWeb(bot, history, userMessage, log)
      : await answerNormal(bot, history, userMessage, log);
  } catch (e) {
    if (log.length) console.log('  ' + log.join('\n  '));
    throw e;
  }
  if (log.length) console.log('  ' + log.join('\n  '));
  console.log(`[Router] Answered via: ${result.provider}`);

  const aid = uid();
  db.addMessage(aid, conversationId, 'assistant', result.response, Date.now(), result.provider, result.sources);
  return { response: result.response, messageId: aid, provider: result.provider, sources: result.sources };
}

export async function generateChatResponse(botId, conversationId, userMessage) {
  const bot = db.getBot(botId);
  if (!bot) throw new Error('Bot not found');

  const messages = db.getMessages(conversationId);
  const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

  // Persist the user message up front so it is never lost, even if the AI call fails.
  db.addMessage(uid(), conversationId, 'user', userMessage, Date.now());

  return routeAndPersist(bot, conversationId, userMessage, history);
}

// Regenerate the most recent assistant reply for a conversation.
export async function regenerateChatResponse(botId, conversationId) {
  const bot = db.getBot(botId);
  if (!bot) throw new Error('Bot not found');

  let messages = db.getMessages(conversationId);
  // Drop trailing assistant message(s) so we can produce a fresh one.
  while (messages.length && messages[messages.length - 1].role === 'assistant') {
    db.deleteMessage(messages[messages.length - 1].id);
    messages.pop();
  }
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new Error('Nothing to regenerate — no previous user message found.');
  }
  const lastUser = messages[messages.length - 1];
  const history = messages.slice(0, -1).slice(-10).map(m => ({ role: m.role, content: m.content }));

  return routeAndPersist(bot, conversationId, lastUser.content, history);
}

// Report which providers are available (used by /api/health + the UI status dot).
export async function getProviderStatus() {
  let localReachable = false;
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
