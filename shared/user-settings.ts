export type ThemePreference = 'light' | 'dark' | 'system';

export interface IUserGitCredentials {
  username: string;
  pat: string;
  updatedAt?: string;
}

export interface IUserProfileInput {
  name?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  themePreference?: ThemePreference;
}

export interface IUserProfile extends IUserProfileInput {
  id: string;
  username: string;
  accessRoleIds?: string[];
  accessRoleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function parseThemePreference(value: unknown): ThemePreference | undefined {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return undefined;
}
