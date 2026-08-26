/**
 * Custom bot creator — "just describe it".
 *
 * Takes a natural-language description and asks the LLM (Groq first, Gemini
 * fallback) to design the whole bot as structured JSON: name, domain,
 * personality, system prompt, welcome message, starter questions, domain
 * profile, Design DNA (auto-themed) and avatar. When no cloud key is
 * available, a template-based fallback designs a deterministic bot from
 * keywords in the description — the demo never dead-ends.
 */
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { prisma } from '../prisma.js';
import { ApiError } from '../middleware/errorHandler.js';
import { uid } from './bot.service.js';
import { logActivity } from './audit.service.js';

const GROQ_KEY = process.env.GROQ_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const hasGroq = () => !!GROQ_KEY && GROQ_KEY !== 'MISSING_API_KEY' && !GROQ_KEY.startsWith('your_');
const hasGemini = () => !!GEMINI_KEY && GEMINI_KEY !== 'MISSING_API_KEY' && !GEMINI_KEY.startsWith('your_');
const groq = hasGroq() ? new Groq({ apiKey: GROQ_KEY }) : null;
const gemini = hasGemini() ? new GoogleGenAI({ apiKey: GEMINI_KEY }) : null;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';

const DESIGN_PROMPT = `You are a world-class chatbot designer. The user wants a chatbot described in one sentence.
Design the COMPLETE bot. Respond with STRICT JSON only (no markdown, no commentary) with exactly this shape:
{
  "name": "creative, memorable name (2-3 words, no quotes)",
  "domain": "one of: Education, Gaming, Astronomy, Legal, Healthcare, Banking, Tourism, Technology, Restaurant, Fashion, Fitness, Travel, Finance, Cooking, Career, Language, Entertainment, Productivity, or Custom",
  "subdomain": "specific specialty (3-5 words)",
  "description": "one sentence about what it does",
  "personality": "one of: Friendly Guide, Witty Companion, Patient Mentor, Strict Professor, Cheerful Buddy, Calm Advisor, Bold Expert",
  "systemPrompt": "comprehensive system prompt (120-200 words) covering role, tone, boundaries",
  "welcomeMessage": "2-3 sentence welcome message",
  "starterQuestions": ["4 short starter questions"],
  "domainProfile": {
    "description": "what this bot covers",
    "allowedTopics": ["5-8 topics"],
    "excludedTopics": ["4-6 topics it refuses"],
    "synonyms": ["6-10 words users might say"],
    "commonIntents": ["5 intents"],
    "relatedTopics": ["3-5 adjacent topics"]
  },
  "theme": "choose the perfect theme from: Terminal (coding/tech), Ocean (calm/water), Sunset (warm/creative), Forest (health/nature), Royal (luxury/finance), Neon (gaming), Cyber (futuristic), Aurora (abstract), Ember (food/warmth), Space (astronomy), Mint (clean/wellness), Grape (creative)",
  "avatar": "single emoji that represents the bot"
}`;

const FALLBACK_THEMES = ['Terminal', 'Ocean', 'Sunset', 'Forest', 'Neon', 'Cyber', 'Aurora', 'Ember', 'Space', 'Mint'];
const FALLBACK_AVATARS = ['🤖', '🧠', '✨', '🎯', '📚', '🧭', '⚡', '🌱', '🚀', '🎨'];

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('No JSON object in model response');
  return JSON.parse(raw.slice(start, end + 1));
}

function sanitizeDesign(raw) {
  const s = (v, d = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : d);
  const arr = (v, d = []) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8).map((x) => x.slice(0, 200)) : d);
  return {
    name: s(raw.name, 'Custom Assistant'),
    domain: s(raw.domain, 'Custom'),
    subdomain: s(raw.subdomain, 'Personal assistant'),
    description: s(raw.description, 'A custom assistant designed for you.'),
    personality: s(raw.personality, 'Friendly Guide'),
    systemPrompt: s(raw.systemPrompt, 'You are a helpful, friendly assistant. Answer clearly and honestly.'),
    welcomeMessage: s(raw.welcomeMessage, 'Hi! I am ready to help. What would you like to know?'),
    starterQuestions: arr(raw.starterQuestions, ['What can you do?', 'Tell me something interesting', 'How do we start?', 'Give me an example']),
    domainProfile: {
      description: s(raw.domainProfile?.description, raw.description || 'A custom assistant.'),
      allowedTopics: arr(raw.domainProfile?.allowedTopics, ['general questions']),
      excludedTopics: arr(raw.domainProfile?.excludedTopics, ['harmful or illegal requests']),
      synonyms: arr(raw.domainProfile?.synonyms, ['help', 'question']),
      commonIntents: arr(raw.domainProfile?.commonIntents, ['ask', 'chat']),
      relatedTopics: arr(raw.domainProfile?.relatedTopics, []),
    },
    theme: s(raw.theme, 'Ocean'),
    avatar: s(raw.avatar, '🤖'),
  };
}

