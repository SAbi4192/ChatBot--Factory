/**
 * Chat service — business logic over the hybrid AI router.
 *
 * Enforces org scoping (the bot must belong to the caller's org) and the
 * per-org daily message quota, then delegates to llmService.
 */
import {
  generateChatResponse,
  regenerateChatResponse,
  getProviderStatus,
} from '../llmService.js';
import db from '../db.js';
import { ApiError } from '../middleware/errorHandler.js';
import { checkMessageQuota } from './org.service.js';

/** Health-check snapshot of every AI provider. */
export async function providerStatus() {
  return getProviderStatus();
}

/** Send a user message through the hybrid router and persist the exchange. */
export async function chat(botId, conversationId, message, orgId) {
  if (!(await db.botInOrg(botId, orgId))) throw new ApiError(404, 'Bot not found');
  if (!(await db.conversationInOrg(conversationId, orgId))) {
    throw new ApiError(404, 'Conversation not found');
  }
  const quota = await checkMessageQuota(orgId);
  if (!quota.ok) throw new ApiError(429, quota.message);

  const response = await generateChatResponse(botId, conversationId, message);
  return { ...response, quota: quota.usage };
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
