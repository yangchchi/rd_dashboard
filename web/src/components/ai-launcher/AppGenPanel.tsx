'use client';

import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { Code2, Send, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { AppGenContextChip } from '@/lib/app-gen-types';

import { useAppGenSession } from './hooks/useAppGenSession';
import { ChatPane } from './ChatPane';
import { CodePane } from './CodePane';
import { PreviewPane } from './PreviewPane';
import { PromptStarter } from './PromptStarter';

interface AppGenPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 从路由路径粗略推断当前页面，注入到 platform_context（让 AI 知道用户从哪儿唤起的）。 */
function deriveRouteChip(pathname: string): AppGenContextChip | null {
  if (!pathname) return null;
  const map: Array<{ test: (p: string) => boolean; label: string }> = [
    { test: (p) => p === '/' || p === '/dashboard', label: '智研看板' },
    { test: (p) => p.startsWith('/requirements'), label: '需求中心' },
    { test: (p) => p.startsWith('/prd'), label: '智能文档（PRD）' },
    { test: (p) => p.startsWith('/specification'), label: '技术基准（规格）' },
    { test: (p) => p.startsWith('/ai-pipeline'), label: '交付引擎（AI 流水线）' },
    { test: (p) => p.startsWith('/acceptance'), label: '验收中心' },
    { test: (p) => p.startsWith('/bounty-hunt'), label: '赏金猎场' },
    { test: (p) => p.startsWith('/products'), label: '产品主数据' },
  ];
  const hit = map.find((m) => m.test(pathname));
  if (!hit) return null;
  return {
    kind: 'route',
    label: `当前页面：${hit.label}`,
    value: `路由：${pathname}\n模块：${hit.label}`,
  };
}

export function AppGenPanel({ open, onOpenChange }: AppGenPanelProps) {
  const pathname = usePathname() || '/';
  const session = useAppGenSession();
  const [input, setInput] = useState('');
  const [showCode, setShowCode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 唤起时让输入框获焦
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  const routeChip = useMemo(() => deriveRouteChip(pathname), [pathname]);
  const contextChips: AppGenContextChip[] = useMemo(
    () => (routeChip ? [routeChip] : []),
    [routeChip]
  );

  const handleSend = useCallback(
    async (text?: string) => {
      const intent = (text ?? input).trim();
      if (!intent) {
        toast.error('请先输入一句话需求');
        return;
      }
      if (session.status === 'streaming') {
        toast.info('上一轮正在生成，已为你切到新一轮');
      }
      setInput('');
      await session.generate(intent, contextChips);
    },
    [input, session, contextChips]
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handlePickStarter = (prompt: string) => {
    if (!prompt) {
      // "我想自己写一句话"
      setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }
    void handleSend(prompt);
  };

  const currentCode = session.currentVersion?.code ?? '';
  const isStreaming = session.status === 'streaming';
  const hasAny = session.hasHistory;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-none flex-col gap-0 border-l p-0 sm:max-w-none"
        style={{ width: 'min(96vw, 1200px)' }}
      >
        <SheetTitle className="sr-only">一句话生成应用</SheetTitle>
        <SheetDescription className="sr-only">
          全局 AI 副驾：输入一句话生成可运行的前端原型，并通过多轮对话持续优化代码。
        </SheetDescription>
        <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-violet-500 text-white">
              <Code2 className="h-4 w-4" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold text-foreground">一句话生成应用</span>
              <span className="text-[11px] text-muted-foreground">
                {routeChip ? routeChip.label : '全局 AI 副驾 · MVP'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setShowCode((v) => !v)}
            >
              <Code2 className="h-3.5 w-3.5" />
              {showCode ? '隐藏代码' : '查看代码'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mr-8 h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
              disabled={!hasAny || isStreaming}
              onClick={() => {
                if (window.confirm('确认清空当前会话？此操作不可撤销。')) {
                  session.reset();
                  setInput('');
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              重置
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className={cn('flex w-[320px] shrink-0 flex-col border-r border-border', !hasAny && 'w-full')}>
            {hasAny ? (
              <ChatPane
                messages={session.messages}
                status={session.status}
                versions={session.versions}
                currentVersionId={session.currentVersion?.id ?? null}
                errorMessage={session.errorMessage}
                onRetry={session.retry}
              />
            ) : (
              <PromptStarter onPick={handlePickStarter} disabled={isStreaming} />
            )}
          </div>

          {hasAny ? (
            <div className="flex min-w-0 flex-1">
              <div className={cn('flex min-w-0 flex-1 flex-col', showCode && 'border-r border-border')}>
                <PreviewPane
                  code={currentCode}
                  status={session.status}
                  device={session.device}
                  theme={session.theme}
                  onDeviceChange={session.setDevice}
                  onThemeChange={session.setTheme}
                />
              </div>
              {showCode ? (
                <div className="flex w-[420px] min-w-0 flex-col">
                  <CodePane
                    code={currentCode}
                    versionSeq={session.currentVersion?.seq}
                    bytes={session.currentVersion?.bytes}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="border-t border-border bg-card px-3 py-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                hasAny ? '继续追问，比如「把按钮换成红色 / 加一个搜索框」' : '一句话描述你想要的应用…'
              }
              rows={2}
              className="min-h-[44px] resize-none border-input focus-visible:ring-1 focus-visible:ring-ring"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={session.abort}
                className="h-9 shrink-0 gap-1"
              >
                <Square className="h-3.5 w-3.5" />
                停止
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSend()}
                disabled={!input.trim()}
                className="h-9 shrink-0 gap-1"
              >
                <Send className="h-3.5 w-3.5" />
                发送
              </Button>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {isStreaming
                ? '生成中… 你可以随时点击「停止」'
                : '⌘/Ctrl + Enter 发送 · Esc 关闭面板'}
            </span>
            {routeChip ? (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5">
                {routeChip.label}
              </span>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
