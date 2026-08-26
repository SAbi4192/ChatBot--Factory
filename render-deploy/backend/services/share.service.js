/**
 * Public share lookups — read-only conversation views for /share/:id.
 * No authentication: only conversations explicitly shared are readable.
 */
import { prisma } from '../prisma.js';

export async function getSharedConversation(convId) {
  const conv = await prisma.conversation.findUnique({
    where: { id: convId },
    include: {
      bot: { select: { id: true, name: true, avatar: true, designDna: true, domain: true, subdomain: true } },
      messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, provider: true, sources: true, createdAt: true } },
    },
  });
  if (!conv) return null;
  return {
    id: conv.id,
    title: conv.title,
    bot: conv.bot,
    messages: conv.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      provider: m.provider,
      sources: m.sources,
      createdAt: m.createdAt.getTime(),
    })),
  };
}
