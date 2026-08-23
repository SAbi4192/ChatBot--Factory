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
router.get('/', (req, res) => {
  res.json(botService.listBots());
});

// Generate bots. Server caps at 50 per request; the frontend batches more.
router.post('/generate', aiLimiter, validate(schemas.generateBots), async (req, res) => {
  const { count } = req.body;
  const { bots, count: n, capped } = await botService.generateBots(count);
  res.json({ success: true, count: n, capped, sample: bots[0] });
});

// Get a single bot (404 if missing).
router.get('/:botId', (req, res) => {
  res.json(botService.getBotOrThrow(req.params.botId));
});

// Toggle favorite.
router.post('/:botId/favorite', (req, res) => {
  const favorite = botService.toggleFavorite(req.params.botId);
  res.json({ success: true, favorite });
});

// Delete a single bot with cascade (conversations + messages go too).
router.delete('/:botId', (req, res) => {
  botService.deleteBot(req.params.botId);
  res.json({ success: true });
});

// Delete ALL bots, conversations and messages.
router.delete('/', (req, res) => {
  botService.deleteAllBots();
  res.json({ success: true });
});

// Conversations scoped under a bot.
router.get('/:botId/conversations', (req, res) => {
  res.json(conversationService.listConversations(req.params.botId));
});

router.post('/:botId/conversations', validate(schemas.createConversationUnderBot), (req, res) => {
  res.json(conversationService.createConversation(req.params.botId, req.body));
});

export default router;
