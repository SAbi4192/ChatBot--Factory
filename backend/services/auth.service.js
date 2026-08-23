/**
 * Auth service — registration, login, refresh-token rotation, logout,
 * profile management, and the first-run bootstrap admin.
 *
 * Token model:
 *   - access token:  short-lived (15 min default), signed, stateless.
 *   - refresh token: longer-lived, carries the user's tokenVersion.
 *   - rotation:      every refresh bumps tokenVersion, killing the old
 *                    refresh token immediately (and any previously issued
 *                    ones — logout invalidates everything at once).
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { ApiError } from '../middleware/errorHandler.js';
import { signAccessToken, signRefreshToken } from '../middleware/auth.js';
import { logActivity } from './audit.service.js';

const REFRESH_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const uid = () => Math.random().toString(36).substring(2, 11);

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

function toUserDto(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    createdAt: user.createdAt.getTime(),
  };
}

/** Build the auth payload the client needs to bootstrap its session. */
async function authPayload(user, remember) {
  const memberships = await prisma.orgMember.findMany({
    where: { userId: user.id },
    orderBy: { id: 'asc' },
  });
  const orgs = await prisma.organization.findMany({
    where: { id: { in: memberships.map((m) => m.orgId) } },
  });
  const orgList = memberships.map((m) => {
    const org = orgs.find((o) => o.id === m.orgId);
    return org ? { id: org.id, name: org.name, slug: org.slug, role: m.role, plan: org.plan } : null;
  }).filter(Boolean);

  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
    user: toUserDto(user),
    orgs: orgList,
    currentOrgId: orgList[0]?.id ?? null,
    remember: !!remember,
  };
}

/** Register a new user; a personal workspace is created for them. */
export async function register({ email, name, password }) {
  const normalized = String(email).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) throw new ApiError(409, 'An account with this email already exists');

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        id: uid(),
        email: normalized,
        name: name || normalized.split('@')[0],
        passwordHash: await hashPassword(password),
        role: 'admin', // a personal workspace owner is its admin
      },
    });
    const org = await tx.organization.create({
      data: {
        id: uid(),
        name: `${created.name || 'User'}'s Workspace`,
        slug: `ws-${uid()}`,
        ownerId: created.id,
      },
    });
    await tx.orgMember.create({
      data: { id: uid(), orgId: org.id, userId: created.id, role: 'admin' },
    });
    return created;
  });

  await logActivity({
    orgId: (await prisma.orgMember.findFirst({ where: { userId: user.id } }))?.orgId,
    actorId: user.id,
    actorName: user.email,
    eventType: 'auth.registered',
  });
  return authPayload(user, false);
}

/** Login with email + password. */
export async function login({ email, password, remember = false }) {
  const normalized = String(email).trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user?.passwordHash) throw new ApiError(401, 'Invalid email or password');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new ApiError(401, 'Invalid email or password');

  await logActivity({
    orgId: (await prisma.orgMember.findFirst({ where: { userId: user.id } }))?.orgId,
    actorId: user.id,
    actorName: user.email,
    eventType: 'auth.login',
  });
  return authPayload(user, remember);
}

/**
 * Refresh-token rotation: verify the refresh token, then bump the user's
 * tokenVersion (invalidating the presented token and every other refresh
 * token issued before) and mint a fresh pair.
 */
export async function refresh({ refreshToken }) {
  if (!refreshToken) throw new ApiError(401, 'Missing refresh token');
  let payload;
  try {
    payload = jwt.verify(refreshToken, REFRESH_SECRET);
  } catch {
    throw new ApiError(401, 'Session expired — please sign in again');
  }
  if (payload.kind !== 'refresh') throw new ApiError(401, 'Invalid token type');

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new ApiError(401, 'Account no longer exists');
  if (user.tokenVersion !== (payload.tv ?? 0)) {
    throw new ApiError(401, 'Session invalidated — please sign in again');
  }

  // Rotation: invalidate the presented refresh token and all prior ones.
  const rotated = await prisma.user.update({
    where: { id: user.id },
    data: { tokenVersion: { increment: 1 } },
  });
  return authPayload(rotated, true);
}

/** Logout: bump tokenVersion so every outstanding refresh token dies. */
export async function logout(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

/** Update profile (display name / avatar). */
export async function updateProfile(userId, { name, avatar }) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(avatar !== undefined ? { avatar } : {}),
    },
  });
  return toUserDto(user);
}

/** Change password: verify the current one, then set the new hash. */
export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) throw new ApiError(400, 'This account has no password');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new ApiError(400, 'Current password is incorrect');

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
  });
}

/**
 * First-run bootstrap: when the DB has bots but no users (the pre-auth era),
 * create an admin account and an org that owns every legacy bot, so the
 * existing factory data is immediately usable after signing in.
 */
export async function bootstrapIfNeeded() {
  const userCount = await prisma.user.count();
  const botCount = await prisma.bot.count();
  if (userCount > 0 || botCount === 0) return null;

  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@factory.local').toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin123';
  const name = process.env.BOOTSTRAP_ADMIN_NAME || 'Factory Admin';

  const admin = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id: uid(),
        email,
        name,
        passwordHash: await hashPassword(password),
        role: 'admin',
      },
    });
    const org = await tx.organization.create({
      data: {
        id: uid(),
        name: 'Factory HQ',
        slug: 'factory-hq',
        ownerId: user.id,
        plan: 'demo',
        maxBots: 5000,
        maxMessagesPerDay: 2000,
        maxMembers: 25,
      },
    });
    await tx.orgMember.create({
      data: { id: uid(), orgId: org.id, userId: user.id, role: 'admin' },
    });
    await tx.bot.updateMany({ where: { orgId: null }, data: { orgId: org.id } });
    return user;
  });

  console.log(`\n🔐 Bootstrap admin created — sign in with ${email} / ${password}`);
  console.log('   (Set BOOTSTRAP_ADMIN_* in .env to change these.)\n');
  return admin;
}
