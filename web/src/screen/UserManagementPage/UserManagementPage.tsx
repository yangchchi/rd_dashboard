'use client';
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { authApi } from '@/lib/auth-api';
import type { IUser } from '@/lib/rd-types';
import { toast } from 'sonner';

const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<IUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const list = await authApi.listUsers();
      setUsers(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载用户失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const resetCreateForm = () => {
    setUsername('');
    setPassword('');
    setName('');
    setEmail('');
    setPhone('');
  };

  const handleCreateUser = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error('请填写用户名和密码');
      return;
    }
    setSubmitting(true);
    try {
      await authApi.createUser(username.trim(), password, {
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      toast.success('用户创建成功');
      resetCreateForm();
      setCreateOpen(false);
      await loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const removeUser = async (id: string) => {
    try {
      await authApi.deleteUser(id);
      toast.success('用户删除成功');
      await loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="rd-page-title">用户管理</h1>
          <p className="rd-page-desc mt-1">支持创建、查看、删除本地账号</p>
        </div>
        <Button type="button" className="shrink-0" onClick={() => setCreateOpen(true)}>
          新建用户
        </Button>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建用户</DialogTitle>
            <DialogDescription>填写登录凭据与基础资料，带 * 为必填</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="um-username">用户名 *</Label>
              <Input
                id="um-username"
                autoComplete="username"
                placeholder="登录名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="rd-input-glass"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="um-password">密码 *</Label>
              <Input
                id="um-password"
                type="password"
                autoComplete="new-password"
                placeholder="初始密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rd-input-glass"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="um-name">姓名</Label>
              <Input
                id="um-name"
                autoComplete="name"
                placeholder="真实姓名或展示名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rd-input-glass"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="um-email">邮箱</Label>
              <Input
                id="um-email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rd-input-glass"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="um-phone">电话</Label>
              <Input
                id="um-phone"
                type="tel"
                autoComplete="tel"
                placeholder="手机号或座机"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rd-input-glass"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="button" onClick={handleCreateUser} disabled={submitting}>
              {submitting ? '创建中…' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">用户列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="rd-list-row flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-foreground font-medium">
                      {u.name?.trim() ? u.name : u.username}
                      {u.name?.trim() ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          ({u.username})
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {u.email ? <span>邮箱：{u.email}</span> : null}
                      {u.phone ? <span>电话：{u.phone}</span> : null}
                      <span>创建：{new Date(u.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <Button variant="destructive" size="sm" className="shrink-0 self-end sm:self-center" onClick={() => removeUser(u.id)}>
                    删除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserManagementPage;
