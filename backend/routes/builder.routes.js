/**
 * Bot builder routes (Checkpoint 8) — config updates + versioning, templates,
 * flow save, slot-form config.
 */
import { Router } from 'express';
import * as builderService from '../services/builder.service.js';
import { TEMPLATES } from '../services/templates.data.js';
import { validateFlow } from '../services/engines.service.js';
import { validate, schemas } from '../middleware/validate.js';
import { requireOrgRole } from '../middleware/auth.js';
import db from '../db.js';

const router = Router();

// Update bot config (auto-snapshots the previous state as a version).
router.patch('/:botId', requireOrgRole('editor'), validate(schemas.updateBot), async (req, res, next) => {
  try {
    const bot = await builderService.updateBot(req.params.botId, req.org.id, req.body, req.user.id);
    res.json(await db.getBot(bot.id, req.org.id));
  } catch (e) { next(e); }
});

// Version history.
router.get('/:botId/versions', async (req, res, next) => {
  try { res.json(await builderService.listVersions(req.params.botId, req.org.id)); } catch (e) { next(e); }
});

// Roll back to a version.
router.post('/:botId/versions/:versionId/rollback', requireOrgRole('editor'), async (req, res, next) => {
  try {
    const bot = await builderService.rollbackTo(req.params.botId, req.org.id, req.params.versionId, req.user.id);
    res.json(await db.getBot(bot.id, req.org.id));
  } catch (e) { next(e); }
});

// Save the visual flow (validated before persist).
router.patch('/:botId/flow', requireOrgRole('editor'), validate(schemas.saveFlow), async (req, res, next) => {
  try {
    const check = validateFlow(req.body.flow);
    if (!check.ok) return res.status(400).json({ error: check.error });
    const bot = await builderService.updateBot(req.params.botId, req.org.id, { flow: req.body.flow }, req.user.id);
    res.json({ success: true, saved: true });
  } catch (e) { next(e); }
});

export default router;