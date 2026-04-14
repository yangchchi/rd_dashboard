'use client';

import { useEffect, useState } from 'react';

import { getCurrentUser, onStoredUserUpdated } from '@/lib/auth';
import type { IUser } from '@/lib/rd-types';

export type UserProfileLite = {
  user_id?: string;
  email?: string;
  name?: string;
  userName?: string;
  avatar?: string;
  userAvatar?: string;
};

function mapUser(u: IUser | null): UserProfileLite {
  if (!u) return {};
  const displayName = u.name?.trim();
  const avatar = u.avatarUrl?.trim();
  return {
    user_id: u.id,
    name: displayName || u.username,
    userName: u.username,
    email: u.email,
    ...(avatar ? { avatar, userAvatar: avatar } : {}),
  };
}

export function useCurrentUserProfile(): UserProfileLite {
  const [profile, setProfile] = useState<UserProfileLite>(() => mapUser(getCurrentUser()));

  useEffect(() => {
    const sync = () => setProfile(mapUser(getCurrentUser()));
    window.addEventListener('storage', sync);
    const offLocal = onStoredUserUpdated(sync);
    const id = window.setInterval(sync, 1000);
    return () => {
      window.removeEventListener('storage', sync);
      offLocal();
      window.clearInterval(id);
    };
  }, []);

  return profile;
}
