/**
 * Conversation intelligence routes (Checkpoint 4):
 * fork (edit + branch), summarize, pin messages, reactions.
 * (The public share endpoint lives in share.routes.js.)
 */
import { Router } from 'express';
import * as intelligenceService from '../services/intelligence.service.js';
import { validate, schemas } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimits.js';

const router = Router();

// Fork: edit a message, branch into a NEW conversation, regenerate the reply.
router.post('/:convId/fork', aiLimiter, validate(schemas.forkConversation), async (req, res, next) => {
  try {
    const { messageId, newText } = req.body;
    const result = await intelligenceService.forkConversation(req.params.convId, req.org.id, messageId, newText);
    res.json(result);
  } catch (e) { next(e); }
});

// Manual summarize button.
router.post('/:convId/summarize', aiLimiter, async (req, res, next) => {
  try {
    const summary = await intelligenceService.summarizeConversation(req.params.convId, req.org.id);
    res.json({ summary });
  } catch (e) { next(e); }
});

// Pin / unpin a message.
router.patch('/:convId/messages/:msgId/pin', async (req, res, next) => {
  try {
    const pinned = await intelligenceService.togglePin(req.params.convId, req.org.id, req.params.msgId);
    res.json({ success: true, pinned });
  } catch (e) { next(e); }
});

// Reaction (thumbs up/down) — feeds the CSAT analytics.
router.post('/:convId/messages/:msgId/reaction', validate(schemas.reaction), async (req, res, next) => {
  try {
    const rating = await intelligenceService.reactToMessage(req.params.convId, req.org.id, req.params.msgId, req.body.value, req.user.id);
    res.json({ success: true, rating });
  } catch (e) { next(e); }
});

export default router;