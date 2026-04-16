'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, KeyRound, Minus } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  ACCESS_POLICY_UPDATED_EVENT,
  refreshAccessRolesFromServer,
  readAccessRoles,
  type AccessRoleRecord,
} from '@/lib/access-policy-storage';
import { cn } from '@/lib/utils';

const PermissionManagementPage: React.FC = () => {
  const [roles, setRoles] = useState<AccessRoleRecord[]>([]);

  const reload = useCallback(() => setRoles(readAccessRoles()), []);

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

  const roleHas = (role: AccessRoleRecord, permId: string) => role.permissionIds.includes(permId);

  const byGroup = ACCESS_PERMISSION_LIST.reduce(
    (m, p) => {
      if (!m[p.group]) m[p.group] = [];
      m[p.group].push(p);
      return m;
    },
    {} as Record<AccessPermissionGroup, typeof ACCESS_PERMISSION_LIST>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rd-page-title">权限管理</h1>
        <p className="rd-page-desc mt-1">
          权限点目录与「角色 ↔ 权限」对照矩阵。编辑权限分配请前往「角色定义」。
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40">
            <KeyRound className="size-5 text-primary" />
          </div>
          <CardTitle className="text-base">权限点目录</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">分组</TableHead>
                <TableHead className="w-[38%]">名称</TableHead>
                <TableHead>标识</TableHead>
                <TableHead className="w-24">类型</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ACCESS_PERMISSION_LIST.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {ACCESS_GROUP_LABEL[p.group]}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{p.label}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.id}</TableCell>
                  <TableCell className="text-xs">
                    {p.kind === 'route' ? '页面/菜单' : '按钮操作'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">角色权限矩阵</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-full overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-[200px] bg-card">权限</TableHead>
                  {roles.map((r) => (
                    <TableHead key={r.id} className="min-w-[100px] text-center text-xs font-medium">
                      {r.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Object.keys(byGroup) as AccessPermissionGroup[]).map((gk) => (
                  <React.Fragment key={gk}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell
                        colSpan={roles.length + 1}
                        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {ACCESS_GROUP_LABEL[gk]}
                      </TableCell>
                    </TableRow>
                    {byGroup[gk].map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="sticky left-0 z-10 bg-card text-sm">
                          <div className="font-medium">{p.label}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{p.id}</div>
                        </TableCell>
                        {roles.map((r) => (
                          <TableCell key={r.id} className="text-center">
                            {roleHas(r, p.id) ? (
                              <Check className="mx-auto size-4 text-green-600" aria-label="已授权" />
                            ) : (
                              <Minus className="mx-auto size-4 text-muted-foreground/40" aria-label="未授权" />
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className={cn('mt-3 text-xs text-muted-foreground')}>
            矩阵为只读示意；实际授权以各角色勾选的权限 id 为准。
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PermissionManagementPage;
