/**
 * Data-access layer backed by Prisma ORM.
 *
 * This module is the single place that talks to the database. It exposes the
 * same function surface it always has, so services / llmService are untouched
 * by the underlying storage choice (SQLite now, PostgreSQL later — the schema
 * is provider-portable and only DATABASE_URL changes).
 *
 * All functions are synchronous wrappers over Prisma's async API. Timestamps
 * are stored as DateTime and converted to epoch-ms here, so the API contract
 * with the frontend never changes.
 */
import { prisma } from './prisma.js';

// --- Field mappers: Prisma row -> frontend shape (camelCase, epoch-ms) --------

const ms = (date) => (date instanceof Date ? date.getTime() : date ?? null);

function mapBotToFrontend(b) {
  return {
    id: b.id,
    name: b.name,
    domain: b.domain,
    subdomain: b.subdomain,
    description: b.description,
    personality: b.personality,
    systemPrompt: b.systemPrompt,
    designDna: b.designDna,
    avatar: b.avatar,
    welcomeMessage: b.welcomeMessage,
    starterQuestions: b.starterQuestions ?? [],
    domainProfile: b.domainProfile,
    favorite: b.favorite === true,
    createdAt: ms(b.createdAt),
    updatedAt: ms(b.updatedAt),
    conversationCount: b._count?.conversations ?? 0,
    creationMethod: b.creationMethod ?? 'factory',
  };
}

function mapConversationToFrontend(c) {
  return {
    id: c.id,
    botId: c.botId,
    title: c.title,
    createdAt: ms(c.createdAt),
    updatedAt: ms(c.updatedAt),
  };
}

function mapMessageToFrontend(m) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    provider: m.provider,
    sources: m.sources ?? null,
    createdAt: ms(m.createdAt),
  };
}

// --- Repository: bots ---------------------------------------------------------

// Every bot query is scoped by orgId — multi-tenancy is enforced at the data
// layer, not just by route middleware.

const getBots = async (orgId) => {
  const bots = await prisma.bot.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { conversations: true } } },
  });
  return bots.map(mapBotToFrontend);
};

const getBot = async (id, orgId) => {
  const bot = await prisma.bot.findFirst({ where: { id, orgId } });
  return bot ? mapBotToFrontend(bot) : null;
};

/** True when the bot exists and belongs to the given org. */
const botInOrg = async (botId, orgId) => {
  const count = await prisma.bot.count({ where: { id: botId, orgId } });
  return count > 0;
};

/** True when the conversation exists and its bot belongs to the given org. */
const conversationInOrg = async (convId, orgId) => {
  const count = await prisma.conversation.count({
    where: { id: convId, bot: { orgId } },
  });
  return count > 0;
};

const insertBotsBulk = async (bots, orgId) => {
  await prisma.$transaction(
    bots.map((b) =>
      prisma.bot.create({
        data: {
          id: b.id,
          name: b.name,
          domain: b.domain,
          subdomain: b.subdomain,
          description: b.description,
          personality: b.personality,
          systemPrompt: b.systemPrompt,
          theme: b.designDna?.theme ?? b.theme,
          designDna: b.designDna ?? null,
          avatar: b.avatar,
          welcomeMessage: b.welcomeMessage,
          starterQuestions: b.starterQuestions ?? [],
          domainProfile: b.domainProfile ?? null,
          orgId,
          createdAt: new Date(b.createdAt ?? Date.now()),
          updatedAt: new Date(b.createdAt ?? Date.now()),
        },
      })
    )
  );
};

const toggleFavorite = async (id, orgId) => {
  const bot = await prisma.bot.findFirst({ where: { id, orgId } });
  if (!bot) return;
  await prisma.bot.update({ where: { id }, data: { favorite: !bot.favorite } });
};

const deleteAll = async (orgId) => {
  const botIds = await prisma.bot.findMany({ where: { orgId }, select: { id: true } });
  const ids = botIds.map((b) => b.id);
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { conversation: { botId: { in: ids } } } }),
    prisma.conversation.deleteMany({ where: { botId: { in: ids } } }),
    prisma.bot.deleteMany({ where: { orgId } }),
  ]);
};

// --- Repository: conversations ------------------------------------------------

const createConversation = async (id, botId, title, createdAt) => {
  const ts = new Date(createdAt ?? Date.now());
  await prisma.conversation.create({
    data: { id, botId, title, createdAt: ts, updatedAt: ts },
  });
};

const getConversations = async (botId) => {
  const convs = await prisma.conversation.findMany({
    where: { botId },
    orderBy: { updatedAt: 'desc' },
  });
  return convs.map(mapConversationToFrontend);
};

// Cascade to messages is enforced by the schema (onDelete: Cascade).
const deleteConversation = async (id) => {
  await prisma.conversation.delete({ where: { id } });
};

const renameConversation = async (id, title) => {
  await prisma.conversation.update({
    where: { id },
    data: { title, updatedAt: new Date() },
  });
};

// --- Repository: messages -----------------------------------------------------

const addMessage = async (id, convId, role, content, createdAt, provider = 'local', sources = null) => {
  await prisma.message.create({
    data: {
      id,
      conversationId: convId,
      role,
      content,
      provider,
      sources: sources ?? null,
      createdAt: new Date(createdAt ?? Date.now()),
    },
  });
  await prisma.conversation.update({
    where: { id: convId },
    data: { updatedAt: new Date(createdAt ?? Date.now()) },
  });
};

const getMessages = async (convId) => {
  const msgs = await prisma.message.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: 'asc' },
  });
  return msgs.map(mapMessageToFrontend);
};

const deleteMessage = async (id) => {
  await prisma.message.delete({ where: { id } });
};

// Cascade to conversations + messages is enforced by the schema.
const deleteBot = async (id, orgId) => {
  const existing = await prisma.bot.findFirst({ where: { id, orgId } });
  if (!existing) return false;
  await prisma.bot.delete({ where: { id } });
  return true;
};

export default {
  getBots,
  getBot,
  botInOrg,
  conversationInOrg,
  insertBotsBulk,
  toggleFavorite,
  deleteAll,

  createConversation,
  getConversations,
  deleteConversation,
  renameConversation,

  addMessage,
  getMessages,
  deleteMessage,

  deleteBot,
};
