/**
 * Authentication + authorization middleware.
 *
 * - requireAuth: verifies the Bearer access token, loads the user, and
 *   resolves the current organization (x-org-id header, or the user's
 *   personal org). Sets req.user / req.org / req.membership.
 * - requireOrgRole: rejects when the caller's org role is below the minimum.
 *
 * RBAC model: platform roles live on User (admin/editor/viewer); org roles
 * live on OrgMember (admin/editor/viewer). For this demo the org role is the
 * one that gates bot management; the platform role gates org administration.
 */
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { ApiError } from './errorHandler.js';

const ACCESS_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ROLE_RANK = { viewer: 1, editor: 2, admin: 3 };

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, tv: user.tokenVersion },
    ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, tv: user.tokenVersion, kind: 'refresh' },
    ACCESS_SECRET,
    { expiresIn: process.env.JWT_REFRESH_TTL || '7d' }
  );
}

/**
 * Resolve the user's current org: x-org-id header wins; otherwise the org
 * they created first (their personal workspace). Throws when the user is not
 * a member of the requested org.
 */
async function resolveOrg(userId, headerOrgId) {
  const memberships = await prisma.orgMember.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
  });
  if (!memberships.length) return null;

  let membership = memberships[0];
  if (headerOrgId) {
    membership = memberships.find((m) => m.orgId === headerOrgId) ?? null;
    if (!membership) {
      throw new ApiError(403, 'You are not a member of that organization');
    }
  }
  const org = await prisma.organization.findUnique({ where: { id: membership.orgId } });
  return { org, membership };
}

/** Authenticate the request: Bearer token -> user + org + membership. */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Authentication required');

    let payload;
    try {
      payload = jwt.verify(token, ACCESS_SECRET);
    } catch {
      throw new ApiError(401, 'Session expired — please sign in again');
    }
    if (payload.kind === 'refresh') throw new ApiError(401, 'Invalid token type');

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new ApiError(401, 'Account no longer exists');
    if (user.tokenVersion !== (payload.tv ?? 0)) {
      throw new ApiError(401, 'Session invalidated — please sign in again');
    }

    const { org, membership } = await resolveOrg(user.id, req.headers['x-org-id']);
    req.user = user;
    req.org = org;
    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Gate by minimum org role. Usage: router.post('/', requireOrgRole('editor'), ...)
 * Admins can do everything; editors manage bots; viewers can only read/chat.
 */
export function requireOrgRole(minRole) {
  return (req, _res, next) => {
    const rank = ROLE_RANK[req.membership?.role] ?? 0;
    if (rank < (ROLE_RANK[minRole] ?? 1)) {
      return next(new ApiError(403, `Requires the '${minRole}' role or higher in this organization`));
    }
    next();
  };
}
