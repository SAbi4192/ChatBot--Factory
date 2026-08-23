/**
 * Chat service — thin business-logic layer over the hybrid AI router.
 *
 * Kept separate so routes never import llmService directly; when memory,
 * RAG and analytics hooks land in later checkpoints they plug in here.
 */
import {
  generateChatResponse,
  regenerateChatResponse,
  getProviderStatus,
} from '../llmService.js';

/** Health-check snapshot of every AI provider. */
export async function providerStatus() {
  return getProviderStatus();
}

/** Send a user message through the hybrid router and persist the exchange. */
export async function chat(botId, conversationId, message) {
  return generateChatResponse(botId, conversationId, message);
}

/** Regenerate the last assistant reply of a conversation. */
export async function regenerate(botId, conversationId) {
  return regenerateChatResponse(botId, conversationId);
}
