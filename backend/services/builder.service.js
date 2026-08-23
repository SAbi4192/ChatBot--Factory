/**
 * Bot builder service (Checkpoint 8) — configuration updates with version
 * snapshots, rollback, templates, and slot-filling support.
 */
import { prisma } from '../prisma.js';
import { ApiError } from '../middleware/errorHandler.js';
import { uid } from './bot.service.js';
import { templateById } from './templates.data.js';
import { themeToDna } from './customBot.service.js';

/** Snapshot the bot config into bot_versions (auto-incrementing version). */
async function snapshot(botId, actorId, note = 'manual save') {
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) return;
  const last = await prisma.botVersion.findFirst({
    where: { botId },
    orderBy: { version: 'desc' },
  });
  await prisma.botVersion.create({
    data: {
      id: uid(),
      botId,
      version: (last?.version ?? 0) + 1,
      configSnapshot: {
        name: bot.name,
        description: bot.description,
        personality: bot.personality,
        personalityTraits: bot.personalityTraits,
        systemPrompt: bot.systemPrompt,
        welcomeMessage: bot.welcomeMessage,
        starterQuestions: bot.starterQuestions,
        domainProfile: bot.domainProfile,
        designDna: bot.designDna,
        avatar: bot.avatar,
        guardStrictness: bot.guardStrictness,
        memoryEnabled: bot.memoryEnabled,
        flow: bot.flow,
        slots: bot.slots,
        note,
        actorId,
      },
    },
  });
}

/** Update a bot and snapshot the previous state as a version. */
export async function updateBot(botId, orgId, patch, actorId) {
  const bot = await prisma.bot.findFirst({ where: { id: botId, orgId } });
  if (!bot) throw new ApiError(404, 'Bot not found');

  await snapshot(botId, actorId, 'auto-snapshot before save');

  const data = {};
  for (const key of ['name', 'description', 'personality', 'personalityTraits', 'systemPrompt',
    'welcomeMessage', 'starterQuestions', 'domainProfile', 'designDna', 'avatar',
    'guardStrictness', 'memoryEnabled', 'provider', 'flow', 'slots']) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }

  const updated = await prisma.bot.update({
    where: { id: botId },
    data: { ...data, updatedAt: new Date() },
  });
  return updated;
}

/** List version history for a bot. */
export async function listVersions(botId, orgId) {
  const bot = await prisma.bot.findFirst({ where: { id: botId, orgId } });
  if (!bot) throw new ApiError(404, 'Bot not found');
  const versions = await prisma.botVersion.findMany({
    where: { botId },
    orderBy: { version: 'desc' },
    take: 30,
  });
  return versions.map((v) => ({
    id: v.id,
    version: v.version,
    configSnapshot: v.configSnapshot,
    createdAt: v.createdAt.getTime(),
  }));
}

/** Roll back a bot to a previous version snapshot. */
export async function rollbackTo(botId, orgId, versionId, actorId) {
  const bot = await prisma.bot.findFirst({ where: { id: botId, orgId } });
  if (!bot) throw new ApiError(404, 'Bot not found');
  const version = await prisma.botVersion.findFirst({ where: { id: versionId, botId } });
  if (!version) throw new ApiError(404, 'Version not found');

  await snapshot(botId, actorId, 'auto-snapshot before rollback');
  const s = version.configSnapshot;

  const updated = await prisma.bot.update({
    where: { id: botId },
    data: {
      name: s.name ?? bot.name,
      description: s.description ?? bot.description,
      personality: s.personality ?? bot.personality,
      personalityTraits: s.personalityTraits ?? null,
      systemPrompt: s.systemPrompt ?? bot.systemPrompt,
      welcomeMessage: s.welcomeMessage ?? bot.welcomeMessage,
      starterQuestions: s.starterQuestions ?? bot.starterQuestions,
      domainProfile: s.domainProfile ?? null,
      designDna: s.designDna ?? bot.designDna,
      avatar: s.avatar ?? bot.avatar,
      guardStrictness: s.guardStrictness ?? bot.guardStrictness,
      memoryEnabled: s.memoryEnabled ?? bot.memoryEnabled,
      flow: s.flow ?? null,
      slots: s.slots ?? null,
      updatedAt: new Date(),
    },
  });
  return updated;
}

/** Install a template as a new bot. */
export async function installTemplate(templateId, orgId, userId) {
  const t = templateById(templateId);
  if (!t) throw new ApiError(404, 'Template not found');

  const now = new Date();
  const bot = await prisma.bot.create({
    data: {
      id: uid(),
      name: t.name,
      domain: t.domain,
      subdomain: t.subdomain,
      description: t.description,
      personality: 'Friendly Guide',
      systemPrompt: t.prompt,
      welcomeMessage: `Hi! I'm your ${t.name.toLowerCase()}. How can I help?`,
      starterQuestions: ['What can you do?', 'How do I get started?', 'Give me an example', 'Any tips?'],
      theme: t.theme,
      designDna: themeToDna(t.theme),
      avatar: t.emoji,
      creationMethod: 'template',
      orgId,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.botVersion.create({
    data: {
      id: uid(),
      botId: bot.id,
      version: 1,
      configSnapshot: { note: `installed from template "${t.name}"`, actorId: userId },
    },
  });
  return bot;
}

/** Save an existing bot as a reusable template. */
export async function saveAsTemplate(botId, orgId, userId) {
  const bot = await prisma.bot.findFirst({ where: { id: botId, orgId } });
  if (!bot) throw new ApiError(404, 'Bot not found');
  return {
    id: `custom-${bot.id}`,
    category: 'Custom',
    name: bot.name,
    emoji: bot.avatar || '🤖',
    description: bot.description || bot.subdomain,
    theme: bot.designDna?.theme || 'Ocean',
    domain: bot.domain,
    subdomain: bot.subdomain,
    prompt: bot.systemPrompt,
    custom: true,
    savedBy: userId,
  };
}
