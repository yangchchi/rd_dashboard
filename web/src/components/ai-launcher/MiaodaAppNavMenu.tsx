'use client';

import { Box, Gift, Home, Menu, Mic, Package, StickyNote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AppGenRecentApp, AppGenRecentIconTone } from '@/lib/app-gen-types';
import { cn } from '@/lib/utils';

const TONE_CLASS: Record<AppGenRecentIconTone, string> = {
  orange: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  slate: 'bg-muted text-muted-foreground',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  blue: 'bg-primary/15 text-primary',
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  purple: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
};

const TONE_ICON: Record<AppGenRecentIconTone, LucideIcon> = {
  orange: Package,
  slate: StickyNote,
  amber: Mic,
  blue: Box,
  green: Gift,
  purple: Box,
};

interface MiaodaAppNavMenuProps {
  recentApps: AppGenRecentApp[];
  currentAppId?: string | null;
  disabled?: boolean;
  /** 首页：仅展示最近应用；工作台：含返回首页 */
  variant?: 'home' | 'workspace';
  onGoHome?: () => void;
  onSwitchApp: (appId: string) => void;
}

/** 妙搭导航：菜单 → 返回首页 / 最近应用 */
export function MiaodaAppNavMenu({
  recentApps,
  currentAppId,
  disabled = false,
  variant = 'workspace',
  onGoHome,
  onSwitchApp,
}: MiaodaAppNavMenuProps) {
  const list = recentApps.slice(0, 8);
  const isHome = variant === 'home';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label="最近应用"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground transition-colors',
            'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <Menu className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-64 rounded-xl border border-border bg-popover p-1 shadow-lg"
      >
        {!isHome && onGoHome ? (
          <DropdownMenuItem
            className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2"
            onSelect={onGoHome}
          >
            <Home className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">返回首页</span>
          </DropdownMenuItem>
        ) : null}

        {list.length > 0 ? (
          <>
            {!isHome ? <DropdownMenuSeparator className="my-1" /> : null}
            <DropdownMenuLabel className="px-2.5 py-1 text-xs font-normal text-muted-foreground">
              {isHome ? '最近创建的应用' : '最近应用'}
            </DropdownMenuLabel>
            {list.map((app) => {
              const Icon = TONE_ICON[app.iconTone] ?? Box;
              const isCurrent = app.id === currentAppId;
              return (
                <DropdownMenuItem
                  key={app.id}
                  className={cn(
                    'cursor-pointer gap-2.5 rounded-lg px-2.5 py-2',
                    isCurrent && 'bg-primary/8'
                  )}
                  onSelect={() => {
                    if (!isCurrent) onSwitchApp(app.id);
                  }}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                      TONE_CLASS[app.iconTone]
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 truncate text-sm">{app.title}</span>
                </DropdownMenuItem>
              );
            })}
          </>
        ) : (
          <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
            {isHome ? '暂无最近应用，发送一句话即可创建' : '暂无其它应用'}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
