'use client';

import { User } from 'lucide-react';

export default function AccountSettingsPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">个人设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理账号与偏好（建设中）</p>
      </div>
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-border bg-card p-8 text-muted-foreground">
        <div className="flex flex-col items-center gap-2 text-center">
          <User className="size-10 opacity-40" aria-hidden />
          <span className="text-sm">个人资料与通知等能力将陆续开放</span>
        </div>
      </div>
    </div>
  );
}
