import Groq from 'groq-sdk';
import { lexiconFor, foreignLexiconFor } from './domainLexicon.js';

/**
 * ============================================================
 * DOMAIN GUARD  (runs BEFORE any answer is generated)
 * ------------------------------------------------------------
 * Decision order — first match wins:
 *
 *   Layer 0  Greeting / "what can you do?"      -> ALWAYS ALLOW
 *   Layer 1  Evidence it IS in the bot's field  -> ALLOW  (beats Layer 2)
 *   Layer 2  Evidence it belongs to ANOTHER     -> REDIRECT (no AI cost)
 *            field, with no own-field evidence
 *   Layer 3  Context-aware follow-up            -> ALLOW
 *   Layer 4  Strict YES/NO classifier (local -> Groq)
 *   Default  ALLOW
 *
 * Why the default is ALLOW (it used to be REDIRECT):
 *   Refusing a fair question is the worst failure this app can have — it
 *   makes a bot look broken. Being slightly generous is safe because the
 *   bot's own system prompt already pins it to its specialty, so an
 *   edge-case question still gets answered *in character*. Redirects stay
 *   trustworthy because Layer 2 detects off-topic questions POSITIVELY
 *   (the question matches another field's vocabulary) rather than by
 *   merely failing to recognise the words used.
 *
 * Every layer above the classifier is deterministic, so domain behaviour
 * is identical whether or not any AI provider is reachable.
 * ============================================================
 */

const LOCAL_LLM_URL   = process.env.LOCAL_LLM_URL   || 'http://127.0.0.1:8000/api/chat';
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';
const GROQ_KEY        = process.env.GROQ_API_KEY;
const hasGroq         = () => !!GROQ_KEY && GROQ_KEY !== 'MISSING_API_KEY' && !GROQ_KEY.startsWith('your_');
const groq            = hasGroq() ? new Groq({ apiKey: GROQ_KEY }) : null;

// Words too generic to prove a query is on-topic (they would match anything).
// They are ignored as evidence in BOTH directions: as own-field evidence they are
// meaningless, and as foreign evidence they are actively dangerous — "what is the
// function of a chipset?" must not be filed under Programming.
const STOPWORDS = new Set([
  'basics', 'basic', 'history', 'example', 'examples', 'how it works', 'trends',
  'future trends', 'best practices', 'advanced concepts', 'concepts', 'concept',
  'tips', 'overview', 'introduction', 'guide', 'information', 'help', 'question',
  // Ordinary English that several lexicons legitimately contain.
  'function', 'functions', 'variable', 'variables', 'object', 'objects',
  'model', 'models', 'version', 'versions', 'type', 'types', 'level', 'levels',
  'update', 'updated', 'course', 'plan', 'planning', 'value', 'values',
  'difference', 'compare', 'comparison', 'performance', 'price', 'cost',
  'system', 'systems', 'trend', 'branch', 'switch', 'class', 'writing', 'reading',
  // 'series' (Ryzen 9 series / Netflix series / infinite series) and 'app' are
  // shared by too many fields to mean anything on their own. 'look' ships in the
  // Fashion profile but is an ordinary verb ("what should I look for?").
  'series', 'app', 'apps', 'look', 'looking', 'looks'
]);

// Typos and chat shorthand, so "lastest versoin" and "what can u do" behave
// exactly like the correctly spelled question.
const NORMALISE = [
  [/\bu\b/g, 'you'], [/\bur\b/g, 'your'], [/\bpls\b/g, 'please'], [/\bplz\b/g, 'please'],
  [/\bthx\b/g, 'thanks'], [/\bwat\b/g, 'what'], [/\bwut\b/g, 'what'], [/\bteh\b/g, 'the'],
  [/\bwhcih\b/g, 'which'], [/\blastest\b/g, 'latest'], [/\blatset\b/g, 'latest'],
  [/\bletest\b/g, 'latest'], [/\bnewst\b/g, 'newest'], [/\bversoin\b/g, 'version'],
  [/\bhardward\b/g, 'hardware'], [/\bhardwar\b/g, 'hardware'], [/\bsoftwear\b/g, 'software'],
  [/\bprocesor\b/g, 'processor'], [/\bgraphic card\b/g, 'graphics card'],
  [/\brecomend\w*\b/g, 'recommend'], [/\bdifferance\b/g, 'difference'],
  [/\bdiffrence\b/g, 'difference'], [/\bbetween\b/g, 'between'], [/\bwich\b/g, 'which']
];

