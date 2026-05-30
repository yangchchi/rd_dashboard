'use client';

import { useEffect, useState } from 'react';

import { forceRedirectToLogin, getAuthToken, onStoredUserUpdated } from '@/lib/auth';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ensureAuth = () => {
      if (!getAuthToken()) {
        setReady(false);
        forceRedirectToLogin();
        return;
      }
      setReady(true);
    };

    ensureAuth();
    return onStoredUserUpdated(ensureAuth);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        加载中…
      </div>
    );
  }

  return <>{children}</>;
}
