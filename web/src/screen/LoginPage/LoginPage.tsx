'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/auth-api';
import { saveAuthSession } from '@/lib/auth';
import {
  buildFeishuAuthorizeUrl,
  FEISHU_OAUTH_STATE_KEY,
  getFeishuRedirectUri,
} from '@/lib/feishu-oauth';
import { toast } from 'sonner';
import { ShipWheel } from 'lucide-react';

const LoginPage: React.FC = () => {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const startFeishuLogin = () => {
    const clientId = (process.env.NEXT_PUBLIC_FEISHU_APP_ID || '').trim();
    if (!clientId) {
      toast.error('未配置 NEXT_PUBLIC_FEISHU_APP_ID，无法发起飞书授权');
      return;
    }
    const redirectUri = getFeishuRedirectUri();
    if (!redirectUri) {
      toast.error('无法构造飞书回调地址');
      return;
    }
    const state = crypto.randomUUID();
    sessionStorage.setItem(FEISHU_OAUTH_STATE_KEY, state);
    const url = buildFeishuAuthorizeUrl({
      clientId,
      redirectUri,
      state,
    });
    window.location.assign(url);
  };

  const submit = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error('请输入用户名和密码');
      return;
    }
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await authApi.login(username.trim(), password)
          : await authApi.register(username.trim(), password);
      saveAuthSession(res.token, res.user);
      toast.success(mode === 'login' ? '登录成功' : '注册成功');
      router.replace('/dashboard');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-4 text-foreground">
      <div className="w-full max-w-md space-y-3">
        <div className="px-1">
          <div className="flex items-start gap-3">
            <ShipWheel
              className="h-12 w-12 shrink-0 text-blue-700 dark:text-cyan-100"
              aria-hidden
            />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <span className="bg-gradient-to-r from-blue-700 via-indigo-600 to-violet-600 bg-clip-text text-3xl font-extrabold leading-none tracking-wide text-transparent drop-shadow-[0_2px_4px_rgba(59,130,246,0.35)] dark:from-cyan-200 dark:via-blue-200 dark:to-purple-200 dark:drop-shadow-[0_2px_6px_rgba(125,211,252,0.45)]">
                AI智研平台
              </span>
              <div className="flex w-full max-w-[280px] items-center gap-2">
                <span className="h-px w-10 bg-gradient-to-r from-transparent via-blue-500/70 to-blue-500/30 dark:via-cyan-300/80 dark:to-cyan-300/30" />
                <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700/90 dark:text-cyan-100/90">
                  AI-Driven SDLC
                </span>
                <span className="h-px w-10 bg-gradient-to-l from-transparent via-blue-500/70 to-blue-500/30 dark:via-cyan-300/80 dark:to-cyan-300/30" />
              </div>
            </div>
          </div>
        </div>
        <Card className="w-full border-white/[0.1] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.55)]">
          <CardHeader>
            <CardTitle>{mode === 'login' ? '用户登录' : '用户注册'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="border-white/[0.1] bg-white/[0.04] text-foreground backdrop-blur-sm"
            />
            <Input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-white/[0.1] bg-white/[0.04] text-foreground backdrop-blur-sm"
            />
            <Button onClick={submit} disabled={loading} className="w-full">
              {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
            </Button>
            <p className="text-xs text-muted-foreground">默认管理员：admin / 123456</p>
          </CardContent>
        </Card>

        <div className="space-y-4 pt-1">
          <Button
            type="button"
            variant="outline"
            className="w-full border-white/[0.1] bg-white/[0.04] text-foreground shadow-none backdrop-blur-sm hover:bg-white/[0.08] hover:text-foreground"
            onClick={startFeishuLogin}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#3370FF] text-[11px] font-bold leading-none text-white">
              飞
            </span>
            飞书登录
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full border-white/[0.1] bg-white/[0.04] text-foreground shadow-none backdrop-blur-sm hover:bg-white/[0.08] hover:text-foreground"
            onClick={() => toast.info('微信登录功能开发中')}
          >
            <img
              src="/oauth-wechat.svg"
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 shrink-0"
            />
            微信登录
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
