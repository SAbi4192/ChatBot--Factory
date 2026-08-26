/**
 * Analytics service (Checkpoint 6) — aggregates computed from the org's data.
 *
 * Everything reads live from Prisma, so the dashboard reflects reality the
 * moment a chat happens. Cost estimation uses chars/4 tokens per provider.
 */
import { prisma } from '../prisma.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const dayStart = () => new Date(new Date().setHours(0, 0, 0, 0));
const daysAgo = (n) => new Date(dayStart().getTime() - n * DAY_MS);

function fillDailySeries(counts, days = 30) {
  const map = new Map(counts.map((c) => [c.day, Number(c.n)]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(dayStart().getTime() - i * DAY_MS);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ day: key, count: map.get(key) ?? 0 });
  }
  return out;
}

const groupBy = (rows, keyFn, valFn) => {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    map.set(k, (map.get(k) ?? 0) + valFn(r));
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};

// ---- Lightweight lexicon sentiment (offline, deterministic) ----
const POSITIVE = new Set([
  'good', 'great', 'awesome', 'excellent', 'amazing', 'love', 'loved', 'nice', 'best', 'better',
  'happy', 'glad', 'thank', 'thanks', 'thankful', 'helpful', 'works', 'working', 'perfect',
  'wonderful', 'fantastic', 'superb', 'cool', 'impressive', 'satisfied', 'enjoyed', 'easy',
  'clear', 'fast', 'quick', 'solved', 'fixed', 'resolved', 'yay', 'awesome', 'brilliant', 'fun',
  'safe', 'comfortable', 'pleased', 'grateful', 'appreciate', 'greatly', 'recommend', 'awesome',
]);
const NEGATIVE = new Set([
  'bad', 'terrible', 'awful', 'hate', 'hated', 'worst', 'worse', 'sad', 'unhappy', 'angry',
  'annoying', 'useless', 'broken', 'fails', 'failed', 'error', 'errors', 'problem', 'problems',
  'issue', 'issues', 'bug', 'bugs', 'slow', 'confusing', 'difficult', 'hard', 'pain', 'painful',
  'hurt', 'hurts', 'wrong', 'not working', 'doesnt work', 'disappointed', 'frustrated',
  'frustrating', 'terrible', 'horrible', 'stupid', 'waste', 'useless', 'unclear', 'scared',
  'worried', 'anxiety', 'scary', 'failed', 'crash', 'crashes', 'unhelpful', 'poor',
]);

/** Rough sentiment in [-1, 1]: fraction of positive minus negative word hits. */
function sentimentScore(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean);
  let score = 0;
  let hits = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) { score += 1; hits += 1; }
    else if (NEGATIVE.has(w)) { score -= 1; hits += 1; }
  }
  return hits ? score / hits : 0;
}

