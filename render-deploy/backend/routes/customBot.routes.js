/**
 * Custom bot creation routes — "just describe it".
 */
import { Router } from 'express';
import * as customBotService from '../services/customBot.service.js';
import db from '../db.js';
import { validate, schemas } from '../middleware/validate.js';

const router = Router();

// Design (no persist) — powers the live preview.
router.post('/design', validate(schemas.customBotDesign), async (req, res, next) => {
  try {
    const design = await customBotService.designBot(req.body.description);
    res.json({ design, designDna: customBotService.themeToDna(design.theme) });
  } catch (e) { next(e); }
});

// Regenerate one section of a design.
router.post('/design/regenerate', validate(schemas.customBotRegenerate), async (req, res, next) => {
  try {
    const merged = await customBotService.regenerateSection(req.body.description, req.body.section, req.body.current ?? {});
    res.json({ design: merged, designDna: customBotService.themeToDna(merged.theme) });
  } catch (e) { next(e); }
});

// Create and persist the custom bot.
router.post('/', validate(schemas.customBotCreate), async (req, res, next) => {
  try {
    const bot = await customBotService.createCustomBot(req.body, req.org.id, req.user.id);
    res.json(await db.getBot(bot.id, req.org.id));
  } catch (e) { next(e); }
});

export default router;