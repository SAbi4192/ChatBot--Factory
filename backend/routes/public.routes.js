/**
 * Public widget routes (Checkpoint 9) — no authentication.
 * Powers the embeddable <script> widget and its iframe chat.
 */
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { generateChatResponse } from '../llmService.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();
const uid9 = () => Math.random().toString(36).substring(2, 11);

function mapBot(b) {
  return {
    id: b.id,
    name: b.name,
    domain: b.domain,
    subdomain: b.subdomain,
    description: b.description,
    personality: b.personality,
    welcomeMessage: b.welcomeMessage,
    starterQuestions: b.starterQuestions ?? [],
    avatar: b.avatar,
    designDna: b.designDna,
  };
}

// Public bot info (for the widget iframe).
router.get('/bots/:botId', async (req, res, next) => {
  try {
    const bot = await prisma.bot.findUnique({ where: { id: req.params.botId } });
    if (!bot) throw new ApiError(404, 'Bot not found');
    res.json(mapBot(bot));
  } catch (e) { next(e); }
});

// Public chat (guest conversations, no auth).
router.post('/chat', async (req, res, next) => {
  try {
    const { botId, message, conversationId, prechat } = req.body ?? {};
    if (!botId || !message) throw new ApiError(400, 'botId and message are required');

    let convId = conversationId;
    if (!convId) {
      const created = await prisma.conversation.create({
        data: {
          id: `w-${uid9()}`,
          botId,
          title: prechat?.name ? `${prechat.name}'s chat` : 'Widget chat',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      convId = created.id;
    } else {
      const exists = await prisma.conversation.findFirst({ where: { id: convId, botId } });
      if (!exists) throw new ApiError(404, 'Conversation not found');
    }

    const result = await generateChatResponse(botId, convId, String(message).slice(0, 4000));
    res.json({ conversationId: convId, ...result });
  } catch (e) { next(e); }
});

// Public messages for the widget (read-back).
router.get('/conversations/:convId/messages', async (req, res, next) => {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: req.params.convId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conv) throw new ApiError(404, 'Conversation not found');
    res.json(conv.messages.map((m) => ({
      id: m.id, role: m.role, content: m.content, provider: m.provider,
      sources: m.sources, createdAt: m.createdAt.getTime(),
    })));
  } catch (e) { next(e); }
});

export default router;