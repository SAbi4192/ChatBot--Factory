/**
 * Repro #2 — exact API conditions: same orchestrator the E2E picked (Career
 * domain), streaming entry point, full stack capture.
 * Run: node tests/repro_team.mjs
 */
const BASE = new URL('../backend/', import.meta.url).href;
const { prisma } = await import(`${BASE}prisma.js`);
const { streamChatResponse } = await import(`${BASE}llmService.js`);

const bots = await prisma.bot.findMany({ where: { domain: 'Career' }, take: 3 });
const orchestrator = bots[0];
if (!orchestrator) { console.log('no Career bot'); process.exit(1); }
console.log(`orchestrator: ${orchestrator.name} (${orchestrator.domain}) org=${orchestrator.orgId}`);

const convId = `repro2_${Date.now()}`;
await prisma.conversation.create({ data: { id: convId, botId: orchestrator.id, title: 'repro2', createdAt: new Date(), updatedAt: new Date() } });

try {
  await prisma.bot.update({ where: { id: orchestrator.id }, data: { teamMode: true } });
  const tokens = [];
  const result = await streamChatResponse(orchestrator.id, convId, 'give me a simple pasta recipe with tomatoes', (t) => tokens.push(t));
  console.log('RESULT provider:', result.provider);
  console.log('tokens:', tokens.length, '| preview:', tokens.join('').slice(0, 150));
} catch (e) {
  console.log('THROWN:', e.stack || e.message);
} finally {
  await prisma.bot.update({ where: { id: orchestrator.id }, data: { teamMode: false } }).catch(() => {});
  await prisma.conversation.delete({ where: { id: convId } }).catch(() => {});
  await prisma.$disconnect();
  process.exit(0);
}
