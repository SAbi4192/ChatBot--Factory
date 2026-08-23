/**
 * NLU & guardrails engine (Checkpoint 7).
 *
 * All detectors are deterministic, offline and fast:
 *   - intent classification (rule-based first pass)
 *   - entity extraction (dates, numbers, emails, URLs, phones)
 *   - sentiment analysis (lexicon scorer)
 *   - language detection (script + stopword n-grams)
 *   - PII detection / redaction
 *   - toxicity filter (lexicon)
 *   - prompt-injection detection (patterns)
 *   - groundedness score (RAG response↔source overlap)
 */

// --- Sentiment lexicon --------------------------------------------------------

const POSITIVE = new Set([
  'good', 'great', 'awesome', 'excellent', 'amazing', 'love', 'like', 'thanks', 'thank',
  'helpful', 'nice', 'perfect', 'best', 'happy', 'glad', 'cool', 'wonderful', 'fantastic',
  'superb', 'appreciate', 'works', 'working', 'beautiful', 'sweet', 'brilliant', 'enjoy',
  'yes', 'ok', 'okay', 'fine', 'well', 'correct', 'right', 'wow', 'perfect',
]);
const NEGATIVE = new Set([
  'bad', 'terrible', 'awful', 'hate', 'dislike', 'useless', 'broken', 'wrong', 'error',
  'fail', 'failed', 'sucks', 'worst', 'poor', 'annoying', 'frustrating', 'angry', 'mad',
  'stupid', 'dumb', 'horrible', 'disappointed', 'slow', 'lag', 'bug', 'not', 'cant',
  'cannot', 'dont', "don't", 'never', 'no', 'nope', 'ugh', 'meh', 'waste',
]);

export function analyzeSentiment(text) {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  let score = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) score += 1;
    if (NEGATIVE.has(w)) score -= 1;
  }
  return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
}

// --- Intent classification ----------------------------------------------------

const INTENT_PATTERNS = [
  { intent: 'greeting', re: /^(hi|hello|hey|hola|namaste|yo|good (morning|afternoon|evening))\b/i },
  { intent: 'complaint', re: /\b(bad|terrible|broken|not working|issue|problem|angry|frustrated|refund|complain|worst|waste)\b/i },
  { intent: 'feedback', re: /\b(feedback|suggestion|improve|rate|review|opinion)\b/i },
  { intent: 'request', re: /\b(please|can you|could you|would you|help me|i need|i want|make|create|write|tell me how)\b/i },
  { intent: 'question', re: /\b(who|what|when|where|why|how|which|is|are|does|do|can)\b/i },
];

export function classifyIntent(text) {
  for (const { intent, re } of INTENT_PATTERNS) {
    if (re.test(text)) return intent;
  }
  return 'statement';
}

// --- Entity extraction ---------------------------------------------------------

const ENTITY_PATTERNS = [
  { type: 'email', re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'url', re: /https?:\/\/[^\s]+/g },
  { type: 'phone', re: /(\+?\d[\d\s-]{7,}\d)/g },
  { type: 'date', re: /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{0,4}|tomorrow|today|next week)\b/gi },
  { type: 'number', re: /\b(\d{2,}(?:[.,]\d+)?|[\d,]{4,})\b/g },
];

export function extractEntities(text) {
  const entities = [];
  for (const { type, re } of ENTITY_PATTERNS) {
    const matches = text.match(re) ?? [];
    for (const m of matches) {
      if (type === 'number' && /^\d{4}$/.test(m) && /\b(19|20)\d{2}\b/.test(m)) continue; // years
      entities.push({ type, value: m.slice(0, 80) });
    }
  }
  return entities.slice(0, 12);
}

// --- Language detection (script + stopword n-grams) ----------------------------

const LANG_MARKERS = {
  english: ['the', 'and', 'is', 'are', 'you', 'this', 'that', 'with'],
  hindi: ['है', 'में', 'क्या', 'नहीं', 'हूँ', 'आप', 'कर'],
  spanish: ['que', 'los', 'las', 'por', 'para', 'una', 'como'],
  french: ['les', 'que', 'pour', 'une', 'avec', 'dans', 'est'],
  german: ['und', 'der', 'die', 'das', 'nicht', 'ist', 'mit'],
  arabic: ['ال', 'ما', 'هذا', 'من', 'في', 'على'],
  chinese: ['的', '是', '我', '你', '了', '在', '不'],
  japanese: ['は', 'の', 'を', 'に', 'です', 'ます'],
};

