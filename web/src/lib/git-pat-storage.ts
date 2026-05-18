const GIT_PAT_STORAGE_KEY = '__rd_git_pat_credentials';

export interface IStoredGitPatCredentials {
  username: string;
  pat: string;
}

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

export function saveStoredGitPatCredentials(credentials: IStoredGitPatCredentials): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      GIT_PAT_STORAGE_KEY,
      JSON.stringify({
        username: credentials.username.trim(),
        pat: credentials.pat.trim(),
      }),
    );
  } catch {
    // ignore quota / private mode
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

export function defaultGitPatFormFields(): Pick<IStoredGitPatCredentials, 'username' | 'pat'> {
  const stored = getStoredGitPatCredentials();
  return {
    username: stored?.username ?? '',
    pat: stored?.pat ?? '',
  };
}
