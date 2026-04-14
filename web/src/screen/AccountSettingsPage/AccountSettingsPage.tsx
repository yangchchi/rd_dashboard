'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import { ImagePlus, Monitor, Moon, Sun, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getCurrentUser, updateStoredCurrentUser } from '@/lib/auth';

const MAX_AVATAR_FILE_BYTES = 512 * 1024;

function isAllowedAvatarUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return true;
  if (u.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

type ThemeChoice = 'light' | 'dark' | 'system';

function ThemeSegmentedControl() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const value = (theme === 'light' || theme === 'dark' ? theme : 'system') as ThemeChoice;

  const items: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { id: 'light', label: '浅色', icon: Sun },
    { id: 'dark', label: '深色', icon: Moon },
    { id: 'system', label: '跟随系统', icon: Monitor },
  ];

  return (
    <div
      className={cn(
        'inline-flex rounded-full border border-border bg-card p-1 shadow-sm',
        !mounted && 'pointer-events-none opacity-60'
      )}
      role="radiogroup"
      aria-label="主题"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = mounted && value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={item.label}
            disabled={!mounted}
            onClick={() => setTheme(item.id)}
            className={cn(
              'relative flex size-9 items-center justify-center rounded-full transition-colors',
              active ? 'text-background' : 'text-foreground hover:bg-accent/80'
            )}
          >
            {active ? (
              <span
                className="absolute inset-0 rounded-full bg-foreground shadow-sm"
                aria-hidden
              />
            ) : null}
            <Icon className="relative z-[1] size-4 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
          </button>
        );
      })}
    </div>
  );
}

export default function AccountSettingsPage() {
  const user = useMemo(() => getCurrentUser(), []);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl?.trim() ?? '');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const username = user?.username ?? '';

  const handleAvatarFile: ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      toast.error('图片需小于 512KB，避免占用过多本地存储');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string') setAvatarUrl(r);
    };
    reader.onerror = () => toast.error('读取图片失败');
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = () => {
    if (!user) {
      toast.error('未登录，无法保存');
      return;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error('请输入有效的邮箱地址');
      return;
    }
    const trimmedAvatar = avatarUrl.trim();
    if (trimmedAvatar && !isAllowedAvatarUrl(trimmedAvatar)) {
      toast.error('头像地址需为 http(s) 链接或本地上传的图片');
      return;
    }
    setSaving(true);
    try {
      updateStoredCurrentUser({
        name: name.trim() || undefined,
        email: trimmedEmail || undefined,
        phone: phone.trim() || undefined,
        avatarUrl: trimmedAvatar || undefined,
      });
      toast.success('基本信息已保存');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <div>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">个人设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理显示信息与界面主题</p>
      </div>

      <Card className="rounded-xl border-border">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg font-semibold">基本信息</CardTitle>
          <CardDescription>将保存在本机浏览器中，用于侧边栏与各处展示</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-4">
              <Avatar className="size-20 rounded-xl border border-border shadow-sm">
                {avatarUrl.trim() ? (
                  <AvatarImage src={avatarUrl.trim()} alt="" className="rounded-xl object-cover" />
                ) : null}
                <AvatarFallback className="rounded-xl text-muted-foreground">
                  <User className="size-9" strokeWidth={1.25} />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleAvatarFile}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="size-4" />
                  上传本地图片
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={!avatarUrl.trim()}
                  onClick={() => setAvatarUrl('')}
                >
                  移除头像
                </Button>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="settings-avatar-url">头像链接（可选）</Label>
              <Input
                id="settings-avatar-url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                支持 https 图片地址；本地上传会以 Base64 存入浏览器（建议小于 512KB）。
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="settings-display-name">显示姓名</Label>
              <Input
                id="settings-display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：张三"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-username">用户名</Label>
              <Input id="settings-username" value={username} readOnly disabled className="opacity-80" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-email">邮箱</Label>
              <Input
                id="settings-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="settings-phone">手机号</Label>
              <Input
                id="settings-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="选填"
                autoComplete="tel"
              />
            </div>
          </div>
          <div className="flex justify-end border-t border-border pt-6">
            <Button type="button" onClick={handleSaveProfile} disabled={saving || !user}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg font-semibold">外观</CardTitle>
          <CardDescription>浅色、深色或跟随系统设置</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-foreground">主题</span>
            <ThemeSegmentedControl />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
