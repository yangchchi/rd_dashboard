import type { IUser } from './rd-types';
import { clearAiSkillCache } from './ai-skills';

const TOKEN_KEY = '__rd_auth_token';
const USER_KEY = '__rd_auth_user';
const USER_UPDATED_EVENT = 'rd-auth-user-updated';

function emitStoredUserUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent(USER_UPDATED_EVENT));
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser(): IUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IUser;
  } catch {
    return null;
  }
}

export function saveAuthSession(token: string, user: IUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  clearAiSkillCache();
  emitStoredUserUpdated();
}

export function clearAuthSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  clearAiSkillCache();
  emitStoredUserUpdated();
}

export function updateStoredCurrentUser(
  updates: Partial<Pick<IUser, 'name' | 'email' | 'phone' | 'avatarUrl' | 'accessRoleId'>>
): IUser | null {
  if (typeof window === 'undefined') return null;
  const current = getCurrentUser();
  if (!current) return null;
  const next: IUser = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  emitStoredUserUpdated();
  return next;
}

export function onStoredUserUpdated(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(USER_UPDATED_EVENT, listener);
  return () => window.removeEventListener(USER_UPDATED_EVENT, listener);
}
