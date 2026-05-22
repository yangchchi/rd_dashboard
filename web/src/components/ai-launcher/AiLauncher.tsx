'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { useAccessControl } from '@/hooks/useAccessControl';
import { cn } from '@/lib/utils';

import { AppGenPanel } from './AppGenPanel';

interface AiLauncherProps {
  className?: string;
}

/**
 * 全局 AI 副驾入口（悬浮按钮）。
 *
 * 行为：
 *   - 仅在拥有 action.ai.one_shot_app 权限时可见
 *   - 任意页面右下角常驻
 *   - 快捷键 ⌘/Ctrl + I 唤起；面板内按 Esc 关闭
 */
export function AiLauncher({ className }: AiLauncherProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { can } = useAccessControl();

  useEffect(() => setMounted(true), []);

  const allowed = can('action.ai.one_shot_app');

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!allowed) return;
    const onKey = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      if ((isMac ? event.metaKey : event.ctrlKey) && (event.key === 'i' || event.key === 'I')) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowed, toggle]);

  if (!mounted || !allowed) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="一句话生成应用（⌘/Ctrl + I）"
        title="一句话生成应用 · ⌘/Ctrl + I"
        className={cn(
          'group fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg',
          'bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500',
          'transition-transform duration-200 hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'before:absolute before:inset-0 before:-z-10 before:rounded-full before:bg-gradient-to-br before:from-blue-400/40 before:via-indigo-400/40 before:to-violet-400/40 before:blur-xl',
          className
        )}
      >
        <Sparkles className="h-6 w-6 transition-transform group-hover:rotate-12" />
        <span className="absolute -top-1 -right-1 rounded-full border border-white/40 bg-white/20 px-1 py-0.5 text-[9px] font-medium leading-none backdrop-blur">
          小研
        </span>
      </button>
      <AppGenPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
