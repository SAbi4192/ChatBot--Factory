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

// Common English words that legitimately appear inside MANY domains' own
// questions ("what language should I learn" for programming, "century ride"
// for cycling, "separation of powers" for politics, "monitor a service" for
// devops, "memory leak" for programming). They must NOT count as OFF-TOPIC
// evidence — but they MAY still count as in-field evidence when they appear in
// the bot's own lexicon, so they are filtered only from the foreign set.
const AMBIGUOUS_TERMS = new Set([
  'language', 'languages', 'century', 'strategy', 'separation', 'monitor',
  'memory', 'song', 'songs', 'student', 'students', 'brake', 'stress',
  'design', 'color', 'colour', 'food', 'brand', 'style', 'water', 'business',
  'test', 'tests', 'analysis', 'budget', 'kitchen', 'meal', 'makeup',
  'persona', 'usability', 'service', 'web service', 'arrangement', 'development',
  'develop', 'learn', 'learning', 'engage', 'engagement', 'classroom',
  'law', 'independence', 'power', 'space', 'rate', 'order', 'form', 'field',
  'level', 'point', 'line', 'set', 'key', 'view', 'rights', 'ratio', 'phase',
  'model', 'result', 'function', 'functions', 'variable', 'variables',
  'class', 'switch', 'branch', 'loop', 'expression', 'code', 'system', 'systems'
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

// Words that can be capitalised inside an ordinary sentence (pronouns, openers,
// common nouns) — never treated as "proper noun" off-topic evidence.
const CAPITALISED_STOP = new Set([
  'the', 'a', 'an', 'i', 'it', 'this', 'that', 'these', 'those', 'my', 'your',
  'you', 'our', 'their', 'his', 'her', 'its', 'we', 'they', 'he', 'she', 'me',
  'him', 'us', 'them', 'who', 'what', 'which', 'why', 'how', 'when', 'where',
  'is', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could', 'should',
  'would', 'will', 'shall', 'may', 'might', 'please', 'hi', 'hey', 'hello',
  'ok', 'okay', 'thanks', 'thank', 'tell', 'name', 'any', 'one', 'two', 'three',
  'five', 'list', 'source', 'information', 'chatbot', 'assistant', 'also',
  'want', 'like', 'know', 'ask', 'give', 'show', 'explain', 'describe', 'best',
  'top', 'new', 'old', 'first', 'last', 'next', 'every', 'all', 'some', 'many',
  'more', 'most', 'other', 'another', 'such', 'own', 'same', 'just', 'only'
]);

/**
 * Capitalised words that look like proper nouns (people / places / entities)
 * with no connection to the bot's own vocabulary. Vocabulary matching can't
 * see people's names — "Who is Donald Trump?" on a dental bot has zero keyword
 * overlap with anything, so this is the only way to catch it deterministically.
 */
function properNounHits(rawText, ownVocab) {
  const words = String(rawText || '').split(/\s+/).filter(Boolean);
  const out = [];
  let atSentenceStart = true;
  for (const w of words) {
    const clean = w.replace(/[^A-Za-z'-]/g, '');
    const endsSentence = /[.!?]$/.test(w);

    if (clean.length >= 3 && /^[A-Z]/.test(clean)) {
      const lower = clean.toLowerCase();
      const isName =
        !atSentenceStart &&
        !CAPITALISED_STOP.has(lower) &&
        !STOPWORDS.has(lower) &&
        !AMBIGUOUS_TERMS.has(lower) &&
        !ownVocab.some((t) => {
          const tl = String(t).toLowerCase();
          if (tl === lower) return true;
          if (tl.length > 3 && (tl.includes(lower) || lower.includes(tl))) return true;
          return false;
        });
      if (isName) out.push(clean);
    }
    atSentenceStart = endsSentence;
  }
  return out;
}

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
  'how can you help', 'how do you help', 'your capabilities',
  'what are your features', 'how do you work',
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

/** Flatten semanticRelationships ("Moon -> orbits -> Earth") into searchable terms. */
function semanticTerms(profile) {
  const out = [];
  for (const rel of profile?.semanticRelationships || []) {
    if (typeof rel !== 'string') continue;
    for (const part of rel.split(/->|→/)) {
      const t = String(part).trim().toLowerCase();
      if (t && t.length > 2) out.push(t);
    }
  }
  return out;
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
  const semantics = semanticTerms(profile);
  const own = [
    ...(profile.allowedTopics || []),
    ...(profile.relatedTopics || []),
    ...(profile.commonIntents || []),
    ...(profile.synonyms || []),
    ...semantics,
    ...lexiconFor(domain, specialty)
  ];
  const foreign = [
    ...(profile.excludedTopics || []),
    ...foreignLexiconFor(domain, specialty)
  ];

  const ownHits     = hits(text, own);
  const relatedHits = hits(text, profile.relatedTopics || []);
  const semHits     = hits(text, semantics);
  // Ambiguous common words never prove a question is OFF-topic; they only ever
  // serve as in-field evidence via the `own` set above.
  const foreignHits = hits(text, foreign).filter(t => !AMBIGUOUS_TERMS.has(String(t)));
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

  // ---- Layer 1b: semantic relevance — related terms / relationship facts ----
  // "Kitchen tools for a cooking bot" or "the Moon vs Earth" for astronomy are
  // clearly within the field even though they use different exact vocabulary.
  if (relatedHits.length || semHits.length) {
    return {
      relevant: true, confidence: 0.85, layer: 1, result: 'SEMANTIC',
      reason: `Semantically related to the field: ${[...relatedHits, ...semHits].join(', ')}`, ownHits, foreignHits
    };
  }

  // ---- Layer 2: positive evidence it belongs to another field ----
  if (foreignHits.length) {
    // If we have a semantic classifier, let it decide rather than hard-rejecting
    // based on one word. We only hard-reject here if there is NO classifier
    // available to verify — and even then we stay lenient when the question is
    // about tools/context adjacent to the domain ("what kitchen knife do I
    // need?" from a cooking bot).
    if (!hasGroq() && !ownHits.length && !relatedHits.length) {
      return {
        relevant: false, confidence: 0.88, layer: 2, result: 'OUT_OF_DOMAIN',
        reason: `Belongs to another field: ${foreignHits.join(', ')}`, ownHits, foreignHits
      };
    }
  }

  // ---- Layer 2b: "Who is <Person>?" with no in-field connection ----
  // Vocabulary matching can't see people's names: "Who is Donald Trump?" on a
  // dental bot has ZERO keyword overlap with anything. When the user asks about
  // a person/entity and the capitalised name has no link to this field, redirect
  // firmly instead of letting the LLM improvise a vague answer.
  const personQuery = /who(?:'s| is| was| are| were)?\b|tell me about|do you know|have you heard of/.test(text);
  const names = personQuery ? properNounHits(userMessage, own) : [];
  if (names.length && !ownHits.length && !relatedHits.length && !semHits.length) {
    return {
      relevant: false, confidence: 0.8, layer: 2, result: 'OUT_OF_DOMAIN',
      reason: `Asking about an unrelated person/entity: ${names.join(', ')}`, ownHits, foreignHits
    };
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

export function generateRedirectMessage(bot, userMessage = '') {
  const topics = exampleTopics(bot, 5);
  const list = topics.length ? topics.join(', ') : bot.subdomain;
  const topic = String(userMessage || '').trim().slice(0, 80);
  const lead = topic ? `\n\n"${topic}" is outside my specialty` : `\n\nThat question is outside my specialty`;
  return `I'm a **${bot.domain} · ${bot.subdomain}** assistant, so I only answer ${bot.domain}-related questions.${lead} — I'd rather be honest than guess.

Please ask me only ${bot.domain} questions, like ${list}. I'll go as deep as you want!`;
}

/**
 * Reply for greetings and "what can you do?" — the offline fallback used when
 * no AI provider can produce an in-character reply. Openers and topics rotate
 * so even the deterministic version never feels copy-pasted.
 */
export function generateIntroMessage(bot, kind = 'meta') {
  const topics = exampleTopics(bot, 8);
  const starters = (typeof bot.starterQuestions === 'string'
    ? JSON.parse(bot.starterQuestions || '[]')
    : bot.starterQuestions) || [];

  const openers = kind === 'greeting'
    ? [
        () => `Hello — ${bot.name} here.`,
        () => `Hey! ${bot.name} at your service.`,
        () => `Hi! ${bot.name} speaking — nice to meet you.`,
        () => `Hey there — ${bot.name} ready when you are.`,
      ]
    : [
        () => `I'm ${bot.name}, a **${bot.domain} · ${bot.subdomain}** specialist.`,
        () => `I'm ${bot.name} — I specialise in **${bot.subdomain}**.`,
        () => `Meet ${bot.name}: your ${bot.domain} · ${bot.subdomain} assistant.`,
        () => `I'm ${bot.name}, built for **${bot.domain}** questions — ${bot.subdomain} in particular.`,
      ];
  const opener = openers[Math.floor(Math.random() * openers.length)]();

  // Rotate a different subset of topics each time.
  const shuffled = [...topics].sort(() => Math.random() - 0.5).slice(0, 4);
  const pick = shuffled.length ? shuffled.join(', ') : bot.subdomain;

  let msg = `${opener} I focus on **${bot.subdomain}**`;
  msg += shuffled.length ? `, covering things like ${pick}.` : '.';

  if (starters.length) {
    const pickStarters = [...starters].sort(() => Math.random() - 0.5).slice(0, 3);
    msg += `\n\nA few things you could ask me:\n`;
    msg += pickStarters.map(q => `- ${q}`).join('\n');
  }
  msg += `\n\nWhat would you like to know?`;
  return msg;
}
