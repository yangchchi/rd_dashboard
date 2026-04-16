'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/auth-api';
import { saveAuthSession } from '@/lib/auth';
import { FEISHU_OAUTH_STATE_KEY, getFeishuRedirectUri } from '@/lib/feishu-oauth';
import { toast } from 'sonner';

/** 避免 React Strict Mode 或重复渲染导致授权码被使用两次 */
let feishuCallbackInflight: Promise<void> | null = null;

function FeishuCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (feishuCallbackInflight) return;

    feishuCallbackInflight = (async () => {
      const error = searchParams.get('error');
      const state = searchParams.get('state');
      const code = searchParams.get('code');

      if (error === 'access_denied') {
        toast.error('已取消飞书授权');
        router.replace('/login');
        return;
      }

      const expected = sessionStorage.getItem(FEISHU_OAUTH_STATE_KEY);
      sessionStorage.removeItem(FEISHU_OAUTH_STATE_KEY);

      if (!state || !expected || state !== expected) {
        toast.error('飞书登录校验失败，请重试');
        router.replace('/login');
        return;
      }

      if (!code) {
        toast.error('未收到授权码');
        router.replace('/login');
        return;
      }

      const redirectUri = getFeishuRedirectUri();
      if (!redirectUri) {
        toast.error('无法解析回调地址');
        router.replace('/login');
        return;
      }

      try {
        const res = await authApi.feishuLogin(code, redirectUri);
        saveAuthSession(res.token, res.user);
        toast.success('飞书登录成功');
        router.replace('/dashboard');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '飞书登录失败');
        router.replace('/login');
      }
    })().finally(() => {
      feishuCallbackInflight = null;
    });
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-sm text-muted-foreground">
      正在完成飞书登录…
    </div>
  );
}

export default function FeishuCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center px-4 text-sm text-muted-foreground">
          正在加载…
        </div>
      }
    >
      <FeishuCallbackContent />
    </Suspense>
  );
}