/** Build Design DNA from the theme the designer chose. */
function designDnaFromTheme(theme) {
  const palettes = {
    Terminal: { theme, primaryColor: '#3DDC84', accentColor: '#00E5FF', surface: '#0d1117', bg: '#010409', text: '#c9d1d9', muted: '#8b949e', border: '#21262d', fontFamily: "'IBM Plex Mono', monospace", mono: true, layout: 'Terminal', messageStyle: 'Terminal', backgroundStyle: 'Grid', borderRadius: '4px' },
    Ocean: { theme, primaryColor: '#38BDF8', accentColor: '#22D3EE', surface: '#0c1a2a', bg: '#081018', text: '#e0f2fe', muted: '#7dd3fc', border: '#155e75', fontFamily: "'Inter', sans-serif", layout: 'Center', messageStyle: 'Bubbles', backgroundStyle: 'Gradient', borderRadius: '16px' },
    Sunset: { theme, primaryColor: '#FB923C', accentColor: '#F472B6', surface: '#1e1420', bg: '#12090f', text: '#fff1e6', muted: '#fda4af', border: '#7f1d1d', fontFamily: "'Inter', sans-serif", layout: 'Center', messageStyle: 'Cards', backgroundStyle: 'Gradient', borderRadius: '14px' },
    Forest: { theme, primaryColor: '#4ADE80', accentColor: '#A3E635', surface: '#0e1f14', bg: '#08110b', text: '#dcfce7', muted: '#86efac', border: '#166534', fontFamily: "'Inter', sans-serif", layout: 'Sidebar', messageStyle: 'Bubbles', backgroundStyle: 'Solid', borderRadius: '12px' },
    Royal: { theme, primaryColor: '#C084FC', accentColor: '#F0ABFC', surface: '#191226', bg: '#0d0915', text: '#f3e8ff', muted: '#d8b4fe', border: '#581c87', fontFamily: "'Archivo', sans-serif", layout: 'Center', messageStyle: 'Cards', backgroundStyle: 'Mesh', borderRadius: '10px' },
    Neon: { theme, primaryColor: '#22D3EE', accentColor: '#A78BFA', surface: '#0d1020', bg: '#060710', text: '#e0f2fe', muted: '#67e8f9', border: '#312e81', fontFamily: "'IBM Plex Mono', monospace", mono: true, layout: 'Center', messageStyle: 'Compact', backgroundStyle: 'Grid', borderRadius: '8px' },
    Cyber: { theme, primaryColor: '#F0ABFC', accentColor: '#22D3EE', surface: '#100b18', bg: '#070410', text: '#fae8ff', muted: '#e879f9', border: '#701a75', fontFamily: "'IBM Plex Mono', monospace", mono: true, layout: 'Terminal', messageStyle: 'Terminal', backgroundStyle: 'Grid', borderRadius: '6px' },
    Aurora: { theme, primaryColor: '#67E8F9', accentColor: '#C084FC', surface: '#0c1220', bg: '#050a14', text: '#ecfeff', muted: '#a5f3fc', border: '#1e3a8a', fontFamily: "'Inter', sans-serif", layout: 'Focus', messageStyle: 'Cards', backgroundStyle: 'Gradient', borderRadius: '18px' },
    Ember: { theme, primaryColor: '#F59E0B', accentColor: '#EF4444', surface: '#1c1310', bg: '#120a08', text: '#ffedd5', muted: '#fdba74', border: '#7c2d12', fontFamily: "'Inter', sans-serif", layout: 'Center', messageStyle: 'Bubbles', backgroundStyle: 'Solid', borderRadius: '12px' },
    Space: { theme, primaryColor: '#A78BFA', accentColor: '#38BDF8', surface: '#0d0f22', bg: '#060614', text: '#e0e7ff', muted: '#a5b4fc', border: '#312e81', fontFamily: "'Archivo', sans-serif", layout: 'Sidebar', messageStyle: 'Cards', backgroundStyle: 'Mesh', borderRadius: '10px' },
    Mint: { theme, primaryColor: '#34D399', accentColor: '#2DD4BF', surface: '#0a1a16', bg: '#050f0c', text: '#d1fae5', muted: '#6ee7b7', border: '#065f46', fontFamily: "'Inter', sans-serif", layout: 'Focus', messageStyle: 'Bubbles', backgroundStyle: 'Solid', borderRadius: '16px' },
    Grape: { theme, primaryColor: '#E879F9', accentColor: '#C084FC', surface: '#190e22', bg: '#0e0712', text: '#fae8ff', muted: '#f0abfc', border: '#86198f', fontFamily: "'Inter', sans-serif", layout: 'Center', messageStyle: 'Cards', backgroundStyle: 'Mesh', borderRadius: '14px' },
  };
  return palettes[theme] || palettes.Ocean;
}

