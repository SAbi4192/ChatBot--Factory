/**
 * Moderation routes — flagged messages dashboard, approve/block.
 */
import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();

// List flagged messages (toxic, injection, or PII detected).
router.get('/flagged', async (req, res, next) => {
  try {
    const msgs = await prisma.message.findMany({
      where: { role: 'user', conversation: { bot: { orgId: req.org.id } } },
      include: {
        conversation: { select: { title: true, bot: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const flagged = msgs
      .filter((m) => {
        const nlu = m.nlu ?? {};
        return nlu.toxicity?.toxic === true || nlu.injection?.injected === true || (nlu.pii?.length ?? 0) > 0;
      })
      .slice(0, 50)
      .map((m) => ({
        id: m.id,
        content: m.content,
        nlu: m.nlu,
        createdAt: m.createdAt.getTime(),
        conversationId: m.conversationId,
        conversationTitle: m.conversation.title,
        botName: m.conversation.bot.name,
        botId: m.conversation.bot.id,
      }));
    res.json(flagged);
  } catch (e) { next(e); }
});

// Approve a flagged message (mark as nlu.approved = true).
router.post('/:msgId/approve', async (req, res, next) => {
  try {
    const msg = await prisma.message.findUnique({ where: { id: req.params.msgId } });
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    const nlu = { ...(msg.nlu ?? {}), approved: true };
    await prisma.message.update({ where: { id: req.params.msgId }, data: { nlu } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Block a flagged message (delete it + log).
router.post('/:msgId/block', async (req, res, next) => {
  try {
    const msg = await prisma.message.findUnique({ where: { id: req.params.msgId } });
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    await prisma.message.delete({ where: { id: req.params.msgId } });
    await prisma.analyticsEvent.create({
      data: {
        id: Math.random().toString(36).substring(2, 11),
        botId: req.org.id,
        orgId: req.org.id,
        eventType: 'moderation.blocked',
        data: { messageId: msg.id, content: msg.content.slice(0, 200) },
      },
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;