/**
 * Team Mode (Checkpoint 11) — orchestrator bot routing.
 *
 * A bot with teamMode=true acts as an ORCHESTRATOR: instead of answering with
 * its own persona, it routes each user message to the most relevant specialist
 * bot in the same organization. The specialist answers in its own voice while
 * the orchestrator's identity (name, design DNA) stays on the conversation.
 *
 * Routing is two-stage (fast → smart):
 *   Stage 1 (fast, free, offline): lexical scoring over each candidate bot's
 *     domain lexicon + allowedTopics + commonIntents (reuses DOMAIN_LEXICON).
 *   Stage 2 (only when Stage 1 is ambiguous): one tiny Groq call that picks
 *     the best bot from the shortlist. If Groq is unavailable the top lexical
 *     candidate is used — routing never dead-ends.
 *
 * Every routed answer is logged as a `team.route` analytics event so the
 * dashboard can show which specialists carry the most traffic.
 */
import { prisma } from '../prisma.js';
import { lexiconFor } from '../domainLexicon.js';
import { logActivity } from './audit.service.js';
import Groq from 'groq-sdk';

const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';
const hasGroq = () => !!GROQ_KEY && GROQ_KEY !== 'MISSING_API_KEY' && !GROQ_KEY.startsWith('your_');
const groq = hasGroq() ? new Groq({ apiKey: GROQ_KEY }) : null;

/**
 * Small talk / meta questions stay with the orchestrator (cheap gate).
 * Exported so tests can verify it offline.
 */
export function isTeamGateQuery(text) {
  if (String(text).length > 500) return false;
  return /^\s*(?:(?:hi+|hey+|hello+|yo|thanks|thankyou|thank you(?: so much| a lot| a ton)?|bye+|ok(?:ay)?|vanakkam|good (?:morning|afternoon|evening|night))\b(?:\s+(?:there|all|everyone|guys|folks|team))?)\s*[!.,?]*$/i.test(text)
    || /^\s*(?:who are you|what can you do|what do you do|help(?: me)?|what is this|introduce yourself)\b[\s?!.]*$/i.test(text);
}

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does',
  'did', 'can', 'could', 'you', 'your', 'me', 'my', 'i', 'we', 'our', 'it',
  'this', 'that', 'what', 'which', 'who', 'whom', 'how', 'why', 'when', 'where',
  'and', 'or', 'but', 'for', 'to', 'of', 'in', 'on', 'at', 'with', 'about',
  'give', 'tell', 'please', 'some', 'any', 'be', 'have', 'has', 'will', 'would']);

/** Extract meaningful lowercase tokens from a message. */
export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .slice(0, 60);
}

/** Overlap score: how many query tokens hit a term list (partial stem match). */
function overlapScore(queryTokens, terms) {
  if (!queryTokens.length || !terms?.length) return 0;
  const dict = new Set();
  for (const term of terms) {
    const t = String(term).toLowerCase().trim();
    if (t) dict.add(t);
  }
  let hits = 0;
  for (const q of queryTokens) {
    if (dict.has(q)) { hits += 1; continue; }
    // light stemming: plural / verb forms
    const stems = [q.replace(/(?:ies)$/, 'y'), q.replace(/(?:es|s)$/, ''), q.replace(/(?:ing|ed)$/, '')];
    if (stems.some((s) => s.length > 2 && dict.has(s))) hits += 1;
  }
  return hits / queryTokens.length;
}

/** Parse a bot's stored domain profile JSON. */
function profileOf(bot) {
  try {
    return typeof bot.domainProfile === 'string'
      ? JSON.parse(bot.domainProfile || 'null')
      : bot.domainProfile;
  } catch { return null; }
}

/**
 * Stage 1 — lexical scores for one candidate bot (0..1).
 * Weighted: lexicon vocabulary (heavy) + allowedTopics + commonIntents + name/domain.
 */
