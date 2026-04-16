'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserCog, Pencil, Plus, Trash2, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ACCESS_GROUP_LABEL,
  ACCESS_PERMISSION_LIST,
  type AccessPermissionGroup,
} from '@/lib/access-catalog';
import {
  ACCESS_POLICY_STORAGE_KEY,
  ACCESS_POLICY_UPDATED_EVENT,
  deleteAccessRoleRemote,
  readAccessRoles,
  refreshAccessRolesFromServer,
  resetAccessRolesRemote,
  upsertAccessRoleRemote,
  type AccessRoleRecord,
} from '@/lib/access-policy-storage';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const grouped = (): Record<AccessPermissionGroup, typeof ACCESS_PERMISSION_LIST> => {
  const acc = {} as Record<AccessPermissionGroup, typeof ACCESS_PERMISSION_LIST>;
  for (const p of ACCESS_PERMISSION_LIST) {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p);
  }
  return acc;
};

const RoleDefinitionPage: React.FC = () => {
  const [roles, setRoles] = useState<AccessRoleRecord[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccessRoleRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permSet, setPermSet] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    setRoles(readAccessRoles());
  }, []);

  const reloadFromServer = useCallback(async () => {
    await refreshAccessRolesFromServer();
    reload();
  }, [reload]);

  useEffect(() => {
    void reloadFromServer();
    const h = () => reload();
    window.addEventListener(ACCESS_POLICY_UPDATED_EVENT, h);
    return () => window.removeEventListener(ACCESS_POLICY_UPDATED_EVENT, h);
  }, [reload, reloadFromServer]);

  const groups = useMemo(() => grouped(), []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setPermSet(new Set());
    setDialogOpen(true);
  };

  const openEdit = (r: AccessRoleRecord) => {
    setEditing(r);
    setName(r.name);
    setDescription(r.description ?? '');
    setPermSet(new Set(r.permissionIds));
    setDialogOpen(true);
  };

  const togglePerm = (id: string, checked: boolean) => {
    setPermSet((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('请填写角色名称');
      return;
    }
    const id = editing?.id ?? `role_${Date.now()}`;
    try {
      await upsertAccessRoleRemote({
        id,
        name: name.trim(),
        description: description.trim() || undefined,
        permissionIds: [...permSet],
        builtIn: editing?.builtIn,
      });
      toast.success(editing ? '角色已更新' : '角色已创建');
      setDialogOpen(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  const handleDelete = async (r: AccessRoleRecord) => {
    const res = await deleteAccessRoleRemote(r.id);
    if (!res.ok) {
      toast.error(res.reason);
      return;
    }
    toast.success('已删除角色');
    reload();
  };

  const handleResetBuiltins = async () => {
    if (!window.confirm('将清除本地角色定义并恢复内置模板，是否继续？')) return;
    try {
      await resetAccessRolesRemote();
      reload();
      toast.success('已恢复默认角色');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '恢复失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="rd-page-title">角色定义</h1>
          <p className="rd-page-desc mt-1">
            创建业务角色并勾选可访问的页面与按钮级权限；用户在「用户管理」中绑定角色后生效（内置 admin
            账号拥有全部权限）
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleResetBuiltins}>
            <RotateCcw className="mr-1.5 size-4" />
            恢复默认模板
          </Button>
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-1.5 size-4" />
            新建角色
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40">
            <UserCog className="size-5 text-primary" />
          </div>
          <CardTitle className="text-base">角色列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            服务端持久化策略（本地缓存键：<code className="font-mono text-[11px]">{ACCESS_POLICY_STORAGE_KEY}</code>）
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>说明</TableHead>
                <TableHead className="w-28 text-right">权限数</TableHead>
                <TableHead className="w-24">类型</TableHead>
                <TableHead className="w-36 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="max-w-md text-muted-foreground text-sm">
                    {r.description || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.permissionIds.length}</TableCell>
                  <TableCell>
                    {r.builtIn ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        内置
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">自定义</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(r)}>
                      <Pencil className="mr-1 size-3.5" />
                      编辑
                    </Button>
                    {!r.builtIn ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(r)}
                      >
                        <Trash2 className="mr-1 size-3.5" />
                        删除
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{editing ? '编辑角色' : '新建角色'}</DialogTitle>
            <DialogDescription>
              按模块勾选权限：页面类控制菜单与路由；操作类控制页面内按钮（需在页面中接入校验）。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 px-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="role-name">角色名称</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：外包协作"
                className="rd-input-glass"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role-desc">说明</Label>
              <Input
                id="role-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选"
                className="rd-input-glass"
              />
            </div>
          </div>
          <ScrollArea className="max-h-[340px] border-y border-border px-6 py-3">
            <div className="space-y-5 pr-3">
              {(Object.keys(groups) as AccessPermissionGroup[]).map((gk) => (
                <div key={gk} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {ACCESS_GROUP_LABEL[gk]}
                  </p>
                  <div className="space-y-2">
                    {groups[gk].map((p) => (
                      <label
                        key={p.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-2',
                          'hover:border-border hover:bg-muted/30'
                        )}
                      >
                        <Checkbox
                          checked={permSet.has(p.id)}
                          onCheckedChange={(v) => togglePerm(p.id, v === true)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground">{p.label}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{p.id}</span>
                          {p.description ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {p.description}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={handleSave}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RoleDefinitionPage;
