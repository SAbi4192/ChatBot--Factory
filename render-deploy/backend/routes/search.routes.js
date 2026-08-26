/**
 * Global conversation search — full-text across messages and conversation
 * titles, scoped to the caller's org.
 */
import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 120);
    if (!q) return res.json({ conversations: [], messages: [] });

    const like = { contains: q };

    const [convs, msgs] = await Promise.all([
      prisma.conversation.findMany({
        where: { bot: { orgId: req.org.id }, title: like },
        include: { bot: { select: { id: true, name: true, avatar: true, designDna: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 15,
      }),
      prisma.message.findMany({
        where: { content: like, conversation: { bot: { orgId: req.org.id } } },
        include: {
          conversation: {
            select: {
              id: true,
              title: true,
              bot: { select: { id: true, name: true, avatar: true, designDna: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    res.json({
      conversations: convs.map((c) => ({
        id: c.id,
        title: c.title,
        bot: c.bot,
        updatedAt: c.updatedAt.getTime(),
      })),
      messages: msgs.map((m) => ({
        id: m.id,
        content: m.content,
        role: m.role,
        provider: m.provider,
        conversationId: m.conversationId,
        conversationTitle: m.conversation.title,
        bot: m.conversation.bot,
        createdAt: m.createdAt.getTime(),
      })),
    });
  } catch (e) { next(e); }
});

export default router;