import type { AccountType, UserProfileData } from '@/lib/toolkit-types';

export async function fetchUserProfile(
  userId: string,
  _accountType: AccountType = 'apaas',
  _signal?: AbortSignal
): Promise<UserProfileData> {
  return {
    user_id: userId,
    name: [{ language_code: 2052, text: '本地用户' }],
  };
}

export function getAssetsUrl(path: string): string {
  return path;
}

export type { AccountType, UserProfileData };
