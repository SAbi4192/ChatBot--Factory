/**
 * Organization service — workspaces, members, invite links, activity log,
 * and usage-quota enforcement (soft warning at 80%, hard block at 100%).
 */
import { prisma } from '../prisma.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logActivity, listActivity } from './audit.service.js';

const uid = () => Math.random().toString(36).substring(2, 11);
const DEFAULT_LIMITS = { maxBots: 200, maxMessagesPerDay: 500, maxMembers: 10 };

function toOrgDto(org, { memberCount, botCount, messagesToday } = {}) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    ownerId: org.ownerId,
    createdAt: org.createdAt.getTime(),
    limits: {
      maxBots: org.maxBots,
      maxMessagesPerDay: org.maxMessagesPerDay,
      maxMembers: org.maxMembers,
    },
    usage: {
      bots: botCount,
      messagesToday,
      members: memberCount,
    },
  };
}

/** All orgs the user belongs to (for the org switcher). */
export async function listMyOrgs(userId) {
  const memberships = await prisma.orgMember.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
    include: { org: true },
  });
  return memberships.map((m) => ({
    id: m.org.id,
    name: m.org.name,
    slug: m.org.slug,
    role: m.role,
    plan: m.org.plan,
  }));
}

export async function getOrg(orgId) {
  const [org, memberCount, botCount, messagesToday] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.orgMember.count({ where: { orgId } }),
    prisma.bot.count({ where: { orgId } }),
    prisma.message.count({
      where: {
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        conversation: { bot: { orgId } },
      },
    }),
  ]);
  if (!org) throw new ApiError(404, 'Organization not found');
  return toOrgDto(org, { memberCount, botCount, messagesToday });
}

/** Create an org; the creator becomes its admin. */
export async function createOrg(userId, { name }) {
  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        id: uid(),
        name,
        slug: `${uid()}-ws`,
        ownerId: userId,
        ...DEFAULT_LIMITS,
      },
    });
    await tx.orgMember.create({
      data: { id: uid(), orgId: created.id, userId, role: 'admin' },
    });
    return created;
  });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  await logActivity({
    orgId: org.id,
    actorId: userId,
    actorName: user?.email ?? userId,
    eventType: 'org.created',
  });
  return getOrg(org.id);
}

/** Update org settings (name). */
export async function updateOrg(orgId, { name }) {
  const org = await prisma.organization.update({
    where: { id: orgId },
    data: { name },
  });
  await logActivity({
    orgId,
    actorId: org.ownerId,
    actorName: org.ownerId,
    eventType: 'org.updated',
    data: { name },
  });
  return getOrg(orgId);
}

/** Danger zone: delete the org (bots cascade via SetNull -> null orgId). */
export async function deleteOrg(orgId) {
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { conversation: { bot: { orgId } } } }),
    prisma.conversation.deleteMany({ where: { bot: { orgId } } }),
    prisma.bot.deleteMany({ where: { orgId } }),
    prisma.orgMember.deleteMany({ where: { orgId } }),
    prisma.organization.delete({ where: { id: orgId } }),
  ]);
}

/** Members with their roles. */
export async function listMembers(orgId) {
  const members = await prisma.orgMember.findMany({
    where: { orgId },
    include: { user: true },
    orderBy: { id: 'asc' },
  });
  return members.map((m) => ({
    userId: m.userId,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
  }));
}

