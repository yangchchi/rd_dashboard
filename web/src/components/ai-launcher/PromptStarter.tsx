'use client';

import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { APP_GEN_STARTER_PROMPTS, type AppGenStarterPrompt } from '@/lib/app-gen-types';
import { cn } from '@/lib/utils';

const ACCENT_BAR_CLASS: Record<NonNullable<AppGenStarterPrompt['accent']>, string> = {
  slate: 'bg-[hsl(220_9%_46%)]',
  blue: 'bg-[hsl(217_91%_60%)]',
  indigo: 'bg-[hsl(243_75%_59%)]',
  purple: 'bg-[hsl(270_60%_55%)]',
  orange: 'bg-[hsl(25_95%_53%)]',
  green: 'bg-[hsl(142_71%_45%)]',
};

interface PromptStarterProps {
  onPick: (prompt: string) => void;
  disabled?: boolean;
}

/** 首次进入对话面板时展示的 6 个推荐 prompt 卡片（与设计系统 6 状态色一致）。 */
export function PromptStarter({ onPick, disabled = false }: PromptStarterProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 text-white shadow-sm">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">用一句话造一个能点的页面</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          输入你想要的应用形态，AI 会生成一个可在右侧实时预览的单文件前端原型；可继续追问优化。
        </p>
      </div>
      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {APP_GEN_STARTER_PROMPTS.map((item) => {
          const accentClass = item.accent ? ACCENT_BAR_CLASS[item.accent] : 'bg-muted';
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(item.prompt)}
              className={cn(
                'group relative flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-left transition-all',
                'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm',
                disabled && 'cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-none'
              )}
            >
              <span
                className={cn(
                  'absolute left-0 top-3 bottom-3 w-1 rounded-r-md',
                  accentClass
                )}
                aria-hidden
              />
              <span className="pl-2 text-sm font-medium text-foreground">{item.title}</span>
              <span className="pl-2 line-clamp-2 text-xs text-muted-foreground">{item.prompt}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        提示：
        <kbd className="mx-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘ / Ctrl</kbd>
        +
        <kbd className="mx-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
        发送，
        <kbd className="mx-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
        关闭
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => onPick('')}
        type="button"
      >
        我想自己写一句话
      </Button>
    </div>
  );
}
