'use client';

import { useEffect, useRef } from 'react';
import { Bot, RotateCcw, User } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AppGenMessage, AppGenStatus, AppGenVersion } from '@/lib/app-gen-types';

interface ChatPaneProps {
  messages: AppGenMessage[];
  status: AppGenStatus;
  currentVersionId?: string | null;
  onPickVersion?: (versionId: string) => void;
  versions: AppGenVersion[];
  errorMessage?: string | null;
  onRetry?: () => void;
}

export function ChatPane({
  messages,
  status,
  currentVersionId,
  onPickVersion,
  versions,
  errorMessage,
  onRetry,
}: ChatPaneProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, status]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => {
          const isUser = m.role === 'user';
          const version = m.versionId ? versions.find((v) => v.id === m.versionId) : undefined;
          const isCurrent = !!version && version.id === currentVersionId;
          return (
            <div
              key={m.id}
              className={cn('flex w-full items-start gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}
            >
              <div
                className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-foreground',
                  isUser
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border bg-muted'
                )}
                aria-hidden
              >
                {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </div>
              <div
                className={cn(
                  'min-w-0 max-w-[80%] rounded-lg border px-3 py-2 text-sm leading-relaxed shadow-sm',
                  isUser ? 'border-primary/30 bg-primary/5 text-foreground' : 'border-border bg-card text-foreground'
                )}
              >
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
                {version ? (
                  <button
                    type="button"
                    onClick={() => onPickVersion?.(version.id)}
                    className={cn(
                      'mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                      isCurrent
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground hover:border-primary/40 hover:text-primary'
                    )}
                  >
                    v{version.seq}
                    <span className="text-[10px] text-muted-foreground/80">
                      {version.status === 'streaming' ? '生成中' : version.status === 'done' ? '已完成' : version.status === 'aborted' ? '已停止' : '失败'}
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        {errorMessage && status === 'error' ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <div className="font-medium">这一轮没生成出来</div>
            <div className="mt-1 break-all text-xs opacity-80">{errorMessage}</div>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-card px-2 py-1 text-xs text-destructive hover:bg-destructive/5"
              >
                <RotateCcw className="h-3 w-3" /> 重试这一轮
              </button>
            ) : null}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}