export function lexicalScore(bot, queryTokens) {
  const profile = profileOf(bot) || {};
  const lex = lexiconFor(profile.domain || bot.domain, profile.specialty || bot.subdomain) || [];
  const parts = [
    [lex, 1.0],
    [profile.allowedTopics || [], 0.9],
    [profile.commonIntents || [], 0.7],
    [[String(bot.name || ''), String(bot.domain || ''), String(bot.subdomain || '')].join(' '), 0.5],
  ];
  let best = 0;
  for (const [terms, w] of parts) {
    const s = overlapScore(queryTokens, terms) * w;
    if (s > best) best = s;
  }
  // small bonus: sum of weaker signals (a query touching 2 facets is stronger)
  const sumRest = parts.reduce((acc, [terms, w]) => acc + overlapScore(queryTokens, terms) * w, 0);
  return Math.min(1, Math.max(best, sumRest * 0.35));
}

/**
 * Stage 2 — Groq shortlist pick. Returns the winning bot id or null
 * (caller then falls back to the top lexical candidate).
 */
async function groqPick(candidates, message) {
  if (!hasGroq() || !candidates.length) return null;
  const list = candidates.map((b, i) =>
    `${i + 1}. ${b.name} — ${(profileOf(b)?.description || b.description || b.subdomain || '').slice(0, 90)}`).join('\n');
  const system = `You are a routing engine for a team of chatbots. Pick the ONE best specialist for the user's message.
Candidates:
${list}

Rules:
- Judge by TOPIC, not politeness. Small talk, greetings and meta questions ("hi", "what can you do") belong to the orchestrator, not a specialist.
- Reply with ONLY the candidate number (e.g. "2"). If none fit, reply "0".`;
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_CHAT_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: message.slice(0, 500) }],
      temperature: 0,
      max_tokens: 4,
    });
    const ans = (completion.choices?.[0]?.message?.content || '').trim();
    const n = parseInt(ans.replace(/[^0-9]/g, ''), 10);
    if (!n || n < 1 || n > candidates.length) return null;
    return candidates[n - 1].id;
  } catch { return null; }
}

/**
 * Pick the specialist for a message inside an org.
 * Returns { bot, mode, candidates, scores } — bot is the chosen specialist,
 * or null when routing to another bot makes no sense (message targets the
 * orchestrator itself / no viable candidate).
 */
export async function pickSpecialist(orgId, selfBot, message, { excludeIds = [] } = {}) {
  if (!orgId) {
    orgId = (await prisma.bot.findUnique({ where: { id: selfBot.id }, select: { orgId: true } }))?.orgId;
  }
  if (!orgId) return { bot: null, mode: 'self', score: 0, candidates: [], scores: [] };
  const bots = await prisma.bot.findMany({
    where: { orgId, id: { notIn: [selfBot.id, ...excludeIds] } },
    select: { id: true, name: true, domain: true, subdomain: true, description: true, domainProfile: true },
  });
  if (!bots.length) return { bot: null, mode: 'self', candidates: [], scores: [] };

  const qt = tokens(message);
  const scored = bots
    .map((b) => ({ bot: b, score: lexicalScore(b, qt) }))
    .sort((a, b) => b.score - a.score);

  // Top-3 shortlist for the smart stage.
  const shortlist = scored.filter((s) => s.score >= 0.08).slice(0, 3);
  if (!shortlist.length) return { bot: null, mode: 'self', candidates: [], scores: scored };

  let chosen;
  let mode = 'lexical';
  const groqId = await groqPick(shortlist.map((s) => s.bot), message);
  if (groqId) {
    chosen = shortlist.find((s) => s.bot.id === groqId) || shortlist[0];
    mode = 'groq';
  } else {
    chosen = shortlist[0];
  }
  return { bot: chosen.bot, mode, score: chosen.score, candidates: shortlist.map((s) => s.bot.id), scores: scored };
}

/**
 * Re-tag a persisted assistant message with the team routing provider label
 * (e.g. "team:Chef Marco") so the UI can show who actually answered.
 */
export async function tagRoutedMessage(messageId, specialistName) {
  try {
    await prisma.message.update({
      where: { id: messageId },
      data: { provider: `team:${specialistName}` },
    });
  } catch { /* cosmetic only */ }
}

/**
 * Record a routing decision for analytics.
 */
export async function logRoute({ orgId, orchestratorId, specialistId, specialistName, message, mode, score, conversationId }) {
  try {
    await logActivity({
      orgId,
      actorId: null,
      actorName: 'team-router',
      eventType: 'team.route',
      botId: orchestratorId,
      data: { specialistId, specialistName, mode, score, conversationId, preview: String(message).slice(0, 120) },
    });
  } catch { /* analytics must never break chat */ }
}
