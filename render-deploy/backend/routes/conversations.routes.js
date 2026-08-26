/**
 * Conversation routes — create (legacy), rename, delete, list messages.
 * All require auth; scoped by org.
 */
import { Router } from 'express';
import * as conversationService from '../services/conversation.service.js';
import { validate, schemas } from '../middleware/validate.js';

const router = Router();

// Backwards-compatible endpoint (frontend historically posted here).
router.post('/', validate(schemas.createConversation), async (req, res, next) => {
  try {
    const { id, botId, title, createdAt } = req.body;
    await conversationService.createConversation(botId, req.org.id, { id, title, createdAt });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/:convId', validate(schemas.renameConversation), async (req, res, next) => {
  try {
    await conversationService.renameConversation(req.params.convId, req.org.id, req.body.title);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:convId', async (req, res, next) => {
  try {
    await conversationService.deleteConversation(req.params.convId, req.org.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.get('/:convId/messages', async (req, res, next) => {
  try { res.json(await conversationService.getMessages(req.params.convId, req.org.id)); } catch (e) { next(e); }
});

export default router;