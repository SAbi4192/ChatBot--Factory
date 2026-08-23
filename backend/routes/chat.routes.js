/**
 * Chat routes — send a message, regenerate the last reply.
 * Both are rate-limited (each call costs real provider tokens).
 */
import { Router } from 'express';
import * as chatService from '../services/chat.service.js';
import { validate, schemas } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimits.js';

const router = Router();

router.post('/', aiLimiter, validate(schemas.chat), async (req, res) => {
  const { botId, conversationId, message } = req.body;
  const response = await chatService.chat(botId, conversationId, message);
  res.json(response);
});

router.post('/regenerate', aiLimiter, validate(schemas.regenerate), async (req, res) => {
  const { botId, conversationId } = req.body;
  const response = await chatService.regenerate(botId, conversationId);
  res.json(response);
});

export default router;
