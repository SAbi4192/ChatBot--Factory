/**
 * Chat routes — send a message, regenerate, and SSE token streaming.
 * All require auth; scoped by org; rate-limited.
 */
import { Router } from 'express';
import * as chatService from '../services/chat.service.js';
import { validate, schemas } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimits.js';
import { streamChatResponse } from '../llmService.js';
import db from '../db.js';

const router = Router();

router.post('/', aiLimiter, validate(schemas.chat), async (req, res, next) => {
  try {
    const { botId, conversationId, message } = req.body;
    const response = await chatService.chat(botId, conversationId, message, req.org.id);
    res.json(response);
  } catch (e) { next(e); }
});

router.post('/regenerate', aiLimiter, validate(schemas.regenerate), async (req, res, next) => {
  try {
    const { botId, conversationId } = req.body;
    const response = await chatService.regenerate(botId, conversationId, req.org.id);
    res.json(response);
  } catch (e) { next(e); }
});

// SSE streaming — token-by-token responses. Emits JSON events:
//   data: { token } | { done } | { error }
router.post('/stream', aiLimiter, validate(schemas.chat), async (req, res, next) => {
  const { botId, conversationId, message } = req.body;

  // Org checks first (same as the non-streaming path).
  try {
    if (!(await db.botInOrg(botId, req.org.id))) throw new Error('Bot not found');
    if (!(await db.conversationInOrg(conversationId, req.org.id))) throw new Error('Conversation not found');
  } catch (e) { return next(e); }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const result = await streamChatResponse(botId, conversationId, message, (token) => send({ token }));
    send({ done: true, messageId: result.messageId, provider: result.provider, sources: result.sources, streamed: result.streamed });
  } catch (e) {
    send({ error: e.message });
  } finally {
    res.end();
  }
});

export default router;