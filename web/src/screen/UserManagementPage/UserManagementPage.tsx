'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, RequiredMark } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAccessControl } from '@/hooks/useAccessControl';
import { authApi } from '@/lib/auth-api';
import { getCurrentUser, updateStoredCurrentUser } from '@/lib/auth';
import {
  ACCESS_POLICY_UPDATED_EVENT,
  refreshAccessRolesFromServer,
  readAccessRoles,
  type AccessRoleRecord,
} from '@/lib/access-policy-storage';
import type { IUser } from '@/lib/rd-types';
import { toast } from 'sonner';

const UserManagementPage: React.FC = () => {
  const { can } = useAccessControl();
  const [users, setUsers] = useState<IUser[]>([]);
  const [accessRoles, setAccessRoles] = useState<AccessRoleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [accessRoleForCreate, setAccessRoleForCreate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reloadRoles = useCallback(() => {
    const list = readAccessRoles();
    setAccessRoles(list);
    setAccessRoleForCreate((prev) => {
      if (prev && list.some((r) => r.id === prev)) return prev;
      const def = list.find((r) => r.id === 'role_stakeholder') ?? list[0];
      return def?.id ?? '';
    });
  }, []);

  const reloadRolesFromServer = useCallback(async () => {
    await refreshAccessRolesFromServer();
    reloadRoles();
  }, [reloadRoles]);

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
    void loadUsers();
    void reloadRolesFromServer();
    const h = () => reloadRoles();
    window.addEventListener(ACCESS_POLICY_UPDATED_EVENT, h);
    return () => window.removeEventListener(ACCESS_POLICY_UPDATED_EVENT, h);
    // loadUsers 在挂载时拉取一次即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadRoles, reloadRolesFromServer]);

  const resetCreateForm = () => {
    setUsername('');
    setPassword('');
    setName('');
    setEmail('');
    setPhone('');
    reloadRoles();
  };

  const handleAssignRole = async (userId: string, accessRoleId: string | null) => {
    try {
      await authApi.updateUserAccessRole(userId, accessRoleId);
      if (getCurrentUser()?.id === userId) {
        updateStoredCurrentUser({ accessRoleId });
      }
      toast.success('访问角色已更新');
      await loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新角色失败');
    }
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
        accessRoleId: accessRoleForCreate.trim() ? accessRoleForCreate.trim() : null,
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
          <p className="rd-page-desc mt-1">
            支持创建、查看、删除本地账号；为账号绑定「角色定义」中的访问角色，以控制菜单、页面与按钮权限
          </p>
        </div>
        {can('action.users.create') ? (
          <Button type="button" className="shrink-0" onClick={() => setCreateOpen(true)}>
            新建用户
          </Button>
        ) : null}
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
            <DialogDescription>
              填写登录凭据与基础资料，带 <RequiredMark /> 为必填
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="um-username">
                用户名 <RequiredMark />
              </Label>
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
              <Label htmlFor="um-password">
                密码 <RequiredMark />
              </Label>
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
            <div className="grid gap-2">
              <Label>访问角色</Label>
              <Select value={accessRoleForCreate} onValueChange={setAccessRoleForCreate}>
                <SelectTrigger className="rd-input-glass w-full">
                  <SelectValue placeholder="选择角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">未分配（仅仪表板）</SelectItem>
                  {accessRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <div className="flex w-full flex-col gap-2 sm:w-64">
                    <Label className="text-xs text-muted-foreground">访问角色</Label>
                    {can('action.users.assign_role') ? (
                      <Select
                        value={u.accessRoleId ?? ''}
                        onValueChange={(v) => handleAssignRole(u.id, v.trim() ? v : null)}
                      >
                        <SelectTrigger className="rd-input-glass h-9 w-full">
                          <SelectValue placeholder="未分配" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">未分配（仅仪表板）</SelectItem>
                          {accessRoles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {accessRoles.find((r) => r.id === u.accessRoleId)?.name ?? '未分配'}
                      </p>
                    )}
                  </div>
                  {can('action.users.delete') ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="shrink-0 self-end sm:self-center"
                      onClick={() => removeUser(u.id)}
                    >
                      删除
                    </Button>
                  ) : null}
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