/** Deterministic fallback designer — works with zero API keys. */
function fallbackDesign(description) {
  const words = description.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const themeHints = {
    Terminal: ['code', 'program', 'python', 'developer', 'software', 'tech', 'api', 'debug'],
    Neon: ['game', 'gaming', 'esports', 'level', 'quest'],
    Space: ['astro', 'space', 'star', 'planet', 'universe'],
    Ember: ['cook', 'recipe', 'food', 'kitchen', 'meal', 'chef', 'restaurant'],
    Ocean: ['travel', 'trip', 'tour', 'beach', 'hotel'],
    Forest: ['health', 'fitness', 'yoga', 'wellness', 'mind'],
    Royal: ['finance', 'bank', 'money', 'invest', 'legal'],
    Mint: ['study', 'tutor', 'learn', 'school', 'student'],
    Sunset: ['fashion', 'style', 'design', 'art', 'creative'],
    Cyber: ['security', 'hack', 'network', 'ai'],
  };
  let theme = 'Ocean';
  for (const [t, hints] of Object.entries(themeHints)) {
    if (hints.some((h) => words.includes(h))) { theme = t; break; }
  }
  const title = description.split(/\s+/).slice(0, 4).join(' ');
  return sanitizeDesign({
    name: title.charAt(0).toUpperCase() + title.slice(1),
    domain: 'Custom',
    subdomain: description.slice(0, 60),
    description: description.slice(0, 200),
    personality: 'Friendly Guide',
    systemPrompt: `You are a helpful assistant created for: "${description}". Answer clearly, stay on topic, and be friendly.`,
    welcomeMessage: `Hi! I was made to help with: ${description}. What would you like to know?`,
    starterQuestions: ['What can you do?', 'Tell me about yourself', 'Give me a quick example', 'How do I get the most from you?'],
    theme,
    avatar: FALLBACK_AVATARS[Math.floor(Math.random() * FALLBACK_AVATARS.length)],
  });
}

async function designWithGroq(description) {
  const completion = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    temperature: 0.8,
    messages: [
      { role: 'system', content: DESIGN_PROMPT },
      { role: 'user', content: `Bot description: "${description}"` },
    ],
  });
  return extractJson(completion.choices?.[0]?.message?.content || '');
}

async function designWithGemini(description) {
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    config: { systemInstruction: DESIGN_PROMPT },
    contents: [{ role: 'user', parts: [{ text: `Bot description: "${description}"` }] }],
  });
  return extractJson(response.text || '');
}

/**
 * Design a bot from a natural-language description.
 * Tries Groq → Gemini → deterministic fallback.
 */
export async function designBot(description) {
  if (hasGroq()) {
    try { return sanitizeDesign(await designWithGroq(description)); }
    catch (e) { console.warn('[custom-bot] Groq design failed:', e.message); }
  }
  if (hasGemini()) {
    try { return sanitizeDesign(await designWithGemini(description)); }
    catch (e) { console.warn('[custom-bot] Gemini design failed:', e.message); }
  }
  return fallbackDesign(description);
}

/** Regenerate one section of an existing design (name / theme / avatar). */
export async function regenerateSection(description, section, current) {
  const design = await designBot(description);
  const merged = { ...current, ...design };
  // Only the requested section is replaced; everything else stays.
  if (section === 'name') merged.name = design.name;
  if (section === 'theme') {
    merged.theme = design.theme;
    merged.designDna = designDnaFromTheme(design.theme);
  }
  if (section === 'avatar') merged.avatar = design.avatar;
  return merged;
}

/**
 * Create a custom bot and persist it. Returns the raw Prisma bot.
 *
 * `design` (and its `designDna`) may be supplied from a confirmed live
 * preview — the exact design the user approved (including any regenerated
 * sections) is persisted as-is. When omitted, a fresh design is generated.
 */
export async function createCustomBot({ description, design: supplied, designDna: suppliedDna }, orgId, userId) {
  const desc = String(description || '').trim().slice(0, 500);
  if (!desc) throw new ApiError(400, 'Describe the bot you want to create');

  const design = supplied && typeof supplied === 'object' && typeof supplied.name === 'string' && supplied.name.trim()
    ? sanitizeDesign(supplied)
    : await designBot(desc);
  const dna = suppliedDna && typeof suppliedDna === 'object' && suppliedDna.primaryColor
    ? suppliedDna
    : designDnaFromTheme(design.theme);
  const now = new Date();

  const bot = await prisma.bot.create({
    data: {
      id: uid(),
      name: design.name,
      domain: design.domain,
      subdomain: design.subdomain,
      description: design.description,
      personality: design.personality,
      systemPrompt: design.systemPrompt,
      welcomeMessage: design.welcomeMessage,
      starterQuestions: design.starterQuestions,
      domainProfile: design.domainProfile,
      theme: design.theme,
      designDna: dna,
      avatar: design.avatar,
      creationMethod: 'custom',
      orgId,
      createdAt: now,
      updatedAt: now,
    },
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  await logActivity({
    orgId,
    actorId: userId,
    actorName: user?.email ?? userId,
    eventType: 'bot.custom_created',
    data: { name: design.name, description: desc },
    botId: bot.id,
  });

  return bot;
}

/** Rebuild Design DNA from a theme name (used by the regenerate button). */
export function themeToDna(theme) {
  return designDnaFromTheme(theme);
}
