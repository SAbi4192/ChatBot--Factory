/**
 * Public share route — read-only conversation views for /share/:id.
 * Mounted WITHOUT auth middleware.
 */
import { Router } from 'express';
import * as shareService from '../services/share.service.js';

const router = Router();

router.get('/:convId', async (req, res, next) => {
  try {
    const shared = await shareService.getSharedConversation(req.params.convId);
    if (!shared) return res.status(404).json({ error: 'Shared conversation not found' });
    res.json(shared);
  } catch (e) { next(e); }
});

export default router;