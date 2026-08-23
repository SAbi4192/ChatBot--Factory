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
import { PrismaClient } from '@prisma/client';
import './loadEnv.js';

const prisma = new PrismaClient();

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

const getBots = async () => {
  const bots = await prisma.bot.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { conversations: true } } },
  });
  return bots.map(mapBotToFrontend);
};

const getBot = async (id) => {
  const bot = await prisma.bot.findUnique({ where: { id } });
  return bot ? mapBotToFrontend(bot) : null;
};

const insertBotsBulk = async (bots) => {
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
          createdAt: new Date(b.createdAt ?? Date.now()),
          updatedAt: new Date(b.createdAt ?? Date.now()),
        },
      })
    )
  );
};

const toggleFavorite = async (id) => {
  const bot = await prisma.bot.findUnique({ where: { id } });
  if (!bot) return;
  await prisma.bot.update({ where: { id }, data: { favorite: !bot.favorite } });
};

const deleteAll = async () => {
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.bot.deleteMany(),
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
const deleteBot = async (id) => {
  const existing = await prisma.bot.findUnique({ where: { id } });
  if (!existing) return false;
  await prisma.bot.delete({ where: { id } });
  return true;
};

export default {
  getBots,
  getBot,
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
