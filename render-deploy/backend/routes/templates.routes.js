/**
 * Templates marketplace routes (Checkpoint 8).
 */
import { Router } from 'express';
import * as builderService from '../services/builder.service.js';
import { TEMPLATES } from '../services/templates.data.js';
import db from '../db.js';

const router = Router();

// List templates (marketplace + any user-saved ones live in localStorage).
router.get('/', (_req, res) => {
  res.json({ templates: TEMPLATES });
});

// Install a template as a new bot.
router.post('/install', async (req, res, next) => {
  try {
    const bot = await builderService.installTemplate(req.body.templateId, req.org.id, req.user.id);
    res.json(await db.getBot(bot.id, req.org.id));
  } catch (e) { next(e); }
});

// Save an existing bot as a reusable template (returns a template object the
// client can persist locally; templates are shared via the marketplace UI).
router.post('/save', async (req, res, next) => {
  try {
    const t = await builderService.saveAsTemplate(req.body.botId, req.org.id, req.user.id);
    res.json(t);
  } catch (e) { next(e); }
});

export default router;