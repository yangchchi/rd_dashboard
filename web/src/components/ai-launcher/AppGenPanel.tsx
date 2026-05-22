'use client';

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  buildAttachmentsContextBlock,
  type AppGenLocalAttachment,
} from '@/lib/app-gen-attachments';
import { readRecentApps } from '@/lib/app-gen-recent';
import { cn } from '@/lib/utils';
import type { AppGenContextChip, AppGenRecentApp } from '@/lib/app-gen-types';

import type { AgentChatMode } from './AgentPromptToolbar';
import { useAppGenSession } from './hooks/useAppGenSession';
import { ChatPane } from './ChatPane';
import { CodePane } from './CodePane';
import { MiaodaChatComposer } from './MiaodaChatComposer';
import { MiaodaWorkspaceHeader } from './MiaodaWorkspaceHeader';
import { PreviewPane } from './PreviewPane';
import { PromptStarter } from './PromptStarter';

interface AppGenPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

function deriveProjectTitle(messages: { role: string; text: string }[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return '未命名应用';
  const t = firstUser.text.trim();
  if (t.length <= 20) return t;
  return `${t.slice(0, 20)}…`;
}

export function AppGenPanel({ open, onOpenChange }: AppGenPanelProps) {
  const pathname = usePathname() || '/';
  const session = useAppGenSession();
  const [input, setInput] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [recentApps, setRecentApps] = useState<AppGenRecentApp[]>([]);
  const [chatMode, setChatMode] = useState<AgentChatMode>('agent');
  const [attachments, setAttachments] = useState<AppGenLocalAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const refreshRecentApps = useCallback(() => {
    setRecentApps(readRecentApps());
  }, []);

  useEffect(() => {
    if (open) refreshRecentApps();
  }, [open, refreshRecentApps, session.messages.length, session.versions.length]);

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

  const buildSendContext = useCallback(() => {
    const chips: AppGenContextChip[] = [...contextChips];
    const block = buildAttachmentsContextBlock(attachments);
    if (block) {
      chips.push({
        kind: 'text',
        label: '本地上传附件',
        value: block,
      });
    }
    if (chatMode === 'ask') {
      chips.push({
        kind: 'text',
        label: '输入模式',
        value: 'Ask 模式：本轮仅作对话记录参考，仍按 Agent 生成可运行 HTML 原型。',
      });
    }
    return chips;
  }, [contextChips, attachments, chatMode]);

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
      await session.generate(intent, buildSendContext());
    },
    [input, session, buildSendContext]
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handlePickStarter = (prompt: string) => {
    if (!prompt) {
      setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }
    void handleSend(prompt);
  };

  const currentCode = session.currentVersion?.code ?? '';
  const isStreaming = session.status === 'streaming';
  const hasAny = session.hasHistory;
  const projectTitle = useMemo(
    () => deriveProjectTitle(session.messages),
    [session.messages]
  );

  const handleGoHome = useCallback(() => {
    if (isStreaming) {
      toast.info('生成中无法切换，请先停止');
      return;
    }
    session.goHome();
    setInput('');
    setAttachments([]);
    setShowCode(false);
    refreshRecentApps();
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [session, refreshRecentApps, isStreaming]);

  const handleSwitchApp = useCallback(
    (appId: string) => {
      if (isStreaming) {
        toast.info('生成中无法切换，请先停止');
        return;
      }
      const ok = session.loadApp(appId);
      if (!ok) {
        toast.error('找不到该应用，可能已被清理');
        refreshRecentApps();
        return;
      }
      setInput('');
      setAttachments([]);
      setShowCode(false);
      refreshRecentApps();
    },
    [session, refreshRecentApps, isStreaming]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'flex h-full w-full max-w-none flex-col gap-0 border-l p-0 sm:max-w-none',
          !hasAny && 'bg-[hsl(210_20%_98%)]'
        )}
        style={{ width: hasAny ? 'min(96vw, 1280px)' : 'min(96vw, 1080px)' }}
      >
        <SheetTitle className="sr-only">一句话生成应用</SheetTitle>
        <SheetDescription className="sr-only">
          全局 AI 副驾：输入一句话生成可运行的前端原型，并通过多轮对话持续优化代码。
        </SheetDescription>

        {hasAny ? (
          <>
            <MiaodaWorkspaceHeader
              projectTitle={projectTitle}
              recentApps={recentApps}
              currentAppId={session.appId}
              showCode={showCode}
              onToggleCode={() => setShowCode((v) => !v)}
              onGoHome={handleGoHome}
              onSwitchApp={handleSwitchApp}
              isStreaming={isStreaming}
              canReset
              onReset={() => {
                if (window.confirm('确认清空当前会话？此操作不可撤销。')) {
                  session.goHome();
                  setInput('');
                  setAttachments([]);
                  setShowCode(false);
                  refreshRecentApps();
                }
              }}
            />

            <div className="flex min-h-0 flex-1">
              {/* 左侧：妙搭对话区 + 底部输入 */}
              <div className="flex w-[min(100%,400px)] shrink-0 flex-col border-r border-[hsl(214_32%_91%)] sm:w-[38%] sm:max-w-[420px]">
                <ChatPane
                  messages={session.messages}
                  status={session.status}
                  versions={session.versions}
                  currentVersionId={session.currentVersion?.id ?? null}
                  errorMessage={session.errorMessage}
                  onRetry={session.retry}
                  onPickVersion={session.pickVersion}
                  onViewCode={() => setShowCode(true)}
                />
                <MiaodaChatComposer
                  value={input}
                  onChange={setInput}
                  onKeyDown={handleKeyDown}
                  onSend={() => void handleSend()}
                  onAbort={session.abort}
                  isStreaming={isStreaming}
                  disabled={isStreaming}
                  textareaRef={textareaRef}
                  chatMode={chatMode}
                  onChatModeChange={setChatMode}
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                />
              </div>

              {/* 右侧：预览 / 代码 */}
              <div className="flex min-w-0 flex-1 flex-col">
                {showCode ? (
                  <CodePane
                    code={currentCode}
                    versionSeq={session.currentVersion?.seq}
                    bytes={session.currentVersion?.bytes}
                  />
                ) : (
                  <PreviewPane
                    code={currentCode}
                    status={session.status}
                    device={session.device}
                    theme={session.theme}
                    onDeviceChange={session.setDevice}
                    onThemeChange={session.setTheme}
                    showCode={showCode}
                    onToggleCode={() => setShowCode((v) => !v)}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <PromptStarter
            input={input}
            onInputChange={setInput}
            onKeyDown={handleKeyDown}
            onSend={() => void handleSend()}
            onPick={handlePickStarter}
            disabled={isStreaming}
            textareaRef={textareaRef}
            routeLabel={routeChip?.label ?? null}
            recentApps={recentApps}
            onSwitchApp={handleSwitchApp}
            chatMode={chatMode}
            onChatModeChange={setChatMode}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
