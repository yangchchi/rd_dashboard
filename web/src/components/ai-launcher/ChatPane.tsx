'use client';

import { useEffect, useRef } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AppGenMessage, AppGenStatus, AppGenVersion } from '@/lib/app-gen-types';

function formatBytes(n: number): string {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function shortIntentTitle(intent: string): string {
  const t = intent.trim();
  if (t.length <= 24) return t;
  return `${t.slice(0, 24)}…`;
}

interface ChatPaneProps {
  messages: AppGenMessage[];
  status: AppGenStatus;
  currentVersionId?: string | null;
  onPickVersion?: (versionId: string) => void;
  versions: AppGenVersion[];
  errorMessage?: string | null;
  onRetry?: () => void;
  onViewCode?: () => void;
}

/** 妙搭工作台左侧对话流 */
export function ChatPane({
  messages,
  status,
  currentVersionId,
  onPickVersion,
  versions,
  errorMessage,
  onRetry,
  onViewCode,
}: ChatPaneProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, status]);

  const pairs: Array<{ user: AppGenMessage; assistant?: AppGenMessage; version?: AppGenVersion }> =
    [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const assistant = messages[i + 1]?.role === 'assistant' ? messages[i + 1] : undefined;
    const version = assistant?.versionId
      ? versions.find((v) => v.id === assistant.versionId)
      : undefined;
    pairs.push({ user: m, assistant, version });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {pairs.map(({ user, assistant, version }, idx) => {
          const isStreaming = version?.status === 'streaming';
          const isCurrent = version?.id === currentVersionId;
          const isLast = idx === pairs.length - 1;
          const showThinking = isStreaming && isLast;

          return (
            <div key={user.id} className="space-y-3">
              {/* 用户诉求 */}
              <div className="flex justify-end">
                <div className="max-w-[92%] rounded-2xl rounded-tr-md border border-border bg-card px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-sm">
                  {user.text}
                </div>
              </div>

              {/* 思考 / 方案设计 */}
              {(showThinking || version?.status === 'done') && (
                <div className="space-y-2 text-sm text-muted-foreground">
                  {showThinking ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span>思考中…</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span>已完成方案设计</span>
                    </div>
                  )}

                  <details className="group rounded-xl border border-border bg-card" open={isLast}>
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                      <Pencil className="h-3.5 w-3.5 text-primary" />
                      方案设计
                      <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground group-open:hidden" />
                      <ChevronDown className="ml-auto hidden h-3.5 w-3.5 text-muted-foreground group-open:block" />
                    </summary>
                    <div className="space-y-2 border-t border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                      <p>
                        <span className="font-medium text-foreground">页面结构：</span>
                        输入区、列表/主内容区、操作按钮区
                      </p>
                      <p>
                        <span className="font-medium text-foreground">功能范围：</span>
                        增删改查、表单校验、本地状态管理
                      </p>
                      <p className="text-[11px]">基于你的描述：{shortIntentTitle(user.text)}</p>
                    </div>
                  </details>
                </div>
              )}

              {/* 实现结果卡 */}
              {version ? (
                <div
                  className={cn(
                    'rounded-xl border bg-card p-3 shadow-sm transition-colors',
                    isCurrent
                      ? 'border-primary/45 ring-1 ring-primary/15'
                      : 'border-border'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                      <Box className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {isStreaming
                          ? `正在实现 v${version.seq}…`
                          : `实现${shortIntentTitle(user.text)}`}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {assistant?.text ?? `v${version.seq}`}
                        {version.bytes > 0 ? ` · ${formatBytes(version.bytes)}` : null}
                      </p>
                      {isStreaming ? (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full w-1/3 animate-pulse bg-primary" />
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onPickVersion?.(version.id)}
                            className={cn(
                              'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                              isCurrent
                                ? 'border-primary/40 bg-primary/8 text-primary'
                                : 'border-border bg-muted/50 text-muted-foreground hover:border-primary/35 hover:text-primary'
                            )}
                          >
                            预览应用
                          </button>
                          <button
                            type="button"
                            onClick={onViewCode}
                            className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                          >
                            查看变更
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {errorMessage && status === 'error' ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
            <div className="font-medium text-destructive">这一轮没生成出来</div>
            <div className="mt-1 break-all text-xs text-destructive/80">{errorMessage}</div>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-destructive/30 bg-card px-2.5 py-1 text-xs text-destructive hover:bg-destructive/5"
              >
                <RotateCcw className="h-3 w-3" /> 重试
              </button>
            ) : null}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}
