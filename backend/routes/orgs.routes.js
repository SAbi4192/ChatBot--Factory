import { Router } from 'express';
import * as orgService from '../services/org.service.js';
import { requireAuth, requireOrgRole } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';

const router = Router();

router.use(requireAuth); // all org routes require authentication

// List my orgs (for the switcher) & create a new one.
router.get('/', async (req, res, next) => {
  try { res.json(await orgService.listMyOrgs(req.user.id)); } catch (e) { next(e); }
});

router.post('/', validate(schemas.createOrg), async (req, res, next) => {
  try { res.json(await orgService.createOrg(req.user.id, req.body)); } catch (e) { next(e); }
});

// Join with an invite code (no orgId needed, hence outside the :orgId scope).
router.post('/join', validate(schemas.joinOrg), async (req, res, next) => {
  try { res.json(await orgService.joinWithInvite(req.user.id, req.body)); } catch (e) { next(e); }
});

// --- Scoped under an org -----------------------------------------------
router.param('orgId', (req, _res, next, id) => {
  req.params.orgId = id;
  next();
});

router.get('/:orgId', async (req, res, next) => {
  try { res.json(await orgService.getOrg(req.params.orgId)); } catch (e) { next(e); }
});

router.patch('/:orgId', requireOrgRole('admin'), validate(schemas.updateOrg), async (req, res, next) => {
  try { res.json(await orgService.updateOrg(req.params.orgId, req.body)); } catch (e) { next(e); }
});

router.delete('/:orgId', requireOrgRole('admin'), async (req, res, next) => {
  try {
    await orgService.deleteOrg(req.params.orgId);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Members
router.get('/:orgId/members', async (req, res, next) => {
  try { res.json(await orgService.listMembers(req.params.orgId)); } catch (e) { next(e); }
});

router.delete('/:orgId/members/:userId', requireOrgRole('admin'), async (req, res, next) => {
  try {
    await orgService.removeMember(req.params.orgId, req.params.userId);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/:orgId/members/:userId', requireOrgRole('admin'), validate(schemas.setMemberRole), async (req, res, next) => {
  try {
    await orgService.setMemberRole(req.params.orgId, req.params.userId, req.body.role);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Invites
router.post('/:orgId/invites', requireOrgRole('admin'), validate(schemas.createInvite), async (req, res, next) => {
  try { res.json(await orgService.createInvite(req.params.orgId, req.user.id, req.body)); } catch (e) { next(e); }
});

// Activity
router.get('/:orgId/activity', async (req, res, next) => {
  try { res.json(await orgService.getActivity(req.params.orgId)); } catch (e) { next(e); }
});

export default router;