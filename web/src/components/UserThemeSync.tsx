'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

import { getAuthToken } from '@/lib/auth';
import { loadUserThemePreference } from '@/lib/user-profile-storage';

/** 登录后将账号中的主题偏好应用到 next-themes */
export function UserThemeSync() {
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!getAuthToken()) return;
    void loadUserThemePreference()
      .then((theme) => {
        if (theme) setTheme(theme);
      })
      .catch(() => {
        // ignore
      });
  }, [setTheme]);

  return null;
}
