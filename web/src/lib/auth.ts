import type { IUser } from './rd-types';
import { clearAiSkillCache } from './ai-skills';

const TOKEN_KEY = '__rd_auth_token';
const USER_KEY = '__rd_auth_user';
const USER_UPDATED_EVENT = 'rd-auth-user-updated';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function emitStoredUserUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent(USER_UPDATED_EVENT));
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const localToken = safeStorageGet(localStorage, TOKEN_KEY);
  if (localToken) return localToken;
  const sessionToken = safeStorageGet(sessionStorage, TOKEN_KEY);
  if (sessionToken) {
    safeStorageSet(localStorage, TOKEN_KEY, sessionToken);
    return sessionToken;
  }
  const cookieToken = getCookieValue(TOKEN_KEY);
  if (cookieToken) {
    safeStorageSet(localStorage, TOKEN_KEY, cookieToken);
    safeStorageSet(sessionStorage, TOKEN_KEY, cookieToken);
    return cookieToken;
  }
  return null;
}

export function getCurrentUser(): IUser | null {
  if (typeof window === 'undefined') return null;
  const raw =
    safeStorageGet(localStorage, USER_KEY) ||
    safeStorageGet(sessionStorage, USER_KEY) ||
    getCookieValue(USER_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as IUser;
    safeStorageSet(localStorage, USER_KEY, JSON.stringify(user));
    safeStorageSet(sessionStorage, USER_KEY, JSON.stringify(user));
    return user;
  } catch {
    return null;
  }
}

export function saveAuthSession(token: string, user: IUser): void {
  const userJson = JSON.stringify(user);
  safeStorageSet(localStorage, TOKEN_KEY, token);
  safeStorageSet(localStorage, USER_KEY, userJson);
  safeStorageSet(sessionStorage, TOKEN_KEY, token);
  safeStorageSet(sessionStorage, USER_KEY, userJson);
  setCookieValue(TOKEN_KEY, token);
  setCookieValue(USER_KEY, userJson);
  clearAiSkillCache();
  if (typeof window !== 'undefined') {
    try {
      if (user.accessRoleIds?.length) {
        sessionStorage.setItem('__global_rd_userRoles', JSON.stringify(user.accessRoleIds));
      } else {
        sessionStorage.removeItem('__global_rd_userRoles');
      }
      if (user.accessRoleId) {
        sessionStorage.setItem('__global_rd_userRole', user.accessRoleId);
      }
    } catch {
      // ignore storage quota / private mode
    }
  }
  emitStoredUserUpdated();
}

export function clearAuthSession(): void {
  safeStorageRemove(localStorage, TOKEN_KEY);
  safeStorageRemove(localStorage, USER_KEY);
  safeStorageRemove(sessionStorage, TOKEN_KEY);
  safeStorageRemove(sessionStorage, USER_KEY);
  clearCookieValue(TOKEN_KEY);
  clearCookieValue(USER_KEY);
  clearAiSkillCache();
  emitStoredUserUpdated();
}

export function updateStoredCurrentUser(
  updates: Partial<Pick<IUser, 'name' | 'email' | 'phone' | 'avatarUrl' | 'accessRoleId' | 'accessRoleIds'>>
): IUser | null {
  if (typeof window === 'undefined') return null;
  const current = getCurrentUser();
  if (!current) return null;
  const next: IUser = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  const userJson = JSON.stringify(next);
  safeStorageSet(localStorage, USER_KEY, userJson);
  safeStorageSet(sessionStorage, USER_KEY, userJson);
  setCookieValue(USER_KEY, userJson);
  emitStoredUserUpdated();
  return next;
}

export function onStoredUserUpdated(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(USER_UPDATED_EVENT, listener);
  return () => window.removeEventListener(USER_UPDATED_EVENT, listener);
}

function safeStorageGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // ignore storage quota / private mode
  }
}

function safeStorageRemove(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // ignore storage quota / private mode
  }
}

function getCookieValue(key: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${encodeURIComponent(key)}=`;
  const match = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return null;
  }
}

function setCookieValue(key: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function clearCookieValue(key: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(key)}=; Path=/; Max-Age=0; SameSite=Lax`;
}
