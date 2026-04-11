'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/auth-api';
import { saveAuthSession } from '@/lib/auth';
import { toast } from 'sonner';

const LoginPage: React.FC = () => {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
      <Card className="w-full max-w-md border-white/[0.1] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.55)]">
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
    </div>
  );
};

export default LoginPage;
