'use client';

import type { KeyboardEvent, RefObject } from 'react';
import { useState } from 'react';
import {
  FileText,
  Globe,
  LayoutGrid,
  Megaphone,
  MousePointerClick,
  Sparkles,
  Wrench,
} from 'lucide-react';

import type { AppGenLocalAttachment } from '@/lib/app-gen-attachments';
import {
  APP_GEN_QUICK_PILLS,
  APP_GEN_SHOWCASE_ITEMS,
  type AppGenRecentApp,
  type AppGenShowcaseAccent,
} from '@/lib/app-gen-types';
import { cn } from '@/lib/utils';

import type { AgentChatMode } from './AgentPromptToolbar';
import { MiaodaAppNavMenu } from './MiaodaAppNavMenu';
import { MiaodaPromptInput, type MiaodaPromptTab } from './MiaodaPromptInput';
import { ShowcasePreview } from './ShowcasePreview';

const PILL_ICONS: Record<string, typeof Globe> = {
  landing: Globe,
  prototype: LayoutGrid,
  marketing: Megaphone,
  interactive: MousePointerClick,
  portal: FileText,
  tool: Wrench,
};

const ACCENT_BAR_CLASS: Record<AppGenShowcaseAccent, string> = {
  slate: 'bg-[hsl(220_9%_46%)]',
  blue: 'bg-[hsl(217_91%_60%)]',
  indigo: 'bg-[hsl(243_75%_59%)]',
  purple: 'bg-[hsl(270_60%_55%)]',
  orange: 'bg-[hsl(25_95%_53%)]',
  green: 'bg-[hsl(142_71%_45%)]',
};

/** 统一卡片尺寸（预览 + 文案区） */
const SHOWCASE_CARD_CLASS =
  'group flex h-[196px] w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md';

interface PromptStarterProps {
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onPick: (prompt: string) => void;
  disabled?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  routeLabel?: string | null;
  recentApps?: AppGenRecentApp[];
  onSwitchApp?: (appId: string) => void;
  chatMode: AgentChatMode;
  onChatModeChange: (mode: AgentChatMode) => void;
  attachments: AppGenLocalAttachment[];
  onAttachmentsChange: (next: AppGenLocalAttachment[]) => void;
}

/** 妙搭首页风格：Hero 大输入 + 快捷 pill + 固定尺寸案例网格 */
export function PromptStarter({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  onPick,
  disabled = false,
  textareaRef,
  routeLabel,
  recentApps = [],
  onSwitchApp,
  chatMode,
  onChatModeChange,
  attachments,
  onAttachmentsChange,
}: PromptStarterProps) {
  const [activeTab, setActiveTab] = useState<MiaodaPromptTab>('explore');

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background">
      <section className="mx-auto w-full max-w-4xl shrink-0 px-6 pb-4 pt-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            <span>海智赋能研发，应用万象新生</span>
            <Sparkles className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          </h1>
          <div className="flex items-center gap-2 text-xs">
           
            {routeLabel ? (
              <span className="text-muted-foreground">{routeLabel}</span>
            ) : null}
          </div>
        </div>

        <MiaodaPromptInput
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          onSend={onSend}
          disabled={disabled}
          textareaRef={textareaRef}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          chatMode={chatMode}
          onChatModeChange={onChatModeChange}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
          leadingSlot={
            onSwitchApp ? (
              <MiaodaAppNavMenu
                variant="home"
                recentApps={recentApps}
                disabled={disabled}
                onSwitchApp={onSwitchApp}
              />
            ) : undefined
          }
        />

        <p className="mt-4 text-center text-sm text-muted-foreground">
          只要 5 分钟，即刻将灵感转化为可点原型。你可以试试：
        </p>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {APP_GEN_QUICK_PILLS.map((pill) => {
            const Icon = PILL_ICONS[pill.id] ?? Sparkles;
            return (
              <button
                key={pill.id}
                type="button"
                disabled={disabled}
                onClick={() => onPick(pill.prompt)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground shadow-sm transition-all',
                  'hover:border-primary/40 hover:shadow-md',
                  disabled && 'cursor-not-allowed opacity-60'
                )}
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {pill.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 pb-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {APP_GEN_SHOWCASE_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(item.prompt)}
              className={cn(
                SHOWCASE_CARD_CLASS,
                'relative',
                disabled && 'cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-sm'
              )}
            >
              <ShowcasePreview variant={item.preview} />
              <div className="relative flex min-h-0 flex-1 flex-col p-3">
                <span
                  className={cn(
                    'absolute left-0 top-3 bottom-3 w-1 rounded-r-md',
                    ACCENT_BAR_CLASS[item.accent]
                  )}
                  aria-hidden
                />
                <span className="pl-2 text-sm font-medium text-foreground group-hover:text-primary">
                  {item.title}
                </span>
                <span className="mt-1 pl-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {item.prompt}
                </span>
              </div>
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            ⌘ / Ctrl + I
          </kbd>{' '}
          唤起面板 ·{' '}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            ⌘ / Ctrl + Enter
          </kbd>{' '}
          发送 ·{' '}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            Esc
          </kbd>{' '}
          关闭
        </p>
      </section>
    </div>
  );
}
