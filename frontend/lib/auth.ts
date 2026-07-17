import type { AuthUser, AuthResponse } from '@/lib/types';

const TOKEN_KEY = 'fplit_token';
const USER_KEY = 'fplit_user';

function getStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function getToken(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  return storage.getItem(TOKEN_KEY);
}

export function setSession(resp: AuthResponse): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(TOKEN_KEY, resp.token);
  storage.setItem(USER_KEY, JSON.stringify(resp.user));
}

export function getUser(): AuthUser | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(TOKEN_KEY);
  storage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
