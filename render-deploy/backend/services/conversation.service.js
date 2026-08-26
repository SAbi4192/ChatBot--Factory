/**
 * Conversation service — business logic for conversations and messages.
 *
 * Owns ID generation and default titles so route handlers stay thin.
 * Every operation verifies the resource belongs to the caller's org.
 */
import db from '../db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { uid } from './bot.service.js';

async function assertBotInOrg(botId, orgId) {
  if (!(await db.botInOrg(botId, orgId))) {
    throw new ApiError(404, 'Bot not found');
  }
}

async function assertConvInOrg(convId, orgId) {
  if (!(await db.conversationInOrg(convId, orgId))) {
    throw new ApiError(404, 'Conversation not found');
  }
}

/** List a bot's conversations, most recently active first. */
export async function listConversations(botId, orgId) {
  await assertBotInOrg(botId, orgId);
  return db.getConversations(botId);
}

/**
 * Create a conversation under a bot.
 * id / title / createdAt are optional — the server fills sensible defaults.
 */
export async function createConversation(botId, orgId, { id, title, createdAt } = {}) {
  await assertBotInOrg(botId, orgId);
  const convId = id || uid();
  const convTitle = title || 'New Conversation';
  const ts = createdAt || Date.now();
  await db.createConversation(convId, botId, convTitle, ts);
  return { id: convId, botId, title: convTitle, createdAt: ts };
}

/** Rename a conversation. */
export async function renameConversation(convId, orgId, title) {
  await assertConvInOrg(convId, orgId);
  await db.renameConversation(convId, title);
}

/** Delete a conversation and cascade to its messages. */
export async function deleteConversation(convId, orgId) {
  await assertConvInOrg(convId, orgId);
  await db.deleteConversation(convId);
}

/** Fetch all messages of a conversation, oldest first. */
export async function getMessages(convId, orgId) {
  await assertConvInOrg(convId, orgId);
  return db.getMessages(convId);
}
