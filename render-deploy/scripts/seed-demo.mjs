/**
 * Demo Mode / seed script (Checkpoint 10 addition).
 *
 * Fills the workspace with bots, conversations, messages, reactions and
 * analytics history so the evaluation never starts from an empty screen and
 * the charts are full on first open.
 *
 * Usage: node scripts/seed-demo.mjs [botCount]
 */
import { prisma } from '../backend/prisma.js';
import { generateSingleBot } from '../backend/generator.js';
import { generateIntroMessage } from '../backend/domainGuard.js';

const uid = () => Math.random().toString(36).substring(2, 11);
const targetBots = Math.min(parseInt(process.argv[2] || '20', 10), 200);

const dayAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

async function main() {
  // Find (or create) the admin org.
  const admin = await prisma.user.findUnique({ where: { email: process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@factory.local' } });
  const membership = admin ? await prisma.orgMember.findFirst({ where: { userId: admin.id } }) : null;
  const orgId = membership?.orgId;

  const existing = await prisma.bot.count({ where: { orgId: orgId ?? undefined } });
  const toCreate = Math.max(0, targetBots - existing);
  console.log(`Existing bots: ${existing} — seeding ${toCreate} more…`);

  const bots = [];
  for (let i = 0; i < toCreate; i++) {
    const g = await generateSingleBot();
    const now = dayAgo(Math.floor(Math.random() * 20));
    const bot = await prisma.bot.create({
      data: {
        id: g.id,
        name: g.name,
        domain: g.domain,
        subdomain: g.subdomain,
        description: g.description,
        personality: g.personality,
        systemPrompt: g.systemPrompt,
        welcomeMessage: g.welcomeMessage,
        starterQuestions: g.starterQuestions ?? [],
        domainProfile: g.domainProfile ?? null,
        theme: g.designDna.theme,
        designDna: g.designDna,
        avatar: g.avatar,
        orgId: orgId ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
    bots.push(bot);
  }

  // Seed conversations + messages on a sample of bots.
  const sample = [...bots, ...(await prisma.bot.findMany({ where: { orgId: orgId ?? undefined }, take: 20 }))].slice(0, 12);
  let msgCount = 0;
  let feedbackCount = 0;
  for (const bot of sample) {
    const convs = Math.floor(Math.random() * 4) + 1;
    for (let c = 0; c < convs; c++) {
      const convCreated = dayAgo(Math.floor(Math.random() * 25));
      const conv = await prisma.conversation.create({
        data: { id: uid(), botId: bot.id, title: 'Seeded conversation', createdAt: convCreated, updatedAt: convCreated },
      });
      const turns = Math.floor(Math.random() * 6) + 2;
      let ts = convCreated.getTime();
      let lastAsmId = null;
      for (let t = 0; t < turns; t++) {
        ts += 15_000 + Math.random() * 120_000;
        const role = t % 2 === 0 ? 'user' : 'assistant';
        const content = role === 'user'
          ? ['How does this work?', 'Tell me more about your specialty', 'Can you give me an example?', 'What are your top tips?', 'How do I get started?', 'Show me something interesting'][t % 6]
          : generateIntroMessage(bot, 'greeting');
        const msg = await prisma.message.create({
          data: {
            id: uid(),
            conversationId: conv.id,
            role,
            content,
            provider: role === 'assistant' ? (t % 3 === 0 ? 'local' : t % 3 === 1 ? 'cloud' : 'profile') : 'user',
            createdAt: new Date(ts),
          },
        });
        msgCount++;
        if (role === 'assistant') lastAsmId = msg.id;
      }
      // Feedback (CSAT data) on the last assistant message.
      if (lastAsmId && Math.random() > 0.4) {
        await prisma.feedback.create({
          data: { id: uid(), messageId: lastAsmId, rating: Math.random() > 0.25 ? 1 : -1, createdAt: new Date(ts) },
        });
        feedbackCount++;
      }
    }
  }

  // Activity history.
  await prisma.analyticsEvent.createMany({
    data: Array.from({ length: 8 }, (_, i) => ({
      id: uid(),
      orgId: orgId ?? undefined,
      eventType: i % 2 === 0 ? 'bot.created' : 'bot.custom_created',
      data: { actorName: 'seeded', at: dayAgo(i).toISOString() },
      createdAt: dayAgo(i),
    })),
  });

  console.log(`✅ Seeded ${toCreate} bots, ${msgCount} messages, ${feedbackCount} feedback ratings.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('Seed failed:', e.message); await prisma.$disconnect(); process.exit(1); });
