import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as tokens from './tokens';

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: string;
  createdAt?: number;
}

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: User;
  orgs: OrgInfo[];
  currentOrgId: string | null;
  remember?: boolean;
}

interface AuthContextValue {
  initialized: boolean;
  user: User | null;
  orgs: OrgInfo[];
  currentOrg: OrgInfo | null;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchOrg: (orgId: string) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function applyPayload(payload: AuthPayload) {
  tokens.saveTokens(payload.accessToken, payload.refreshToken, payload.remember ?? true);
  if (payload.currentOrgId) tokens.saveOrgId(payload.currentOrgId);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(tokens.getOrgId());

  const currentOrg = useMemo(
    () => orgs.find((o) => o.id === currentOrgId) ?? orgs[0] ?? null,
    [orgs, currentOrgId]
  );

  /** Bootstrap the session: /auth/me, falling back to a refresh when expired. */
  const bootstrap = useCallback(async () => {
    const access = tokens.getAccessToken();
    if (!access) { setInitialized(true); return; }
    try {
      const me = await api('/api/auth/me', { headers: { Authorization: `Bearer ${access}` } });
      setUser(me);
      const orgList = await api('/api/orgs', { headers: { Authorization: `Bearer ${access}` } }) as OrgInfo[];
      setOrgs(orgList);
      const stored = tokens.getOrgId();
      if (stored && orgList.some((o) => o.id === stored)) setCurrentOrgId(stored);
      else if (orgList.length > 0) setCurrentOrgId(orgList[0].id);
    } catch {
      try {
        const refreshToken = tokens.getRefreshToken();
        if (!refreshToken) throw new Error('no refresh');
        const payload = await api('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
        applyPayload(payload);
        setUser(payload.user);
        setOrgs(payload.orgs ?? []);
        if (payload.currentOrgId) setCurrentOrgId(payload.currentOrgId);
      } catch {
        tokens.clearTokens();
        setUser(null);
        setOrgs([]);
      }
    }
    setInitialized(true);
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const payload = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, remember }),
    });
    applyPayload(payload);
    setUser(payload.user);
    setOrgs(payload.orgs ?? []);
    setCurrentOrgId(payload.currentOrgId);
  }, []);

  const register = useCallback(async (email: string, name: string, password: string) => {
    const payload = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    });
    applyPayload(payload);
    setUser(payload.user);
    setOrgs(payload.orgs ?? []);
    setCurrentOrgId(payload.currentOrgId);
    return payload;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${tokens.getAccessToken()}` } });
    } catch { /* server may be offline — local logout still happens */ }
    tokens.clearTokens();
    tokens.clearOrgId();
    setUser(null);
    setOrgs([]);
    setCurrentOrgId(null);
  }, []);

  const switchOrg = useCallback((orgId: string) => {
    tokens.saveOrgId(orgId);
    setCurrentOrgId(orgId);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await api('/api/auth/me', { headers: { Authorization: `Bearer ${tokens.getAccessToken()}` } });
    setUser(me);
  }, []);

  const value = useMemo(() => ({
    initialized, user, orgs, currentOrg,
    login, register, logout, switchOrg, refreshUser,
  }), [initialized, user, orgs, currentOrg, login, register, logout, switchOrg, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
