'use client';

import { Code2, History, Rocket, Share2, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { AppGenRecentApp } from '@/lib/app-gen-types';
import { cn } from '@/lib/utils';

import { MiaodaAppNavMenu } from './MiaodaAppNavMenu';

interface MiaodaWorkspaceHeaderProps {
  projectTitle: string;
  recentApps: AppGenRecentApp[];
  currentAppId?: string | null;
  showCode: boolean;
  onToggleCode: () => void;
  onGoHome: () => void;
  onSwitchApp: (appId: string) => void;
  isStreaming?: boolean;
  canReset?: boolean;
  onReset?: () => void;
  className?: string;
}

/** 妙搭工作台顶栏：导航菜单 + 项目名 + 分享/发布/代码 */
export function MiaodaWorkspaceHeader({
  projectTitle,
  recentApps,
  currentAppId,
  showCode,
  onToggleCode,
  onGoHome,
  onSwitchApp,
  isStreaming = false,
  canReset = false,
  onReset,
  className,
}: MiaodaWorkspaceHeaderProps) {
  return (
    <header
      className={cn(
        'flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <MiaodaAppNavMenu
          recentApps={recentApps}
          currentAppId={currentAppId}
          disabled={isStreaming}
          onGoHome={onGoHome}
          onSwitchApp={onSwitchApp}
        />
        <div className="h-5 w-px shrink-0 bg-border" aria-hidden />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{projectTitle}</h2>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[hsl(270_60%_55%/0.12)] px-2 py-0.5 text-[11px] font-medium text-[hsl(270_60%_55%)]">
              <Wand2 className="h-3 w-3" />
              灵感
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground"
          aria-label="历史"
          onClick={() => toast.info('版本历史将在后续版本开放')}
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={showCode ? 'secondary' : 'ghost'}
          className="relative h-8 gap-1 px-2.5 text-xs"
          onClick={onToggleCode}
        >
          <Code2 className="h-3.5 w-3.5" />
          {showCode ? '预览' : '代码'}
          {isStreaming && !showCode ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          ) : null}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1 px-2.5 text-xs text-muted-foreground"
          onClick={() => toast.info('分享链接将在后续版本开放')}
        >
          <Share2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">分享</span>
        </Button>
        <div className="mr-8 flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1 rounded-lg bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
            onClick={() => toast.info('一键发布将在后续版本开放')}
          >
            <Rocket className="h-3.5 w-3.5" />
            发布
          </Button>
          {canReset ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              disabled={isStreaming}
              onClick={onReset}
              aria-label="重置会话"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
