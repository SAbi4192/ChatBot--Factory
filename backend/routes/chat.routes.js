/**
 * Chat routes — send a message, regenerate the last reply.
 * All require auth; scoped by org; rate-limited.
 */
import { Router } from 'express';
import * as chatService from '../services/chat.service.js';
import { validate, schemas } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimits.js';

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

export default router;