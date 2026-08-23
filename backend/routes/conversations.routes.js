/**
 * Conversation routes — create (legacy), rename, delete, list messages.
 */
import { Router } from 'express';
import * as conversationService from '../services/conversation.service.js';
import { validate, schemas } from '../middleware/validate.js';

const router = Router();

// Backwards-compatible endpoint (frontend historically posted here).
router.post('/', validate(schemas.createConversation), async (req, res) => {
  const { id, botId, title, createdAt } = req.body;
  await conversationService.createConversation(botId, { id, title, createdAt });
  res.json({ success: true });
});

router.patch('/:convId', validate(schemas.renameConversation), async (req, res) => {
  await conversationService.renameConversation(req.params.convId, req.body.title);
  res.json({ success: true });
});

router.delete('/:convId', async (req, res) => {
  await conversationService.deleteConversation(req.params.convId);
  res.json({ success: true });
});

router.get('/:convId/messages', async (req, res) => {
  res.json(await conversationService.getMessages(req.params.convId));
});

export default router;
