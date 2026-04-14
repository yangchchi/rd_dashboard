'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

import { isAuthOnlyPath, requiredRoutePermission } from '@/lib/access-catalog';
import { useAccessControl } from '@/hooks/useAccessControl';
import { Button } from '@/components/ui/button';

export function RequireRouteAccess({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const { can } = useAccessControl();

  if (isAuthOnlyPath(pathname)) {
    return <>{children}</>;
  }

  const need = requiredRoutePermission(pathname);
  if (!need) {
    return <>{children}</>;
  }

  if (!can(need)) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-lg border border-border bg-card px-8 py-16 text-center shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-full border border-border bg-muted/50">
          <ShieldAlert className="size-7 text-amber-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-foreground">无权访问该页面</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            当前账号所属角色未包含此页面所需权限。请联系管理员在「用户管理」中调整角色，或在「角色定义」中勾选对应页面权限。
          </p>
        </div>
        <Button asChild variant="secondary" className="mt-2">
          <Link href="/dashboard">返回仪表板</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
