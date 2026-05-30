import type { IUser } from './rd-types';
import { clearAiSkillCache } from './ai-skills';

const TOKEN_KEY = '__rd_auth_token';
const USER_KEY = '__rd_auth_user';
const USER_UPDATED_EVENT = 'rd-auth-user-updated';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const LOGIN_PATH = '/login';

export class AuthSessionExpiredError extends Error {
  readonly isAuthSessionExpired = true as const;

  constructor(message = '登录已过期，请重新登录') {
    super(message);
    this.name = 'AuthSessionExpiredError';
  }
}

export function isAuthSessionExpiredError(error: unknown): boolean {
  if (error instanceof AuthSessionExpiredError) return true;
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('未登录') ||
    msg.includes('登录已过期')
  );
}

function isOnLoginRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`);
}

/** 清除会话并强制跳转登录页（未登录、登录过期、主动退出时调用） */
export function forceRedirectToLogin(): void {
  if (typeof window === 'undefined') return;
  clearAuthSession();
  if (isOnLoginRoute()) return;
  window.location.replace(LOGIN_PATH);
}

/** API 返回 401 时：清会话、跳转登录，并抛出可识别的错误 */
export function rejectIfUnauthorized(status: number, bodyText = ''): void {
  if (status !== 401) return;
  forceRedirectToLogin();
  throw new AuthSessionExpiredError(
    parseUnauthorizedMessage(bodyText) || '登录已过期，请重新登录'
  );
}

function parseUnauthorizedMessage(bodyText: string): string | null {
  if (!bodyText.trim()) return null;
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string };
      message?: string;
    };
    return parsed.error?.message || parsed.message || null;
  } catch {
    return null;
  }
}

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
  safeStorageRemove(sessionStorage, '__global_rd_userRoles');
  safeStorageRemove(sessionStorage, '__global_rd_userRole');
  clearCookieValue(TOKEN_KEY);
  clearCookieValue(USER_KEY);
  clearAiSkillCache();
  emitStoredUserUpdated();
}

export function updateStoredCurrentUser(
  updates: Partial<
    Pick<IUser, 'name' | 'email' | 'phone' | 'avatarUrl' | 'themePreference' | 'accessRoleId' | 'accessRoleIds'>
  >
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
