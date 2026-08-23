/**
 * Bot routes — list, get, generate, favorite, delete.
 * All require authentication; operations are scoped to the caller's org.
 */
import { Router } from 'express';
import * as botService from '../services/bot.service.js';
import * as conversationService from '../services/conversation.service.js';
import { validate, schemas } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimits.js';

const router = Router();

// List all bots (newest first, with conversation counts).
router.get('/', async (req, res) => {
  res.json(await botService.listBots(req.org.id));
});

// Generate bots. Server caps at 50 per request; the frontend batches more.
router.post('/generate', aiLimiter, validate(schemas.generateBots), async (req, res, next) => {
  try {
    const { count } = req.body;
    const { bots, count: n, capped, quota } = await botService.generateBots(count, req.org.id);
    res.json({ success: true, count: n, capped, sample: bots[0], quota });
  } catch (e) { next(e); }
});

// Get a single bot (404 if missing).
router.get('/:botId', async (req, res, next) => {
  try { res.json(await botService.getBotOrThrow(req.params.botId, req.org.id)); } catch (e) { next(e); }
});

// Toggle favorite.
router.post('/:botId/favorite', async (req, res, next) => {
  try {
    const favorite = await botService.toggleFavorite(req.params.botId, req.org.id);
    res.json({ success: true, favorite });
  } catch (e) { next(e); }
});

// Delete a single bot with cascade (conversations + messages go too).
router.delete('/:botId', async (req, res, next) => {
  try {
    await botService.deleteBot(req.params.botId, req.org.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Delete ALL bots, conversations and messages in the org.
router.delete('/', async (req, res, next) => {
  try {
    await botService.deleteAllBots(req.org.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Conversations scoped under a bot.
router.get('/:botId/conversations', async (req, res, next) => {
  try { res.json(await conversationService.listConversations(req.params.botId, req.org.id)); } catch (e) { next(e); }
});

router.post('/:botId/conversations', validate(schemas.createConversationUnderBot), async (req, res, next) => {
  try {
    const conv = await conversationService.createConversation(req.params.botId, req.org.id, req.body);
    res.json(conv);
  } catch (e) { next(e); }
});

export default router;