'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';

const PermissionManagementPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="rd-page-title">权限管理</h1>
        <p className="rd-page-desc mt-1">基于 RBAC 维护资源、操作与权限码，并将权限授予角色</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40">
            <KeyRound className="size-5 text-primary" />
          </div>
          <CardTitle className="text-base">RBAC 策略</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            此处将提供权限点列表、按模块分组、以及「角色 ↔ 权限」矩阵配置。可与组织与用户管理联动实现完整访问控制。
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PermissionManagementPage;
