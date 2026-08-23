import type { Bot, Conversation, Message } from '../types';

export interface ProviderStatus {
  ok?: boolean;
  mode: string;
  local: boolean;
  groq: boolean;
  gemini: boolean;
  localUrl?: string;
}

export const db = {
  async getBots(): Promise<Bot[]> {
    const res = await fetch('/api/bots');
    if (!res.ok) throw new Error('Failed to load bots');
    return res.json();
  },

  async getBot(id: string): Promise<Bot | undefined> {
    try {
      const res = await fetch(`/api/bots/${id}`);
      if (res.ok) return await res.json();
      if (res.status !== 404) throw new Error('Failed to load bot');
      // 404 falls through to the list-based fallback below.
    } catch {
      // Network/other error also falls through to the fallback.
    }
    // Safety net: an older/stale backend may not serve GET /api/bots/:id.
    // The list endpoint powers the Library, so find the bot there instead —
    // this keeps Library → Chat navigation working regardless of backend age.
    try {
      const all = await db.getBots();
      return all.find(b => b.id === id);
    } catch {
      return undefined;
    }
  },

  /**
   * Generate bots in batches. The backend caps each request at 50 bots to
   * protect the LLM pipeline, so larger orders are looped here in batches of
   * 50 with an optional progress callback (used by the production-run UI).
   * Returns the total count produced plus a sample bot from the first batch.
   */
  async addBots(
    count: number,
    onBatch?: (producedSoFar: number, total: number) => void
  ): Promise<{ count: number; sample: Bot }> {
    const BATCH_SIZE = 50;
    let produced = 0;
    let sample: Bot | null = null;

    while (produced < count) {
      const n = Math.min(BATCH_SIZE, count - produced);
      const res = await fetch('/api/bots/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: n })
      });
      if (!res.ok) throw new Error('Failed to generate bots');
      const data = await res.json();
      if (!sample && data.sample) sample = data.sample;
      produced += data.count ?? n;
      onBatch?.(produced, count);
    }

    return { count: produced, sample: sample as Bot };
  },

  async deleteAllBots(): Promise<void> {
    await fetch('/api/bots', { method: 'DELETE' });
  },

  async deleteBot(botId: string): Promise<void> {
    const res = await fetch(`/api/bots/${botId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete bot');
  },

  async toggleFavorite(botId: string): Promise<boolean> {
    const res = await fetch(`/api/bots/${botId}/favorite`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to toggle favorite');
    const data = await res.json();
    return !!data.favorite;
  },

  async getConversationsByBot(botId: string): Promise<Conversation[]> {
    const res = await fetch(`/api/bots/${botId}/conversations`);
    if (!res.ok) throw new Error('Failed to load conversations');
    return res.json();
  },

  async createConversation(botId: string, title: string = 'New Conversation'): Promise<Conversation> {
    const conv = {
      id: Math.random().toString(36).substring(2, 11),
      botId,
      title,
      createdAt: Date.now()
    };
    await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conv)
    });
    return conv as unknown as Conversation;
  },

  async renameConversation(convId: string, title: string): Promise<void> {
    await fetch(`/api/conversations/${convId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
  },

  async deleteConversation(convId: string): Promise<void> {
    await fetch(`/api/conversations/${convId}`, { method: 'DELETE' });
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    const res = await fetch(`/api/conversations/${conversationId}/messages`);
    if (!res.ok) throw new Error('Failed to load messages');
    return res.json();
  },

  async sendMessage(
    botId: string,
    conversationId: string,
    message: string
  ): Promise<{ response: string; messageId: string; provider?: string; sources?: string[] | null }> {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, conversationId, message })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Chat request failed');
    }
    return res.json();
  },

  async regenerate(
    botId: string,
    conversationId: string
  ): Promise<{ response: string; messageId: string; provider?: string; sources?: string[] | null }> {
    const res = await fetch('/api/chat/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, conversationId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Regenerate request failed');
    }
    return res.json();
  },

  async getHealth(): Promise<ProviderStatus> {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  }
};