/** Generate an invite code (no email server — the link IS the invite). */
export async function createInvite(orgId, actorUserId, { role = 'viewer' }) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new ApiError(404, 'Organization not found');

  const memberCount = await prisma.orgMember.count({ where: { orgId } });
  if (memberCount >= org.maxMembers) {
    throw new ApiError(429, `Member limit reached (${memberCount}/${org.maxMembers})`);
  }

  const code = Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const invite = await prisma.invite.create({
    data: {
      id: uid(),
      orgId,
      code,
      role,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  const actor = await prisma.user.findUnique({ where: { id: actorUserId } });
  await logActivity({
    orgId,
    actorId: actorUserId,
    actorName: actor?.email ?? actorUserId,
    eventType: 'org.member_invited',
    data: { code, role },
  });
  return { code, role, expiresAt: invite.expiresAt.getTime() };
}

/** Redeem an invite: join the org with the invite's role. */
export async function joinWithInvite(userId, { code }) {
  const invite = await prisma.invite.findUnique({ where: { code: String(code).trim().toUpperCase() } });
  if (!invite) throw new ApiError(404, 'Invalid invite code');
  if (invite.usedBy) throw new ApiError(409, 'This invite has already been used');
  if (invite.expiresAt < new Date()) throw new ApiError(410, 'This invite has expired');

  const existing = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId: invite.orgId, userId } },
  });
  if (existing) throw new ApiError(409, 'You are already a member of this organization');

  const memberCount = await prisma.orgMember.count({ where: { orgId: invite.orgId } });
  const org = await prisma.organization.findUnique({ where: { id: invite.orgId } });
  if (memberCount >= org.maxMembers) {
    throw new ApiError(429, `Member limit reached (${memberCount}/${org.maxMembers})`);
  }

  await prisma.$transaction([
    prisma.orgMember.create({
      data: { id: uid(), orgId: invite.orgId, userId, role: invite.role },
    }),
    prisma.invite.update({ where: { id: invite.id }, data: { usedBy: userId } }),
  ]);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  await logActivity({
    orgId: invite.orgId,
    actorId: userId,
    actorName: user?.email ?? userId,
    eventType: 'org.member_joined',
  });
  return { orgId: invite.orgId, orgName: org.name, role: invite.role };
}

/** Remove a member (owner cannot be removed). */
export async function removeMember(orgId, targetUserId) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (org.ownerId === targetUserId) throw new ApiError(400, 'The owner cannot be removed');
  await prisma.orgMember.deleteMany({ where: { orgId, userId: targetUserId } });
}

/** Change a member's role. */
export async function setMemberRole(orgId, targetUserId, role) {
  await prisma.orgMember.updateMany({
    where: { orgId, userId: targetUserId },
    data: { role },
  });
}

/**
 * Quota check for bot creation.
 * @returns {{ ok: boolean, warn: boolean, usage: {bots:number, maxBots:number}, message?: string }}
 */
export async function checkBotQuota(orgId, additional = 0) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const bots = await prisma.bot.count({ where: { orgId } });
  const projected = bots + additional;
  if (projected > org.maxBots) {
    return {
      ok: false,
      usage: { bots, maxBots: org.maxBots },
      message: `Bot quota exceeded — ${bots}/${org.maxBots}. Raise the limit in org settings or delete bots first.`,
    };
  }
  return {
    ok: true,
    warn: bots >= org.maxBots * 0.8,
    usage: { bots, maxBots: org.maxBots },
  };
}

/** Quota check for chat messages (per-day per-org). */
export async function checkMessageQuota(orgId) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const messagesToday = await prisma.message.count({
    where: { createdAt: { gte: today }, conversation: { bot: { orgId } } },
  });
  if (messagesToday >= org.maxMessagesPerDay) {
    return {
      ok: false,
      usage: { messagesToday, maxMessagesPerDay: org.maxMessagesPerDay },
      message: `Daily message limit reached (${messagesToday}/${org.maxMessagesPerDay}). Try again tomorrow.`,
    };
  }
  return {
    ok: true,
    warn: messagesToday >= org.maxMessagesPerDay * 0.8,
    usage: { messagesToday, maxMessagesPerDay: org.maxMessagesPerDay },
  };
}

/** Org activity feed. */
export async function getActivity(orgId) {
  const events = await listActivity(orgId);
  return events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    data: e.data,
    createdAt: e.createdAt.getTime(),
  }));
}
