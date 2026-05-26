const GIT_PAT_STORAGE_KEY = '__rd_git_pat_credentials';

export interface IStoredGitPatCredentials {
  username: string;
  pat: string;
}

/** @deprecated 仅用于迁移历史 localStorage 凭据 */
export function getStoredGitPatCredentials(): IStoredGitPatCredentials | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GIT_PAT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IStoredGitPatCredentials>;
    const username = typeof parsed.username === 'string' ? parsed.username.trim() : '';
    const pat = typeof parsed.pat === 'string' ? parsed.pat.trim() : '';
    if (!username && !pat) return null;
    return { username, pat };
  } catch {
    return null;
  }
}

export function clearStoredGitPatCredentials(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(GIT_PAT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function fetchRemoteGitPatCredentials(): Promise<IStoredGitPatCredentials | null> {
  const { authApi } = await import('./auth-api');
  const remote = await authApi.getMyGitCredentials();
  if (!remote?.username?.trim() && !remote?.pat?.trim()) return null;
  return {
    username: remote.username?.trim() ?? '',
    pat: remote.pat?.trim() ?? '',
  };
}

export async function persistRemoteGitPatCredentials(
  credentials: IStoredGitPatCredentials
): Promise<void> {
  const { authApi } = await import('./auth-api');
  await authApi.saveMyGitCredentials({
    username: credentials.username.trim(),
    pat: credentials.pat.trim(),
  });
  clearStoredGitPatCredentials();
}

export async function removeRemoteGitPatCredentials(): Promise<void> {
  const { authApi } = await import('./auth-api');
  await authApi.deleteMyGitCredentials();
  clearStoredGitPatCredentials();
}

export async function loadGitPatWithMigration(): Promise<IStoredGitPatCredentials> {
  const remote = await fetchRemoteGitPatCredentials();
  if (remote) return remote;

  const legacy = getStoredGitPatCredentials();
  if (legacy && (legacy.username || legacy.pat)) {
    try {
      await persistRemoteGitPatCredentials(legacy);
      return legacy;
    } catch {
      return legacy;
    }
  }

  return { username: '', pat: '' };
}

/** @deprecated 请改用 loadGitPatWithMigration */
export function defaultGitPatFormFields(): Pick<IStoredGitPatCredentials, 'username' | 'pat'> {
  const stored = getStoredGitPatCredentials();
  return {
    username: stored?.username ?? '',
    pat: stored?.pat ?? '',
  };
}
