'use client';

import type { KeyboardEvent, RefObject } from 'react';

import type { AppGenLocalAttachment } from '@/lib/app-gen-attachments';

import { AgentComposerField } from './AgentComposerField';
import type { AgentChatMode } from './AgentPromptToolbar';

interface MiaodaChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onAbort?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  chatMode: AgentChatMode;
  onChatModeChange: (mode: AgentChatMode) => void;
  attachments: AppGenLocalAttachment[];
  onAttachmentsChange: (next: AppGenLocalAttachment[]) => void;
}

/** Agent 工作台底部输入（与小研 Agent 一致） */
export function MiaodaChatComposer(props: MiaodaChatComposerProps) {
  return (
    <div className="shrink-0 border-t border-border bg-card px-4 py-3">
      <AgentComposerField
        {...props}
        placeholder="告诉小研如何修改应用"
        rows={2}
        size="compact"
        className="rounded-xl shadow-sm"
      />
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        ⌘/Ctrl + Enter 发送 · / 技能 · @ 文件 · Esc 关闭菜单
      </p>
    </div>
  );
}
