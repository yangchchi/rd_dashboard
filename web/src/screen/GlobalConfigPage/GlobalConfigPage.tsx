'use client';

import React, { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { RdPageModuleHeading } from '@/components/rd-page-module-heading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastApiError } from '@/lib/api-error';
import {
  createDefaultGlobalConfig,
  DEFAULT_WORKSPACE_ROOT,
  validateWorkspacesDir,
} from '@shared/global-config-defaults';
import type { IGlobalConfig } from '@shared/global-config-defaults';
import { useGlobalConfig, useSaveGlobalConfig } from '@/lib/rd-hooks';

const GlobalConfigPage: React.FC = () => {
  const { data: loaded, isLoading } = useGlobalConfig();
  const saveConfig = useSaveGlobalConfig();
  const [draft, setDraft] = useState<IGlobalConfig>(() => createDefaultGlobalConfig());

  useEffect(() => {
    if (loaded) {
      setDraft(loaded);
    } else if (!isLoading) {
      setDraft(createDefaultGlobalConfig());
    }
  }, [loaded, isLoading]);

  const handleSave = async () => {
    const err = validateWorkspacesDir(draft.workspacesDir);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      const next = await saveConfig.mutateAsync({
        workspacesDir: draft.workspacesDir.trim().replace(/\/+$/, ''),
      });
      setDraft(next);
      toast.success('全局配置已保存');
    } catch (e) {
      toastApiError(e, '保存失败');
    }
  };

  const handleReset = async () => {
    const def = createDefaultGlobalConfig();
    try {
      const next = await saveConfig.mutateAsync(def);
      setDraft(next);
      toast.success('已恢复默认工作区目录');
    } catch (e) {
      toastApiError(e, '恢复失败');
    }
  };

  return (
    <div className="w-full space-y-6">
      <section className="flex w-full items-center justify-between gap-4">
        <div className="rd-page-header-lead">
          <RdPageModuleHeading
            icon={SlidersHorizontal}
            title="全局配置"
            description="系统级运行参数，影响 Agent 工作区、缓存与 Codex 日志等路径。修改后对新创建的工作区生效。"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => void handleReset()} disabled={saveConfig.isPending}>
            恢复默认
          </Button>
          <Button onClick={() => void handleSave()} disabled={saveConfig.isPending}>
            保存
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Agent 工作区</CardTitle>
          <CardDescription>
            工作区根目录用于存放 git 缓存、worktree 与会话目录。默认：
            <span className="font-mono text-foreground"> {DEFAULT_WORKSPACE_ROOT}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="workspaces-dir">workspaces 目录</Label>
            <Input
              id="workspaces-dir"
              className="font-mono"
              placeholder={DEFAULT_WORKSPACE_ROOT}
              value={draft.workspacesDir}
              onChange={(e) => setDraft((prev) => ({ ...prev, workspacesDir: e.target.value }))}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              请填写本机可写的绝对路径。子目录如 <span className="font-mono">cache/</span>、
              <span className="font-mono">codex-logs/</span> 将自动创建在该根目录下。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GlobalConfigPage;
