/**
 * Chat service — business logic over the hybrid AI router.
 *
 * Enforces org scoping (the bot must belong to the caller's org) and the
 * per-org daily message quota, then delegates to llmService. If the bot has
 * a knowledge base, RAG retrieval augments the context before the AI call
 * (Checkpoint 5).
 */
import {
  generateChatResponse,
  regenerateChatResponse,
  getProviderStatus,
} from '../llmService.js';
import db from '../db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { checkMessageQuota } from './org.service.js';
import { retrieveChunks } from './rag.service.js';

/** Health-check snapshot of every AI provider. */
export async function providerStatus() {
  return getProviderStatus();
}

/** Inject RAG context into the user message if the bot has a KB. */
async function withRag(botId, userMessage) {
  const chunks = await retrieveChunks(botId, userMessage);
  if (!chunks.length) return { augmented: userMessage, sources: [] };
  const context = chunks.map((c) => `[Source: ${c.source}]\n${c.content}`).join('\n\n');
  const uniqueSources = [...new Set(chunks.map((c) => c.source))];
  const augmented = `${userMessage}\n\n---\n**Knowledge base context (from ${uniqueSources.join(', ')}):**\n${context}\n---\nAnswer with these sources when relevant.`;
  return { augmented, sources: uniqueSources };
}

/** Send a user message through the hybrid router and persist the exchange. */
export async function chat(botId, conversationId, message, orgId) {
  if (!(await db.botInOrg(botId, orgId))) throw new ApiError(404, 'Bot not found');
  if (!(await db.conversationInOrg(conversationId, orgId))) {
    throw new ApiError(404, 'Conversation not found');
  }
  const quota = await checkMessageQuota(orgId);
  if (!quota.ok) throw new ApiError(429, quota.message);

  // RAG: augment the message with KB context before the AI call.
  const { augmented, sources } = await withRag(botId, message);
  const response = await generateChatResponse(botId, conversationId, augmented);
  return { ...response, sources: response.sources?.length ? response.sources : sources, quota: quota.usage };
}

/** Regenerate the last assistant reply of a conversation. */
export async function regenerate(botId, conversationId, orgId) {
  if (!(await db.botInOrg(botId, orgId))) throw new ApiError(404, 'Bot not found');
  if (!(await db.conversationInOrg(conversationId, orgId))) {
    throw new ApiError(404, 'Conversation not found');
  }
  const quota = await checkMessageQuota(orgId);
  if (!quota.ok) throw new ApiError(429, quota.message);

  const response = await regenerateChatResponse(botId, conversationId);
  return { ...response, quota: quota.usage };
}