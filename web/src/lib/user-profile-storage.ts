import type { IUserProfileInput, ThemePreference } from '@shared/user-settings';

import { authApi } from '@/lib/auth-api';
import { getCurrentUser, updateStoredCurrentUser } from '@/lib/auth';

const LEGACY_THEME_KEY = 'rd-ui-theme';

function readLegacyThemePreference(): ThemePreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LEGACY_THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // ignore
  }
  return null;
}

/** 从服务端读取个人资料，并同步到当前登录会话缓存 */
export async function fetchRemoteUserProfile() {
  return authApi.getMyProfile();
}

export async function persistRemoteUserProfile(input: IUserProfileInput) {
  const updated = await authApi.updateMyProfile(input);
  updateStoredCurrentUser({
    name: updated.name,
    email: updated.email,
    phone: updated.phone,
    avatarUrl: updated.avatarUrl,
    themePreference: updated.themePreference,
  });
  return updated;
}

/**
 * 优先读服务端；若无主题偏好则尝试迁移 next-themes 本地键。
 */
export async function loadUserProfileWithMigration() {
  const remote = await fetchRemoteUserProfile();
  const current = getCurrentUser();

  if (remote) {
    updateStoredCurrentUser({
      name: remote.name,
      email: remote.email,
      phone: remote.phone,
      avatarUrl: remote.avatarUrl,
      themePreference: remote.themePreference,
    });
    return remote;
  }

  const legacyTheme = readLegacyThemePreference();
  if (current && (current.name || current.email || current.phone || current.avatarUrl || legacyTheme)) {
    try {
      return await persistRemoteUserProfile({
        name: current.name,
        email: current.email,
        phone: current.phone,
        avatarUrl: current.avatarUrl,
        themePreference: legacyTheme ?? current.themePreference,
      });
    } catch {
      return {
        id: current.id,
        username: current.username,
        name: current.name,
        email: current.email,
        phone: current.phone,
        avatarUrl: current.avatarUrl,
        themePreference: legacyTheme ?? current.themePreference,
        accessRoleIds: current.accessRoleIds ?? [],
        accessRoleId: current.accessRoleId,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
      };
    }
  }

  return remote;
}

export async function persistUserThemePreference(theme: ThemePreference): Promise<void> {
  await persistRemoteUserProfile({ themePreference: theme });
}

export function applyThemePreference(
  setTheme: (theme: ThemePreference) => void,
  theme: ThemePreference
): void {
  setTheme(theme);
  if (typeof window !== 'undefined' && getAuthToken()) {
    void persistUserThemePreference(theme).catch(() => {
      // ignore background save errors; UI already switched locally
    });
  }
}

export async function loadUserThemePreference(): Promise<ThemePreference | null> {
  const profile = await loadUserProfileWithMigration();
  return profile?.themePreference ?? readLegacyThemePreference();
}
