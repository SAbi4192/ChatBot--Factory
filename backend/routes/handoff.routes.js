/**
 * Handoff + agent routes (Checkpoint 9).
 */
import { Router } from 'express';
import * as agentService from '../services/agent.service.js';
import { validate, schemas } from '../middleware/validate.js';
import { requireOrgRole } from '../middleware/auth.js';

const router = Router();

// Request a handoff from the chat.
router.post('/request', validate(schemas.handoffRequest), async (req, res, next) => {
  try {
    const s = await agentService.requestHandoff(req.body.botId, req.body.conversationId, req.org.id, req.user.id);
    res.json({ success: true, sessionId: s.id, status: s.status });
  } catch (e) { next(e); }
});

// Agent queue.
router.get('/queue', requireOrgRole('editor'), async (req, res, next) => {
  try { res.json(await agentService.queue(req.org.id)); } catch (e) { next(e); }
});

router.get('/canned', (_req, res) => res.json({ responses: agentService.CANNED_RESPONSES }));

router.get('/sessions/:id', async (req, res, next) => {
  try { res.json(await agentService.getSession(req.params.id, req.org.id)); } catch (e) { next(e); }
});

router.post('/sessions/:id/pickup', requireOrgRole('editor'), async (req, res, next) => {
  try { res.json(await agentService.pickup(req.params.id, req.user.id, req.org.id)); } catch (e) { next(e); }
});

router.post('/sessions/:id/reply', requireOrgRole('editor'), validate(schemas.agentReply), async (req, res, next) => {
  try { res.json(await agentService.reply(req.params.id, req.body.content, req.org.id)); } catch (e) { next(e); }
});

router.post('/sessions/:id/close', requireOrgRole('editor'), async (req, res, next) => {
  try { res.json(await agentService.close(req.params.id, req.org.id)); } catch (e) { next(e); }
});

router.post('/sessions/:id/suggest', async (req, res, next) => {
  try { res.json(await agentService.suggest(req.params.id, req.org.id)); } catch (e) { next(e); }
});

router.post('/sessions/:id/notes', requireOrgRole('editor'), validate(schemas.agentNote), async (req, res, next) => {
  try { res.json(await agentService.addNote(req.params.id, req.body.note, req.org.id)); } catch (e) { next(e); }
});

export default router;