export function normaliseQuery(message) {
  let t = String(message || '').toLowerCase();
  t = t.replace(/[?!.,;:()"'`*]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, sub] of NORMALISE) t = t.replace(re, sub);
  return t;
}
const normalise = normaliseQuery;

// ---- Layer 0 vocabulary ----------------------------------------------------
const GREETINGS = [
  'hi', 'hii', 'hiii', 'hey', 'heya', 'hello', 'helo', 'hiya', 'yo', 'sup',
  'howdy', 'greetings', 'namaste', 'hola', 'good morning', 'good afternoon',
  'good evening', 'good day', 'thanks', 'thank you', 'ty', 'ok', 'okay', 'cool',
  'nice', 'great', 'bye', 'goodbye', 'see you', 'good night', 'gn'
];

const META_PHRASES = [
  'what can you do', 'what do you do', 'what can i ask', 'what should i ask',
  'what are you', 'who are you', 'what is your name', 'your name', 'about you',
  'introduce yourself', 'tell me about yourself', 'what are you good at',
  'what do you specialize', 'what do you specialise', 'your specialty',
  'your speciality', 'your expertise', 'what topics', 'which topics',
  'how can you help', 'how do you help', 'can you help me', 'what help',
  'your capabilities', 'what are your features', 'how do you work',
  'are you an ai', 'are you a bot', 'are you human', 'what is this'
];

function detectSocial(text) {
  const words = text.split(' ').filter(Boolean);
  // Meta questions can be phrased at any length.
  if (META_PHRASES.some(p => text.includes(p))) return 'meta';
  // Greetings only count when the message is essentially JUST a greeting,
  // so "hello, how do I overclock my CPU?" is treated as the real question.
  if (words.length <= 4 && GREETINGS.some(g => text === g || words[0] === g)) return 'greeting';
  return null;
}

// Temporal signals => likely a "current info" question.
const TEMPORAL = ['latest', 'newest', 'recent', 'recently', 'current', 'currently',
  'today', 'yesterday', 'now', 'upcoming', 'just released', 'this week', 'this month',
  'this year', 'breaking', 'news', 'update', 'updated'];

// Very short follow-ups that only make sense with prior context.
const FOLLOWUP_HINTS = ['which one', 'what about', 'tell me more', 'more', 'why', 'how',
  'and', 'that one', 'this one', 'the first', 'the second', 'easiest', 'hardest',
  'best', 'cheapest', 'explain', 'elaborate', 'continue', 'go on', 'next'];

function parseProfile(bot) {
  return typeof bot.domainProfile === 'string'
    ? JSON.parse(bot.domainProfile || 'null')
    : bot.domainProfile;
}

function matches(text, topic) {
  const t = String(topic || '').toLowerCase().trim();
  if (!t || STOPWORDS.has(t)) return false;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Single words must match as WHOLE words. Substring matching produced real
  // absurdities: "dress" inside "IP a(ddress)", "king" inside "coo(king)",
  // "word" inside "pass(word)", "ram" inside "prog(ram)".
  if (!t.includes(' ')) {
    // \b does not work next to +, #, & etc. (c++, s&p 500), so fall back to a
    // substring test for terms that are not purely word characters.
    if (!/^[\w-]+$/.test(t)) return text.includes(t);
    // Allow a trailing plural/possessive so "colour" matches "colours".
    return new RegExp(`\\b${esc(t)}(?:s|es|'s)?\\b`).test(text);
  }

  // Multi-word phrases are already specific enough for a substring test, which
  // keeps them tolerant of inflection ("thermal throttling" in "throttling").
  return text.includes(t);
}

/** Which of `topics` appear in the text (used for evidence + logging). */
function hits(text, topics, limit = 6) {
  const found = [];
  for (const t of topics) {
    if (matches(text, t)) {
      found.push(t);
      if (found.length >= limit) break;
    }
  }
  return found;
}

async function classifyLocal(profile, userMessage, historyText) {
  const allowed = (profile.allowedTopics || []).slice(0, 40).join(', ');
  const intents = (profile.commonIntents || []).slice(0, 10).join(', ');
  const questionTypes = (profile.questionTypes || []).slice(0, 10).join(', ');
  
  const prompt = `You are a strict domain-relevance classifier. Do NOT answer the question.
Bot domain: ${profile.domain} (${profile.specialty})
Domain description: ${profile.description}
Relevant topics: ${allowed}
Common Intents: ${intents}
Supported Question Types: ${questionTypes}
Boundary Rules: ${profile.boundaries || 'None'}
Recent context: ${historyText || 'None'}
User message: "${userMessage}"

Rules:
- Brand names, product names, companies and models that belong to this field COUNT AS RELATED
  (for example, for computer hardware: Intel, AMD, Ryzen, Nvidia).
- Comparisons, recommendations, and "which is better" questions about things in this field COUNT AS RELATED.
- Semantically equivalent phrases or valid question types within this domain COUNT AS RELATED even if exact vocabulary is missing.
- A follow-up to the recent context COUNTS AS RELATED.

Is the user's INTENT logically related to this bot's domain or specialty? Answer EXACTLY YES or NO:`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const resp = await fetch(LOCAL_LLM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, temperature: 0.0, max_tokens: 4 }),
    signal: controller.signal
  });
  clearTimeout(timeout);
  if (!resp.ok) throw new Error(`local classifier ${resp.status}`);
  const data = await resp.json();
  return (data.response || data.text || '').trim().toUpperCase();
}

