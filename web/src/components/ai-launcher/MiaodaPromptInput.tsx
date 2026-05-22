'use client';

import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { Box, Wand2 } from 'lucide-react';

import type { AppGenLocalAttachment } from '@/lib/app-gen-attachments';
import { cn } from '@/lib/utils';

import { AgentComposerField } from './AgentComposerField';
import type { AgentChatMode } from './AgentPromptToolbar';

export type MiaodaPromptTab = 'explore' | 'develop';

interface MiaodaPromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  disabled?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  activeTab?: MiaodaPromptTab;
  onTabChange?: (tab: MiaodaPromptTab) => void;
  chatMode: AgentChatMode;
  onChatModeChange: (mode: AgentChatMode) => void;
  attachments: AppGenLocalAttachment[];
  onAttachmentsChange: (next: AppGenLocalAttachment[]) => void;
  leadingSlot?: ReactNode;
  className?: string;
}

/** 小研 Agent 首页输入卡 */
export function MiaodaPromptInput({
  value,
  onChange,
  onKeyDown,
  onSend,
  disabled = false,
  textareaRef,
  activeTab = 'explore',
  onTabChange,
  chatMode,
  onChatModeChange,
  attachments,
  onAttachmentsChange,
  leadingSlot,
  className,
}: MiaodaPromptInputProps) {
  const headerSlot = (
    <div className="flex items-center gap-2 px-3 pt-2.5">
      {leadingSlot ? (
        <>
          {leadingSlot}
          <div className="h-5 w-px shrink-0 bg-[hsl(214_32%_91%)]" aria-hidden />
        </>
      ) : null}
      <button
        type="button"
        onClick={() => onTabChange?.('explore')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
          activeTab === 'explore'
            ? 'bg-[hsl(217_91%_60%/0.1)] text-[hsl(217_91%_50%)]'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        <Wand2 className="h-3.5 w-3.5" />
        灵感探索
      </button>
      <button
        type="button"
        onClick={() => onTabChange?.('develop')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
          activeTab === 'develop'
            ? 'bg-[hsl(217_91%_60%/0.1)] text-[hsl(217_91%_50%)]'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        )}
      >
        <Box className="h-3.5 w-3.5" />
        应用开发
      </button>
    </div>
  );

  return (
    <AgentComposerField
      value={value}
      onChange={onChange}
      onSend={onSend}
      onKeyDown={onKeyDown}
      placeholder="开发一个长文本对比小工具"
      disabled={disabled}
      textareaRef={textareaRef}
      chatMode={chatMode}
      onChatModeChange={onChatModeChange}
      attachments={attachments}
      onAttachmentsChange={onAttachmentsChange}
      headerSlot={headerSlot}
      className={className}
    />
  );
}
