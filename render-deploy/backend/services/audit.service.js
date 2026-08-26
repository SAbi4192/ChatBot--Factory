/**
 * Audit trail — every meaningful action lands in analytics_events so org
 * admins can see who did what, when (the activity log).
 */
import { prisma } from '../prisma.js';

const uid = () => Math.random().toString(36).substring(2, 11);

/**
 * Record an activity event.
 * @param {object} params
 * @param {string} params.orgId   owning organization
 * @param {string} params.actorId acting user id
 * @param {string} params.actorName human-readable actor label (email/name)
 * @param {string} params.eventType e.g. 'bot.created' | 'org.member_invited'
 * @param {object} [params.data]   free-form JSON detail
 * @param {string} [params.botId]  optional bot the event relates to
 */
export async function logActivity({ orgId, actorId, actorName, eventType, data = null, botId = null }) {
  try {
    await prisma.analyticsEvent.create({
      data: {
        id: uid(),
        botId,
        orgId,
        eventType,
        data: {
          actorId,
          actorName,
          at: new Date().toISOString(),
          ...(data ?? {}),
        },
      },
    });
  } catch (err) {
    // The audit trail must never break the action that triggered it.
    console.error('[audit] failed to log event:', err.message);
  }
}

/** Most recent activity for an org, newest first. */
export function listActivity(orgId, limit = 40) {
  return prisma.analyticsEvent.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
