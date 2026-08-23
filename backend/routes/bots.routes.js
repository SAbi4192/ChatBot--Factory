/**
 * Bot routes — list, get, generate, favorite, delete.
 */
import { Router } from 'express';
import * as botService from '../services/bot.service.js';
import * as conversationService from '../services/conversation.service.js';
import { validate, schemas } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimits.js';

const router = Router();

// List all bots (newest first, with conversation counts).
router.get('/', async (req, res) => {
  res.json(await botService.listBots());
});

// Generate bots. Server caps at 50 per request; the frontend batches more.
router.post('/generate', aiLimiter, validate(schemas.generateBots), async (req, res) => {
  const { count } = req.body;
  const { bots, count: n, capped } = await botService.generateBots(count);
  res.json({ success: true, count: n, capped, sample: bots[0] });
});

// Get a single bot (404 if missing).
router.get('/:botId', async (req, res) => {
  res.json(await botService.getBotOrThrow(req.params.botId));
});

// Toggle favorite.
router.post('/:botId/favorite', async (req, res) => {
  const favorite = await botService.toggleFavorite(req.params.botId);
  res.json({ success: true, favorite });
});

// Delete a single bot with cascade (conversations + messages go too).
router.delete('/:botId', async (req, res) => {
  await botService.deleteBot(req.params.botId);
  res.json({ success: true });
});

// Delete ALL bots, conversations and messages.
router.delete('/', async (req, res) => {
  await botService.deleteAllBots();
  res.json({ success: true });
});

// Conversations scoped under a bot.
router.get('/:botId/conversations', async (req, res) => {
  res.json(await conversationService.listConversations(req.params.botId));
});

router.post('/:botId/conversations', validate(schemas.createConversationUnderBot), async (req, res) => {
  res.json(await conversationService.createConversation(req.params.botId, req.body));
});

export default router;
