import type { Bot, Conversation, Message } from '../types';
import * as tokens from '../auth/tokens';

export interface ProviderStatus {
  ok?: boolean;
  mode: string;
  local: boolean;
  groq: boolean;
  gemini: boolean;
  localUrl?: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  ownerId: string;
  createdAt: number;
  limits: { maxBots: number; maxMessagesPerDay: number; maxMembers: number };
  usage: { bots: number; messagesToday: number; members: number };
}

/**
 * Authenticated fetch: attaches the Bearer token + current org, and on a 401
 * transparently refreshes the session once and retries the request.
 */
async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const doFetch = (token: string | null, orgId: string | null) =>
    fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(orgId ? { 'x-org-id': orgId } : {}),
      },
    });

  let res = await doFetch(tokens.getAccessToken(), tokens.getOrgId());

  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    const refreshToken = tokens.getRefreshToken();
    if (refreshToken) {
      try {
        const r = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (r.ok) {
          const payload = await r.json();
          tokens.saveTokens(payload.accessToken, payload.refreshToken, payload.remember ?? true);
          if (payload.currentOrgId) tokens.saveOrgId(payload.currentOrgId);
          res = await doFetch(payload.accessToken, payload.currentOrgId ?? tokens.getOrgId());
        } else {
          tokens.clearTokens();
        }
      } catch {
        tokens.clearTokens();
      }
    }
  }
  return res;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err as { error?: string }).error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return res.json();
}

