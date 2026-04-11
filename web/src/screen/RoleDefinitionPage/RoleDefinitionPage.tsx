'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCog } from 'lucide-react';

const RoleDefinitionPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="rd-page-title">角色定义</h1>
        <p className="rd-page-desc mt-1">配置业务角色（如干系人、产品经理、技术经理）及其说明，为权限分配提供语义边界</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40">
            <UserCog className="size-5 text-primary" />
          </div>
          <CardTitle className="text-base">角色模型</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            此处将支持角色的增删改、排序与继承关系配置，并与「权限管理」中的权限点绑定。数据持久化可在后续接入。
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default RoleDefinitionPage;
