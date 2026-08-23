/**
 * Conversation service — business logic for conversations and messages.
 *
 * Owns ID generation and default titles so route handlers stay thin.
 */
import db from '../db.js';
import { uid } from './bot.service.js';

/** List a bot's conversations, most recently active first. */
export function listConversations(botId) {
  return db.getConversations(botId);
}

/**
 * Create a conversation under a bot.
 * id / title / createdAt are optional — the server fills sensible defaults.
 */
export function createConversation(botId, { id, title, createdAt } = {}) {
  const convId = id || uid();
  const convTitle = title || 'New Conversation';
  const ts = createdAt || Date.now();
  db.createConversation(convId, botId, convTitle, ts);
  return { id: convId, botId, title: convTitle, createdAt: ts };
}

/** Rename a conversation. */
export function renameConversation(convId, title) {
  db.renameConversation(convId, title);
}

/** Delete a conversation and cascade to its messages. */
export function deleteConversation(convId) {
  db.deleteConversation(convId);
}

/** Fetch all messages of a conversation, oldest first. */
export function getMessages(convId) {
  return db.getMessages(convId);
}