export const db = {
  async getBots(): Promise<Bot[]> {
    return json('/api/bots');
  },

  async getBot(id: string): Promise<Bot | undefined> {
    try {
      return await json(`/api/bots/${id}`);
    } catch {
      try {
        const all = await db.getBots();
        return all.find(b => b.id === id);
      } catch {
        return undefined;
      }
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
      const data = await json<{ count: number; sample?: Bot }>('/api/bots/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: n })
      });
      if (!sample && data.sample) sample = data.sample;
      produced += data.count ?? n;
      onBatch?.(produced, count);
    }

    return { count: produced, sample: sample as Bot };
  },

  async deleteAllBots(): Promise<void> {
    await json('/api/bots', { method: 'DELETE' });
  },

  async deleteBot(botId: string): Promise<void> {
    await json(`/api/bots/${botId}`, { method: 'DELETE' });
  },

  async toggleFavorite(botId: string): Promise<boolean> {
    const data = await json<{ favorite: boolean }>(`/api/bots/${botId}/favorite`, { method: 'POST' });
    return !!data.favorite;
  },

  async getConversationsByBot(botId: string): Promise<Conversation[]> {
    return json(`/api/bots/${botId}/conversations`);
  },

  async createConversation(botId: string, title: string = 'New Conversation'): Promise<Conversation> {
    const conv = {
      id: Math.random().toString(36).substring(2, 11),
      botId,
      title,
      createdAt: Date.now()
    };
    await json('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conv)
    });
    return conv as unknown as Conversation;
  },

  async renameConversation(convId: string, title: string): Promise<void> {
    await json(`/api/conversations/${convId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
  },

  async deleteConversation(convId: string): Promise<void> {
    await json(`/api/conversations/${convId}`, { method: 'DELETE' });
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    return json(`/api/conversations/${conversationId}/messages`);
  },

  async sendMessage(
    botId: string,
    conversationId: string,
    message: string
  ): Promise<{ response: string; messageId: string; provider?: string; sources?: string[] | null }> {
    return json('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, conversationId, message })
    });
  },

  async regenerate(
    botId: string,
    conversationId: string
  ): Promise<{ response: string; messageId: string; provider?: string; sources?: string[] | null }> {
    return json('/api/chat/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, conversationId })
    });
  },

  async getHealth(): Promise<ProviderStatus> {
    return json('/api/health');
  },

  // ---- Organizations (Checkpoint 2) ----
  async getOrg(orgId: string): Promise<OrgSummary> {
    return json(`/api/orgs/${orgId}`);
  },

  async getOrgMembers(orgId: string): Promise<Array<{ userId: string; email: string; name: string | null; role: string }>> {
    return json(`/api/orgs/${orgId}/members`);
  },

  async createInvite(orgId: string, role = 'viewer'): Promise<{ code: string; role: string; expiresAt: number }> {
    return json(`/api/orgs/${orgId}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
  },

  async joinOrg(code: string): Promise<{ orgId: string; orgName: string; role: string }> {
    return json('/api/orgs/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
  },

  async getOrgActivity(orgId: string): Promise<Array<{ id: string; eventType: string; data: unknown; createdAt: number }>> {
    return json(`/api/orgs/${orgId}/activity`);
  },

  async createOrg(name: string): Promise<OrgSummary> {
    return json('/api/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
  },

  async updateOrg(orgId: string, name: string): Promise<OrgSummary> {
    return json(`/api/orgs/${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
  },

  async deleteOrg(orgId: string): Promise<void> {
    await json(`/api/orgs/${orgId}`, { method: 'DELETE' });
  },

  async setMemberRole(orgId: string, userId: string, role: string): Promise<void> {
    await json(`/api/orgs/${orgId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
  },

  async removeMember(orgId: string, userId: string): Promise<void> {
    await json(`/api/orgs/${orgId}/members/${userId}`, { method: 'DELETE' });
  },

  // ---- Account (Checkpoint 2) ----
  async updateProfile(name: string, avatar?: string): Promise<{ name: string | null; avatar: string | null }> {
    return json('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatar })
    });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await json('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
  },

  // ---- Custom bot creator (Checkpoint 3) ----
  async designCustomBot(description: string): Promise<{ design: Record<string, unknown>; designDna: Record<string, unknown> }> {
    return json('/api/bots/custom/design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
  },

  async regenerateCustomSection(
    description: string,
    section: 'name' | 'theme' | 'avatar',
    current: Record<string, unknown>
  ): Promise<{ design: Record<string, unknown>; designDna: Record<string, unknown> }> {
    return json('/api/bots/custom/design/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, section, current })
    });
  },

  async createCustomBot(description: string): Promise<Bot> {
    return json('/api/bots/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
  },

  // ---- Conversation intelligence (Checkpoint 4) ----
  async streamChat(
    botId: string,
    conversationId: string,
    message: string,
    onToken: (token: string) => void
  ): Promise<{ messageId: string; provider: string; sources?: string[] | null; streamed: boolean }> {
    const res = await authFetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, conversationId, message }),
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Stream request failed');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let meta: { messageId: string; provider: string; sources?: string[] | null; streamed: boolean } | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.token) onToken(data.token as string);
          if (data.error) throw new Error(data.error as string);
          if (data.done) meta = { messageId: data.messageId, provider: data.provider, sources: data.sources, streamed: data.streamed };
        } catch (e) {
          if ((e as Error).message.startsWith('Unexpected')) continue; // partial JSON
          throw e;
        }
      }
    }
    if (!meta) throw new Error('Stream ended without a final event');
    return meta;
  },

  async forkConversation(
    convId: string,
    messageId: string,
    newText: string
  ): Promise<{ conversationId: string; botId: string; response: { response: string; messageId: string; provider?: string; sources?: string[] | null } }> {
    return json(`/api/conversations/${convId}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, newText })
    });
  },

  async summarizeConversation(convId: string): Promise<{ summary: string }> {
    return json(`/api/conversations/${convId}/summarize`, { method: 'POST' });
  },

  async togglePin(convId: string, msgId: string): Promise<{ pinned: boolean }> {
    return json(`/api/conversations/${convId}/messages/${msgId}/pin`, { method: 'PATCH' });
  },

  async reactToMessage(convId: string, msgId: string, value: -1 | 0 | 1): Promise<{ rating: number }> {
    return json(`/api/conversations/${convId}/messages/${msgId}/reaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
  },

  async search(q: string): Promise<{
    conversations: Array<{ id: string; title: string | null; bot: Bot; updatedAt: number }>;
    messages: Array<{ id: string; content: string; role: string; provider?: string; conversationId: string; conversationTitle: string | null; bot: Bot; createdAt: number }>;
  }> {
    return json(`/api/search?q=${encodeURIComponent(q)}`);
  },

  async getSharedConversation(convId: string): Promise<{
    id: string;
    title: string | null;
    bot: Bot;
    messages: Array<{ id: string; role: string; content: string; provider?: string; sources?: string[] | null; createdAt: number }>;
  } | null> {
    return json(`/api/share/${convId}`);
  },

  // ---- RAG knowledge base (Checkpoint 5) ----
  async uploadDocument(botId: string, file: File, onProgress?: (pct: number) => void): Promise<{ id: string; name: string; status: string; chunkCount: number }> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/bots/${botId}/kb/documents`);
      const token = tokens.getAccessToken();
      const orgId = tokens.getOrgId();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      if (orgId) xhr.setRequestHeader('x-org-id', orgId);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 400) reject(new Error(data.error || 'Upload failed'));
          else resolve(data);
        } catch { reject(new Error('Upload failed')); }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(form);
    });
  },

  async crawlUrl(botId: string, url: string): Promise<{ id: string; name: string; status: string; chunkCount: number }> {
    return json(`/api/bots/${botId}/kb/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
  },

  async listDocuments(botId: string): Promise<Array<{ id: string; name: string; status: string; chunkCount: number; createdAt: number }>> {
    return json(`/api/bots/${botId}/kb/documents`);
  },

  async deleteDocument(botId: string, docId: string): Promise<void> {
    await json(`/api/bots/${botId}/kb/documents/${docId}`, { method: 'DELETE' });
  },

  async kbStats(botId: string): Promise<{ documents: number; chunks: number; chars: number }> {
    return json(`/api/bots/${botId}/kb/stats`);
  },

  async recallMemory(botId: string, q: string): Promise<Array<{ conversationId: string; role: string; content: string; score: number }>> {
    return json(`/api/bots/${botId}/memory?q=${encodeURIComponent(q)}`);
  },

  // ---- Analytics (Checkpoint 6) ----
  async getAnalyticsOverview(): Promise<AnalyticsOverview> {
    return json('/api/analytics/overview');
  },

  async getBotAnalytics(botId: string): Promise<BotAnalytics | null> {
    return json(`/api/analytics/bots/${botId}`);
  },

  async getRealtime(): Promise<{ activeConvs: number; msgsMin: number; errsMin: number; at: number }> {
    return json('/api/analytics/realtime');
  },
};

export interface AnalyticsOverview {
  overview: { bots: number; conversations: number; messages: number; messagesToday: number; avgResponseMs: number | null; csat: number | null };
  series: {
    conversations: Array<{ day: string; count: number }>;
    csat: Array<{ day: string; csat: number | null }>;
    tokens: Array<{ day: string; local: number; cloud: number; web: number; guard: number }>;
  };
  charts: {
    providerDist: Array<{ name: string; value: number }>;
    topBots: Array<{ name: string; value: number }>;
    domainDist: Array<{ name: string; value: number }>;
    respHist: Array<{ label: string; value: number }>;
    heatmap: Array<{ hour: number; Mon: number; Tue: number; Wed: number; Thu: number; Fri: number; Sat: number; Sun: number }>;
    convLenHist: Array<{ label: string; value: number }>;
  };
  unresolved: Array<{ content: string; createdAt: number }>;
}

export interface BotAnalytics {
  bot: { id: string; name: string; domain: string };
  convCount: number;
  msgCount: number;
  csat: number | null;
  mostAsked: Array<{ question: string; count: number }>;
  providerDist: Array<{ name: string; value: number }>;
  guardRate: number;
  dropOff: number;
}