export function detectLanguage(text) {
  if (/[\u0900-\u097F]/.test(text)) return 'hindi';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'chinese';
  if (/[\u3040-\u30FF]/.test(text)) return 'japanese';
  if (/[\u0600-\u06FF]/.test(text)) return 'arabic';
  if (/[\u00C0-\u024F]/.test(text)) {
    const lower = text.toLowerCase();
    if (/\b(el|los|las|que|para|una|como)\b/.test(lower)) return 'spanish';
    if (/\b(les|pour|avec|dans|est)\b/.test(lower)) return 'french';
    if (/\b(der|die|das|und|nicht|mit)\b/.test(lower)) return 'german';
  }
  return 'english';
}

// --- PII detection & redaction --------------------------------------------------

const PII_PATTERNS = [
  { type: 'email', re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, redact: '[email]' },
  { type: 'phone', re: /(\+?\d[\d\s-]{7,}\d)/g, redact: '[phone]' },
  { type: 'card', re: /\b(?:\d[ -]?){13,19}\b/g, redact: '[card]' },
];

export function detectPII(text) {
  const found = [];
  for (const { type, re } of PII_PATTERNS) {
    for (const m of text.match(re) ?? []) found.push({ type, value: m.slice(0, 60) });
  }
  return found;
}

export function redactPII(text) {
  let out = text;
  for (const { re, redact } of PII_PATTERNS) out = out.replace(re, redact);
  return out;
}

// --- Toxicity filter ------------------------------------------------------------

const TOXIC_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dumbass', 'moron', 'idiot',
  'stupid', 'hate you', 'kill yourself', 'die', 'scum', 'trash', 'cunt', 'nigger', 'faggot',
];

export function isToxic(text) {
  const lower = text.toLowerCase();
  const matched = TOXIC_WORDS.filter((w) => lower.includes(w));
  return { toxic: matched.length > 0, matched: matched.slice(0, 3) };
}

// --- Prompt-injection detection ---------------------------------------------------

const INJECTION_PATTERNS = [
  /ignore (all )?(your|the|previous|above).*(instructions|prompt|rules)/i,
  /system prompt/i,
  /you are now|act as (an? )?(unrestricted|jailbreak|developer mode|do anything)/i,
  /disregard (your|the|all).*(rules|instructions|guidelines)/i,
  /reveal your (system prompt|instructions)/i,
  /repeat (your|the).*(prompt|instructions|message above)/i,
  /new instructions/i,
  /override/i,
];

export function detectInjection(text) {
  const matched = INJECTION_PATTERNS.filter((re) => re.test(text));
  return { injected: matched.length > 0, matched: matched.map((r) => r.source.slice(0, 40)) };
}

// --- Groundedness (RAG hallucination approximation) --------------------------------

/**
 * Score how well a response aligns with the retrieved chunks: the fraction of
 * the response's significant terms that also appear in the sources.
 */
export function groundednessScore(response, chunks) {
  if (!chunks?.length) return null;
  const sourceText = chunks.map((c) => c.content ?? c).join(' ').toLowerCase();
  const terms = new Set((response.toLowerCase().match(/[a-z]{4,}/g) ?? []));
  if (!terms.size) return null;
  let hit = 0;
  for (const t of terms) if (sourceText.includes(t)) hit += 1;
  return Math.round((hit / terms.size) * 100);
}

// --- Pipeline ----------------------------------------------------------------------

/** Run every detector on a user message. */
export function analyzeMessage(text) {
  return {
    intent: classifyIntent(text),
    entities: extractEntities(text),
    sentiment: analyzeSentiment(text),
    language: detectLanguage(text),
    pii: detectPII(text),
    toxicity: isToxic(text),
    injection: detectInjection(text),
  };
}
