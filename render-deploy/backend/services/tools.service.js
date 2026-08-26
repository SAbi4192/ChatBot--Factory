/**
 * Tool use (Checkpoint 9) — deterministic external capabilities invoked from
 * the chat pipeline before the AI call:
 *   - Weather (Open-Meteo, no API key)
 *   - Calculator (safe expression evaluator)
 *   - Reminders (stored in DB, listed in the UI)
 *   - URL fetcher (fetch + strip + summarize prefix)
 *
 * When a tool matches, its result is returned as a deterministic answer with
 * a "🔧 Used" marker — instant, offline-friendly, demo-reliable.
 */
import { prisma } from '../prisma.js';
import { uid } from './bot.service.js';

const uid9 = () => Math.random().toString(36).substring(2, 11);

/** Safe arithmetic evaluator — no eval(), only + - * / ( ) digits . % */
function safeEval(expr) {
  if (!/^[\d\s+\-*/().%]+$/.test(expr)) return null;
  const cleaned = expr.replace(/[^0-9+\-*/().%]/g, '');
  if (!cleaned || /[+\-*/%]{2,}/.test(cleaned.replace(/--/g, ''))) return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`'use strict'; return (${cleaned});`)();
    if (typeof value !== 'number' || !isFinite(value)) return null;
    return Math.round(value * 1e6) / 1e6;
  } catch {
    return null;
  }
}

async function getWeather(city) {
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`, { signal: AbortSignal.timeout(8000) });
  const geoData = await geo.json();
  const loc = geoData.results?.[0];
  if (!loc) return null;
  const weather = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true&timezone=auto`,
    { signal: AbortSignal.timeout(8000) }
  );
  const w = await weather.json();
  const cur = w.current_weather;
  if (!cur) return null;
  const code = cur.weathercode;
  const desc = code === 0 ? 'Clear' : code < 3 ? 'Partly cloudy' : code < 48 ? 'Overcast' : code < 58 ? 'Foggy' : code < 68 ? 'Drizzle' : code < 78 ? 'Rain' : code < 86 ? 'Snow' : 'Stormy';
  return `🔧 **Used: Weather → ${loc.name}**: ${cur.temperature}°C, ${desc}, wind ${cur.windspeed} km/h`;
}

async function fetchUrl(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': 'Chatbot-Factory/1.0' }, signal: AbortSignal.timeout(8000) });
  if (!resp.ok) return null;
  const html = await resp.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return `🔧 **Used: URL Fetcher → ${url}**\n\n${text.slice(0, 1200)}${text.length > 1200 ? '…' : ''}`;
}

async function setReminder(orgId, minutes, task) {
  const due = new Date(Date.now() + minutes * 60_000);
  await prisma.analyticsEvent.create({
    data: {
      id: uid9(),
      orgId,
      eventType: 'reminder.created',
      data: { task, dueAt: due.toISOString(), minutes },
    },
  });
  return `🔧 **Used: Reminder** — I'll remind you in ${minutes} minute${minutes > 1 ? 's' : ''} to: "${task}"`;
}

/** List pending reminders (due in the future). */
export async function listReminders(orgId) {
  const events = await prisma.analyticsEvent.findMany({
    where: { orgId, eventType: 'reminder.created' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const now = Date.now();
  return events
    .filter((e) => new Date(e.data?.dueAt).getTime() > now)
    .map((e) => ({ id: e.id, task: e.data?.task, dueAt: new Date(e.data?.dueAt).getTime() }));
}

/**
 * Run tools against a user message.
 * Returns { matched, text, provider } — text is the deterministic answer when
 * a tool matched; provider 'tools'.
 */
export async function runTools(message, orgId) {
  const text = message.trim();

  // Calculator — pure expression (strip trailing ? or =).
  const cleanedExpr = text.replace(/[?=]$/, '').replace(/^what is\s+/i, '').replace(/^calculate\s+/i, '');
  if (/^[\d\s+\-*/().%]+$/.test(cleanedExpr) && /\d/.test(cleanedExpr) && /[+\-*/%]/.test(cleanedExpr)) {
    const value = safeEval(cleanedExpr);
    if (value != null) return { matched: true, text: `🔧 **Used: Calculator** → ${cleanedExpr} = **${value}**`, provider: 'tools' };
  }

  // Weather.
  const weatherMatch = text.match(/\bweather (?:in|for|at)\s+(.+)/i) || text.match(/\b(?:what'?s|what is) the weather (?:in|for|at)\s+(.+)/i);
  if (weatherMatch) {
    const city = weatherMatch[1].trim().replace(/[?.,!]/g, '').slice(0, 60);
    const result = await getWeather(city);
    if (result) return { matched: true, text: result, provider: 'tools' };
  }

  // Reminder.
  const reminderMatch = text.match(/remind me (?:in (\d+) (?:minute|minutes|min|mins)|in (\d+) (?:hour|hours))? ?(?:to|about)? ?(.+)/i);
  if (/remind me/i.test(text) && reminderMatch) {
    const mins = reminderMatch[1] ? Number(reminderMatch[1]) : reminderMatch[2] ? Number(reminderMatch[2]) * 60 : 5;
    const task = (reminderMatch[3] || 'take a break').trim().replace(/[?.,!]/g, '');
    if (mins > 0 && mins <= 24 * 60) {
      return { matched: true, text: await setReminder(orgId, mins, task), provider: 'tools' };
    }
  }

  // URL fetcher.
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  if (urlMatch && /(fetch|summarize|read|open|check)\b/i.test(text)) {
    const result = await fetchUrl(urlMatch[0]);
    if (result) return { matched: true, text: result, provider: 'tools' };
  }

  return { matched: false, text: null, provider: 'tools' };
}
