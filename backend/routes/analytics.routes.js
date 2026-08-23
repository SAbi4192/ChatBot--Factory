/**
 * Analytics routes (Checkpoint 6).
 */
import { Router } from 'express';
import * as analyticsService from '../services/analytics.service.js';

const router = Router();

router.get('/overview', async (req, res, next) => {
  try { res.json(await analyticsService.getOverview(req.org.id)); } catch (e) { next(e); }
});

router.get('/bots/:botId', async (req, res, next) => {
  try {
    const data = await analyticsService.getBotAnalytics(req.params.botId, req.org.id);
    if (!data) return res.status(404).json({ error: 'Bot not found' });
    res.json(data);
  } catch (e) { next(e); }
});

router.get('/realtime', async (req, res, next) => {
  try { res.json(await analyticsService.getRealtime(req.org.id)); } catch (e) { next(e); }
});

export default router;