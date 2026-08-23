/**
 * Health / provider-status routes.
 */
import { Router } from 'express';
import * as chatService from '../services/chat.service.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const status = await chatService.providerStatus();
    res.json({ ok: true, ...status });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
