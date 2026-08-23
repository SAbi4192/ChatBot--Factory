/**
 * Conversation intelligence — fork, summarize, pin, reactions.
 * Also hosts the public share lookups.
 */
import db from '../db.js';
import { prisma } from '../prisma.js';
import { ApiError } from '../middleware/errorHandler.js';
import { summarizeText, routeAndPersist } from '../llmService.js';
import { uid } from './bot.service.js';

const uid9 = () => Math.random().toString(36).substring(2, 11);

async function assertConvInOrg(convId, orgId) {
  if (!(await db.conversationInOrg(convId, orgId))) {
    throw new ApiError(404, 'Conversation not found');
  }
}

/**
 * Fork: create a new conversation containing the history up to `messageId`,
 * with that user message replaced by `newText`. The reply is then regenerated
 * from the edited message — the classic "edit message" flow.
 */
export async function forkConversation(convId, orgId, messageId, newText) {
  await assertConvInOrg(convId, orgId);

  const source = await prisma.conversation.findUnique({
    where: { id: convId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!source) throw new ApiError(404, 'Conversation not found');

  const idx = source.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) throw new ApiError(404, 'Message not found');

  const keep = source.messages.slice(0, idx);
  const edited = source.messages[idx];
  if (edited.role !== 'user') throw new ApiError(400, 'Only user messages can be edited');

  const now = new Date();
  const branch = await prisma.$transaction(async (tx) => {
    const created = await tx.conversation.create({
      data: {
        id: uid9(),
        botId: source.botId,
        title: newText.slice(0, 50),
        createdAt: now,
        updatedAt: now,
      },
    });
    for (const m of keep) {
      await tx.message.create({
        data: {
          id: m.id,
          conversationId: created.id,
          role: m.role,
          content: m.content,
          provider: m.provider ?? 'local',
          sources: m.sources,
          createdAt: m.createdAt,
        },
      });
    }
    await tx.message.create({
      data: {
        id: uid9(),
        conversationId: created.id,
        role: 'user',
        content: newText,
        createdAt: edited.createdAt,
      },
    });
    return created;
  });

  // Regenerate the answer from the edited message (the user message already
  // lives in the branch — routeAndPersist only appends the assistant reply).
  const bot = await prisma.bot.findUnique({ where: { id: source.botId } });
  const history = keep.map((m) => ({ role: m.role, content: m.content })).slice(-10);
  const response = await routeAndPersist(bot, branch.id, newText, history);
  return { conversationId: branch.id, botId: source.botId, response };
}

/** Manual summarize button — LLM summary with offline heuristic fallback. */
export async function summarizeConversation(convId, orgId) {
  await assertConvInOrg(convId, orgId);
  const messages = await db.getMessages(convId);
  if (!messages.length) throw new ApiError(400, 'Nothing to summarize yet');

  const text = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
  let summary;
  try {
    summary = await summarizeText(text);
  } catch {
    const users = messages.filter((m) => m.role === 'user').slice(0, 5).map((m) => m.content);
    summary = `Conversation covered ${messages.length} messages. Key topics: "${users.join('" · "')}"`;
  }
  return summary;
}

/** Pin / unpin a message. */
export async function togglePin(convId, orgId, msgId) {
  await assertConvInOrg(convId, orgId);
  const msg = await prisma.message.findFirst({ where: { id: msgId, conversationId: convId } });
  if (!msg) throw new ApiError(404, 'Message not found');
  const updated = await prisma.message.update({ where: { id: msgId }, data: { pinned: !msg.pinned } });
  return updated.pinned;
}

/** React to a message (1 = up, -1 = down, 0 = clear) — stored in feedback. */
export async function reactToMessage(convId, orgId, msgId, value, userId) {
  await assertConvInOrg(convId, orgId);
  const msg = await prisma.message.findFirst({ where: { id: msgId, conversationId: convId } });
  if (!msg) throw new ApiError(404, 'Message not found');
  if (value === 0) {
    await prisma.feedback.deleteMany({ where: { messageId: msgId } });
    return 0;
  }
  const rating = value === 1 ? 1 : -1;
  const existing = await prisma.feedback.findUnique({ where: { messageId: msgId } });
  if (existing) {
    await prisma.feedback.update({ where: { messageId: msgId }, data: { rating, userId } });
  } else {
    await prisma.feedback.create({
      data: { id: uid9(), messageId: msgId, userId, rating, createdAt: new Date() },
    });
  }
  return rating;
}
