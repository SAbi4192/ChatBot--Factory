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
};
