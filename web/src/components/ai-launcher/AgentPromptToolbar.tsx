'use client';

import {
  ArrowUp,
  AtSign,
  Bot,
  MessageSquare,
  Mic,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

export type AgentChatMode = 'ask' | 'agent';

interface AgentPromptToolbarProps {
  mode: AgentChatMode;
  onModeChange: (mode: AgentChatMode) => void;
  canSend: boolean;
  onSend: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onAbort?: () => void;
  onUpload?: () => void;
  onOpenSkills?: () => void;
  onOpenFiles?: () => void;
  size?: 'default' | 'compact';
  className?: string;
}

const MODE_BTN =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors';

/** 小研 Agent / Agent 工作台统一底栏 */
export function AgentPromptToolbar({
  mode,
  onModeChange,
  canSend,
  onSend,
  disabled = false,
  isStreaming = false,
  onAbort,
  onUpload,
  onOpenSkills,
  onOpenFiles,
  size = 'default',
  className,
}: AgentPromptToolbarProps) {
  const iconBtn = cn(
    'flex items-center justify-center rounded-lg text-muted-foreground transition-colors',
    'hover:bg-muted/80 hover:text-foreground',
    size === 'compact' ? 'h-7 w-7' : 'h-8 w-8'
  );
  const sendBtn = cn(
    'flex items-center justify-center rounded-full transition-all',
    size === 'compact' ? 'h-8 w-8' : 'h-9 w-9'
  );

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2',
        size === 'compact' ? 'px-2 pb-2' : 'px-3 py-2.5',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-label="上传本地文件"
          disabled={disabled || isStreaming}
          className={iconBtn}
          onClick={onUpload}
        >
          <Plus className={size === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </button>

        <div className="mx-0.5 flex items-center gap-0.5 rounded-lg border border-[hsl(214_32%_91%)] bg-[hsl(210_20%_98%)] p-0.5">
          <button
            type="button"
            disabled={disabled || isStreaming}
            onClick={() => onModeChange('ask')}
            className={cn(
              MODE_BTN,
              mode === 'ask'
                ? 'bg-white text-[hsl(217_91%_50%)] shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Ask
          </button>
          <button
            type="button"
            disabled={disabled || isStreaming}
            onClick={() => onModeChange('agent')}
            className={cn(
              MODE_BTN,
              mode === 'agent'
                ? 'bg-[hsl(217_91%_60%/0.12)] text-[hsl(217_91%_50%)]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Bot className="h-3.5 w-3.5" />
            Agent
          </button>
        </div>

        <button
          type="button"
          aria-label="技能"
          disabled={disabled}
          className={cn(iconBtn, size === 'default' && 'w-auto gap-1 px-2')}
          onClick={onOpenSkills}
        >
          <Sparkles className={size === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          {size === 'default' ? <span className="text-xs">技能</span> : null}
        </button>
        <button
          type="button"
          aria-label="文件"
          disabled={disabled}
          className={cn(iconBtn, size === 'default' && 'w-auto gap-1 px-2')}
          onClick={onOpenFiles}
        >
          <AtSign className={size === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          {size === 'default' ? <span className="text-xs">文件</span> : null}
        </button>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="语音输入"
          disabled={disabled}
          className={iconBtn}
          onClick={() => toast.info('语音输入即将开放')}
        >
          <Mic className={size === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </button>
        <button
          type="button"
          aria-label="设置"
          disabled={disabled}
          className={iconBtn}
          onClick={() => toast.info('设置即将开放')}
        >
          <SlidersHorizontal className={size === 'compact' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </button>
        {isStreaming ? (
          <button
            type="button"
            aria-label="停止生成"
            onClick={onAbort}
            className={cn(sendBtn, 'ml-0.5 bg-destructive text-white hover:bg-destructive/90')}
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="发送"
            disabled={disabled || !canSend}
            onClick={onSend}
            className={cn(
              sendBtn,
              'ml-0.5',
              canSend && !disabled
                ? 'bg-[hsl(217_91%_60%)] text-white shadow-sm hover:bg-[hsl(217_91%_55%)]'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