async function classifyGroq(profile, userMessage, historyText) {
  const allowed = (profile.allowedTopics || []).slice(0, 40).join(', ');
  const intents = (profile.commonIntents || []).slice(0, 10).join(', ');
  const questionTypes = (profile.questionTypes || []).slice(0, 10).join(', ');
  
  const system = `You are a strict domain-relevance classifier. You never answer the user's question; you only judge relevance.
Bot domain: ${profile.domain} (${profile.specialty}).
Domain description: ${profile.description}
Relevant topics: ${allowed}
Common Intents: ${intents}
Supported Question Types: ${questionTypes}
Boundary Rules: ${profile.boundaries || 'None'}

Rules:
- Brand names, product names, companies and specific models belonging to this field count as RELATED.
- Comparisons, recommendations, calculations, and explanations about things in this field count as RELATED.
- Semantically equivalent phrases or valid domain questions MUST count as RELATED even if exact vocabulary is missing.
- A follow-up to the recent context counts as RELATED.
- Apply Boundary Rules strictly to reject completely unrelated topics.

Reply with ONLY one word: YES or NO.`;
  const user = `Recent context: ${historyText || 'None'}\nUser message: "${userMessage}"`;
  const completion = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0,
    max_tokens: 3
  });
  return (completion.choices?.[0]?.message?.content || '').trim().toUpperCase();
}

