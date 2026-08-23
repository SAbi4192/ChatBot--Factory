/**
 * Token storage — the single place the API client reads credentials from.
 *
 * remember=true persists the refresh token to localStorage (survives browser
 * restart); otherwise it lives in sessionStorage. The access token always
 * lives in memory-storage pair so the client can auto-refresh.
 */
const ACCESS_KEY = 'cbf:access';
const REFRESH_KEY = 'cbf:refresh';
const ORG_KEY = 'cbf:orgId';
const REMEMBER_KEY = 'cbf:remember';

export function saveTokens(accessToken: string, refreshToken: string, remember: boolean) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  if (remember) sessionStorage.setItem(REFRESH_KEY, refreshToken);
  else sessionStorage.removeItem(REFRESH_KEY);
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_KEY) || localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY) || sessionStorage.getItem(REFRESH_KEY);
}

export function getRemember(): boolean {
  return localStorage.getItem(REMEMBER_KEY) === '1';
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

export function getOrgId(): string | null {
  return localStorage.getItem(ORG_KEY) || sessionStorage.getItem(ORG_KEY);
}

export function saveOrgId(orgId: string) {
  localStorage.setItem(ORG_KEY, orgId);
  sessionStorage.setItem(ORG_KEY, orgId);
}

export function clearOrgId() {
  localStorage.removeItem(ORG_KEY);
  sessionStorage.removeItem(ORG_KEY);
}
