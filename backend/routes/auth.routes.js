import { Router } from 'express';
import * as authService from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimits.js';
import { validate, schemas } from '../middleware/validate.js';

const router = Router();

router.post('/register', authLimiter, validate(schemas.register), async (req, res, next) => {
  try { res.json(await authService.register(req.body)); } catch (e) { next(e); }
});

router.post('/login', authLimiter, validate(schemas.login), async (req, res, next) => {
  try { res.json(await authService.login(req.body)); } catch (e) { next(e); }
});

router.post('/refresh', validate(schemas.refresh), async (req, res, next) => {
  try { res.json(await authService.refresh(req.body)); } catch (e) { next(e); }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await authService.logout(req.user.id);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, (req, res) => {
  const { passwordHash, tokenVersion, ...rest } = req.user;
  res.json({ ...rest, createdAt: rest.createdAt?.getTime?.() ?? rest.createdAt });
});

router.patch('/me', requireAuth, validate(schemas.updateProfile), async (req, res, next) => {
  try { res.json(await authService.updateProfile(req.user.id, req.body)); } catch (e) { next(e); }
});

router.post('/change-password', requireAuth, validate(schemas.changePassword), async (req, res, next) => {
  try {
    await authService.changePassword(req.user.id, req.body);
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;