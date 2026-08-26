/**
 * Human-in-the-loop (Checkpoint 9) — agent sessions, queue, co-pilot.
 */
import { prisma } from '../prisma.js';
import { ApiError } from '../middleware/errorHandler.js';
import { uid } from './bot.service.js';
import { logActivity } from './audit.service.js';

const uid9 = () => Math.random().toString(36).substring(2, 11);

export async function requestHandoff(botId, conversationId, orgId, userId) {
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, bot: { orgId } } });
  if (!conv) throw new ApiError(404, 'Conversation not found');

  const existing = await prisma.agentSession.findFirst({
    where: { conversationId, status: { in: ['queued', 'active'] } },
  });
  if (existing) return existing;

  const session = await prisma.agentSession.create({
    data: {
      id: uid9(),
      botId,
      conversationId,
      status: 'queued',
      createdAt: new Date(),
    },
  });
  await logActivity({
    orgId, actorId: userId, actorName: 'handoff',
    eventType: 'handoff.requested', data: { conversationId }, botId,
  });
  return session;
}

export async function queue(orgId) {
  const sessions = await prisma.agentSession.findMany({
    where: { status: { in: ['queued', 'active'] }, bot: { orgId } },
    include: { bot: { select: { id: true, name: true } }, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return sessions.map((s) => ({
    id: s.id,
    botId: s.botId,
    botName: s.bot.name,
    conversationId: s.conversationId,
    status: s.status,
    agentName: s.user?.name ?? s.user?.email ?? null,
    createdAt: s.createdAt.getTime(),
  }));
}

export async function pickup(sessionId, agentUserId, orgId) {
  const session = await prisma.agentSession.findFirst({ where: { id: sessionId, bot: { orgId } } });
  if (!session) throw new ApiError(404, 'Session not found');
  return prisma.agentSession.update({
    where: { id: sessionId },
    data: { status: 'active', agentUserId },
  });
}

export async function reply(sessionId, content, orgId) {
  const session = await prisma.agentSession.findFirst({ where: { id: sessionId, bot: { orgId } } });
  if (!session) throw new ApiError(404, 'Session not found');
  await prisma.message.create({
    data: {
      id: uid9(),
      conversationId: session.conversationId,
      role: 'assistant',
      content,
      provider: 'agent',
      createdAt: new Date(),
    },
  });
  await prisma.conversation.update({ where: { id: session.conversationId }, data: { updatedAt: new Date() } });
  return { success: true };
}

export async function close(sessionId, orgId) {
  const session = await prisma.agentSession.findFirst({ where: { id: sessionId, bot: { orgId } } });
  if (!session) throw new ApiError(404, 'Session not found');
  return prisma.agentSession.update({
    where: { id: sessionId },
    data: { status: 'closed', closedAt: new Date() },
  });
}

export async function suggest(sessionId, orgId) {
  const session = await prisma.agentSession.findFirst({ where: { id: sessionId, bot: { orgId } } });
  if (!session) throw new ApiError(404, 'Session not found');
  const messages = await prisma.message.findMany({
    where: { conversationId: session.conversationId },
    orderBy: { createdAt: 'asc' },
    take: 12,
  });
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return {
    suggestion: lastUser
      ? `Thanks for reaching out! I can see you're asking about "${lastUser.content.slice(0, 100)}". Let me check that for you right away.`
      : 'Thanks for reaching out! How can I help you today?',
  };
}

export const CANNED_RESPONSES = [
  { id: 'greet', label: 'Greeting', text: 'Thanks for contacting us — a human will be right with you.' },
  { id: 'hold', label: 'Please hold', text: 'Let me look into that for you — one moment please.' },
  { id: 'close', label: 'Closing', text: 'Glad we could help! Is there anything else I can assist with?' },
  { id: 'escalate', label: 'Escalation', text: 'I understand your concern. Let me escalate this to our senior team.' },
];

export async function addNote(sessionId, note, orgId) {
  const session = await prisma.agentSession.findFirst({ where: { id: sessionId, bot: { orgId } } });
  if (!session) throw new ApiError(404, 'Session not found');
  const notes = Array.isArray(session.notes) ? session.notes : [];
  notes.push({ text: note, at: new Date().toISOString() });
  await prisma.agentSession.update({ where: { id: sessionId }, data: { notes } });
  return { success: true };
}

export async function getSession(sessionId, orgId) {
  const session = await prisma.agentSession.findFirst({
    where: { id: sessionId, bot: { orgId } },
    include: {
      bot: { select: { id: true, name: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!session) throw new ApiError(404, 'Session not found');
  const messages = await prisma.message.findMany({
    where: { conversationId: session.conversationId },
    orderBy: { createdAt: 'asc' },
  });
  return {
    ...session,
    createdAt: session.createdAt.getTime(),
    closedAt: session.closedAt?.getTime() ?? null,
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, provider: m.provider, createdAt: m.createdAt.getTime() })),
  };
}