export async function checkDomainRelevance(bot, userMessage, history = []) {
  const profile = parseProfile(bot);
  const text = normalise(userMessage);

  // ---- Layer 0: greetings and "what can you do?" are never off-topic ----
  const social = detectSocial(text);
  if (social) {
    return {
      relevant: true, kind: social, confidence: 1, layer: 0,
      result: 'SOCIAL', reason: social === 'greeting' ? 'Greeting' : 'Question about the bot itself'
    };
  }

  if (!profile) {
    return { relevant: true, confidence: 0.5, layer: 0, result: 'AMBIGUOUS', reason: 'No domain profile' };
  }

  const domain = profile.domain || bot.domain;
  const specialty = profile.specialty || bot.subdomain;

  // Own-field vocabulary = what was stored on the bot PLUS the shared lexicon
  // looked up by domain/specialty name. The lexicon is what lets bots that were
  // generated before the vocabulary existed still recognise "Intel" or "Ryzen".
  const own = [
    ...(profile.allowedTopics || []),
    ...(profile.relatedTopics || []),
    ...(profile.commonIntents || []),
    ...(profile.synonyms || []),
    ...lexiconFor(domain, specialty)
  ];
  const foreign = [
    ...(profile.excludedTopics || []),
    ...foreignLexiconFor(domain, specialty)
  ];

  const ownHits     = hits(text, own);
  const foreignHits = hits(text, foreign);
  const isTemporal  = TEMPORAL.some(sig => matches(text, sig));
  const wordCount   = text.split(' ').filter(Boolean).length;
  const looksFollowUp = FOLLOWUP_HINTS.some(h => matches(text, h)) || wordCount <= 4;

  // ---- Layer 1: in-field evidence wins ----
  // Deliberately checked BEFORE the off-topic test: "Can I use Python to read
  // my CPU temperature?" mentions another field but is a real hardware question.
  if (ownHits.length) {
    return {
      relevant: true, confidence: 0.95, layer: 1, result: 'IN_DOMAIN',
      reason: `Matches own field: ${ownHits.join(', ')}`, ownHits, foreignHits
    };
  }

  // ---- Layer 2: positive evidence it belongs to another field ----
  if (foreignHits.length) {
    // If we have a semantic classifier, let it decide rather than hard-rejecting based on one word.
    // We only hard-reject here if there is NO classifier available to verify.
    if (!hasGroq()) {
      return {
        relevant: false, confidence: 0.9, layer: 2, result: 'OUT_OF_DOMAIN',
        reason: `Belongs to another field: ${foreignHits.join(', ')}`, ownHits, foreignHits
      };
    }
  }

  // ---- Layer 3: context-aware follow-up ("and the newest one?") ----
  if (history.length > 0 && (isTemporal || looksFollowUp)) {
    return {
      relevant: true, confidence: 0.8, layer: 3, result: 'IN_DOMAIN',
      reason: 'Follow-up to the current conversation', ownHits, foreignHits
    };
  }

  // ---- Layer 4: strict YES/NO classifier ----
  const historyText = history.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

  try {
    const ans = await classifyLocal(profile, userMessage, historyText);
    if (ans.includes('YES')) return { relevant: true,  confidence: 0.8, layer: 4, result: 'IN_DOMAIN',     reason: 'Local classifier: YES' };
    if (ans.includes('NO'))  return { relevant: false, confidence: 0.8, layer: 4, result: 'OUT_OF_DOMAIN', reason: 'Local classifier: NO' };
  } catch (e) {
    console.log(`[DomainGuard] local classifier unavailable: ${e.message}`);
  }

  if (hasGroq()) {
    try {
      const ans = await classifyGroq(profile, userMessage, historyText);
      if (ans.includes('YES')) return { relevant: true,  confidence: 0.82, layer: 4, result: 'IN_DOMAIN',     reason: 'Groq classifier: YES' };
      if (ans.includes('NO'))  return { relevant: false, confidence: 0.82, layer: 4, result: 'OUT_OF_DOMAIN', reason: 'Groq classifier: NO' };
    } catch (e) {
      console.log(`[DomainGuard] Groq classifier failed: ${e.message}`);
    }
  }

  // ---- Default: ALLOW ----
  // Nothing suggests another field, so answer it. The bot's system prompt keeps
  // the reply inside its specialty even for an unrecognised phrasing.
  return {
    relevant: true, confidence: 0.6, layer: 5, result: 'IN_DOMAIN',
    reason: 'No evidence of another field; answering in character', ownHits, foreignHits
  };
}

/** Example topics for this bot, preferring concrete terms over filler. */
function exampleTopics(bot, limit = 5) {
  const profile = parseProfile(bot);
  const pool = [
    ...(profile?.allowedTopics || []),
    ...lexiconFor(profile?.domain || bot.domain, profile?.specialty || bot.subdomain)
  ];
  const seen = new Set();
  const picked = [];
  for (const t of pool) {
    const k = t.toLowerCase();
    if (STOPWORDS.has(k) || seen.has(k)) continue;
    if (k === String(bot.domain).toLowerCase()) continue;
    seen.add(k);
    picked.push(t);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function generateRedirectMessage(bot) {
  const topics = exampleTopics(bot, 5);
  const list = topics.length ? topics.join(', ') : bot.subdomain;
  return `That one is outside my area — I'm a **${bot.domain} · ${bot.subdomain}** specialist, so I'd only be guessing.

What I do know well: ${list}. Ask me anything along those lines and I'll go deep.`;
}

/**
 * Reply for greetings and "what can you do?" — answered from the bot's own
 * profile so it is instant, always available, and always in character.
 */
export function generateIntroMessage(bot, kind = 'meta') {
  const topics = exampleTopics(bot, 6);
  const starters = (typeof bot.starterQuestions === 'string'
    ? JSON.parse(bot.starterQuestions || '[]')
    : bot.starterQuestions) || [];

  const opener = kind === 'greeting'
    ? `Hello — ${bot.name} here.`
    : `I'm ${bot.name}, a **${bot.domain} · ${bot.subdomain}** specialist.`;

  let msg = `${opener} I focus on **${bot.subdomain}**`;
  msg += topics.length ? `, covering things like ${topics.slice(0, 4).join(', ')}.` : '.';

  if (starters.length) {
    msg += `\n\nA few things you could ask me:\n`;
    msg += starters.slice(0, 3).map(q => `- ${q}`).join('\n');
  }
  msg += `\n\nWhat would you like to know?`;
  return msg;
}