/** Grand overview for the org. */
export async function getOverview(orgId) {
  const since30 = daysAgo(30);
  const sinceToday = dayStart();

  const [bots, conversations, messages, todayMessages, feedback, providers, doms, recentMsgs] = await Promise.all([
    prisma.bot.count({ where: { orgId } }),
    prisma.conversation.count({ where: { bot: { orgId } } }),
    prisma.message.count({ where: { conversation: { bot: { orgId } } } }),
    prisma.message.count({ where: { createdAt: { gte: sinceToday }, conversation: { bot: { orgId } } } }),
    prisma.feedback.findMany({ where: { message: { conversation: { bot: { orgId } } } }, select: { rating: true, createdAt: true } }),
    prisma.message.groupBy({ by: ['provider'], where: { conversation: { bot: { orgId } } }, _count: { _all: true } }),
    prisma.bot.groupBy({ by: ['domain'], where: { orgId }, _count: { _all: true } }),
    prisma.message.findMany({
      where: { conversation: { bot: { orgId } }, createdAt: { gte: since30 } },
      select: { provider: true, createdAt: true, responseMs: true, conversation: { select: { botId: true } } },
    }),
  ]);

  // Conversations over time (30d)
  const convByDay = await prisma.conversation.groupBy({
    by: ['createdAt'],
    where: { bot: { orgId }, createdAt: { gte: since30 } },
    _count: { _all: true },
  });
  const convSeries = fillDailySeries(
    convByDay.map((c) => ({ day: c.createdAt.toISOString().slice(0, 10), n: c._count._all }))
  );

  // Top bots by usage
  const topBotsRaw = await prisma.conversation.groupBy({
    by: ['botId'],
    where: { bot: { orgId } },
    _count: { _all: true },
  });
  const botIds = topBotsRaw.map((b) => b.botId);
  const botsInfo = await prisma.bot.findMany({ where: { id: { in: botIds } }, select: { id: true, name: true } });
  const nameOf = new Map(botsInfo.map((b) => [b.id, b.name]));
  const topBots = topBotsRaw
    .map((b) => ({ name: nameOf.get(b.botId) ?? 'unknown', value: b._count._all }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Provider donut
  const providerDist = providers.map((p) => ({
    name: p.provider === 'local' ? 'Local AI' : p.provider === 'cloud' ? 'Cloud AI' : p.provider === 'web' ? 'Web-enhanced' : p.provider === 'domain-guard' ? 'Domain Guard' : p.provider === 'profile' ? 'Bot Profile' : p.provider,
    value: p._count._all,
  }));

  // Domain distribution
  const domainDist = doms.map((d) => ({ name: d.domain, value: d._count._all }));

  // Response-time histogram (buckets in seconds)
  const withMs = recentMsgs.filter((m) => m.responseMs != null);
  const buckets = [0, 2, 5, 10, 20, 40, 60, 120];
  const respHist = buckets.map((b, i) => ({
    label: i === buckets.length - 1 ? `>${b}s` : `${b}-${buckets[i + 1]}s`,
    value: withMs.filter((m) => m.responseMs >= b * 1000 && (i === buckets.length - 1 || m.responseMs < buckets[i + 1] * 1000)).length,
  }));

  // CSAT trend (7d) from feedback
  const csatSeries = Array.from({ length: 7 }, (_, i) => {
    const d = daysAgo(6 - i);
    const next = new Date(d.getTime() + DAY_MS);
    const day = feedback.filter((f) => f.createdAt >= d && f.createdAt < next);
    const ups = day.filter((f) => f.rating === 1).length;
    return { day: d.toISOString().slice(5, 10), csat: day.length ? Math.round((ups / day.length) * 100) : null };
  });

  // Peak-usage heatmap (hour × weekday), last 30d
  const heatmap = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0,
  }));
  for (const m of recentMsgs) {
    const d = new Date(m.createdAt);
    const h = d.getHours();
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    heatmap[h][wd] += 1;
  }

  // Token & cost estimation (chars/4), per provider per day (7d)
  const tokenSeries = Array.from({ length: 7 }, (_, i) => {
    const d = daysAgo(6 - i);
    const next = new Date(d.getTime() + DAY_MS);
    const dayMsgs = recentMsgs.filter((m) => m.createdAt >= d && m.createdAt < next);
    const row = { day: d.toISOString().slice(5, 10), local: 0, cloud: 0, web: 0, guard: 0 };
    for (const m of dayMsgs) {
      const key = m.provider === 'web' ? 'web' : m.provider === 'cloud' ? 'cloud' : m.provider === 'local' ? 'local' : 'guard';
      row[key] += 1; // message counts as the estimator basis
    }
    return row;
  });

  // Conversation length histogram
  const convLens = await prisma.message.groupBy({
    by: ['conversationId'],
    where: { conversation: { bot: { orgId } } },
    _count: { _all: true },
  });
  const lenBuckets = [1, 2, 4, 8, 16, 32];
  const convLenHist = lenBuckets.map((b, i) => ({
    label: i === lenBuckets.length - 1 ? `>${b}` : `${b}-${lenBuckets[i + 1]}`,
    value: convLens.filter((c) => c._count._all >= b && (i === lenBuckets.length - 1 || c._count._all < lenBuckets[i + 1])).length,
  }));

  // Unresolved queries (domain-guard redirects)
  const unresolved = await prisma.message.findMany({
    where: { provider: 'domain-guard', conversation: { bot: { orgId } } },
    select: { content: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Sentiment trend (7d) — lexicon-based, offline, deterministic.
  const since7 = daysAgo(7);
  const sentMsgs = await prisma.message.findMany({
    where: { conversation: { bot: { orgId } }, createdAt: { gte: since7 } },
    select: { content: true, createdAt: true },
  });
  const sentimentSeries = Array.from({ length: 7 }, (_, i) => {
    const d = daysAgo(6 - i);
    const next = new Date(d.getTime() + DAY_MS);
    const day = sentMsgs.filter((m) => m.createdAt >= d && m.createdAt < next);
    const scores = day.map((m) => sentimentScore(m.content || ''));
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const pos = scores.filter((s) => s > 0).length;
    return { day: d.toISOString().slice(5, 10), sentiment: avg === null ? null : Number(avg.toFixed(2)), messages: scores.length, positiveShare: scores.length ? Math.round((pos / scores.length) * 100) : null };
  });

  const totalRating = feedback.reduce((a, f) => a + f.rating, 0);
  const csat = feedback.length ? Math.round(((feedback.filter((f) => f.rating === 1).length) / feedback.length) * 100) : null;
  const avgResponseMs = withMs.length ? Math.round(withMs.reduce((a, m) => a + m.responseMs, 0) / withMs.length) : null;

  return {
    overview: {
      bots, conversations, messages, messagesToday: todayMessages,
      avgResponseMs, csat,
    },
    series: { conversations: convSeries, csat: csatSeries, tokens: tokenSeries },
    charts: { providerDist, topBots, domainDist, respHist, heatmap, convLenHist, sentiment: sentimentSeries },
    unresolved: unresolved.map((u) => ({ content: u.content, createdAt: u.createdAt.getTime() })),
  };
}

/** Per-bot analytics. */
export async function getBotAnalytics(botId, orgId) {
  const bot = await prisma.bot.findFirst({ where: { id: botId, orgId } });
  if (!bot) return null;

  const since30 = daysAgo(30);
  const [convCount, msgCount, msgs, feedback, guardCount] = await Promise.all([
    prisma.conversation.count({ where: { botId } }),
    prisma.message.count({ where: { conversation: { botId } } }),
    prisma.message.findMany({
      where: { conversation: { botId }, createdAt: { gte: since30 } },
      select: { provider: true, content: true, createdAt: true, responseMs: true },
    }),
    prisma.feedback.findMany({ where: { message: { conversation: { botId } } }, select: { rating: true } }),
    prisma.message.count({ where: { provider: 'domain-guard', conversation: { botId } } }),
  ]);

  // Most-asked questions (user messages, word-stripped, top 5)
  const userMsgs = msgs.filter((m) => m.content && m.content[0] !== '[').map((m) => m.content.trim());
  const qCounts = new Map();
  for (const q of userMsgs) {
    const key = q.length > 60 ? q.slice(0, 60) + '…' : q;
    qCounts.set(key, (qCounts.get(key) ?? 0) + 1);
  }
  const mostAsked = [...qCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([q, n]) => ({ question: q, count: n }));

  const providerDist = groupBy(msgs, (m) => m.provider ?? 'local', () => 1);

  return {
    bot: { id: bot.id, name: bot.name, domain: bot.domain },
    convCount,
    msgCount,
    csat: feedback.length ? Math.round((feedback.filter((f) => f.rating === 1).length / feedback.length) * 100) : null,
    mostAsked,
    providerDist,
    guardRate: msgCount ? Math.round((guardCount / msgCount) * 100) : 0,
    dropOff: msgs.length ? Math.round((msgs.filter((m) => m.content?.length > 0).length / msgCount) * 100) : 0,
  };
}

/** Real-time monitoring snapshot (5s polling). */
export async function getRealtime(orgId) {
  const now = Date.now();
  const sinceMin = new Date(now - 60_000);
  const [activeConvs, msgsMin, errsMin] = await Promise.all([
    prisma.conversation.count({ where: { bot: { orgId }, updatedAt: { gte: sinceMin } } }),
    prisma.message.count({ where: { createdAt: { gte: sinceMin }, conversation: { bot: { orgId } } } }),
    prisma.analyticsEvent.count({ where: { orgId, eventType: { contains: 'error' } } }),
  ]);
  return { activeConvs, msgsMin, errsMin, at: now };
}
