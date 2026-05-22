'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Code2,
  Eye,
  Link2,
  Loader2,
  Maximize2,
  Monitor,
  Moon,
  Pencil,
  RotateCw,
  Smartphone,
  Sun,
  Tablet,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  APP_GEN_DEVICE_WIDTH,
  type AppGenDevice,
  type AppGenStatus,
  type AppGenTheme,
} from '@/lib/app-gen-types';
import {
  closeIncompleteHtml,
  isBridgeMessage,
  isLikelyCompleteHtml,
  wrapHtmlForSandbox,
} from '@/lib/app-gen-sandbox';

/** 流式期间 iframe srcDoc 重写节流（ms）：太短抖动，太长拖慢感知 */
const PROGRESSIVE_REFRESH_MS = 1200;

function formatBytes(n: number): string {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

interface PreviewPaneProps {
  code: string;
  status: AppGenStatus;
  device: AppGenDevice;
  theme: AppGenTheme;
  onDeviceChange: (d: AppGenDevice) => void;
  onThemeChange: (t: AppGenTheme) => void;
  showCode?: boolean;
  onToggleCode?: () => void;
}

interface ConsoleEntry {
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  ts: number;
}

const LEVEL_TEXT_CLASS: Record<ConsoleEntry['level'], string> = {
  log: 'text-muted-foreground',
  info: 'text-blue-500',
  warn: 'text-orange-500',
  error: 'text-destructive',
};

export function PreviewPane({
  code,
  status,
  device,
  theme,
  onDeviceChange,
  onThemeChange,
  showCode = false,
  onToggleCode,
}: PreviewPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const isComplete = isLikelyCompleteHtml(code);
  const isStreaming = status === 'streaming';
  const hasBody = useMemo(() => /<body/i.test(code), [code]);
  /** 已经能进入预览：要么完整 </html>，要么流式中已经有 <body> 可以渐进渲染 */
  const canShowIframe = isComplete || (isStreaming && hasBody);

  // 流式时按 1200ms 节流；完成时立刻刷新一次最终版本
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const lastFlushRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canShowIframe) {
      setSrcDoc(null);
      return;
    }
    if (isComplete) {
      // 完成态：丢弃节流计时器，立刻定稿
      if (pendingTimerRef.current != null) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      setSrcDoc(wrapHtmlForSandbox(code, theme));
      lastFlushRef.current = performance.now();
      return;
    }
    // 流式态：节流刷新
    const now = performance.now();
    const elapsed = now - lastFlushRef.current;
    const doFlush = () => {
      lastFlushRef.current = performance.now();
      setSrcDoc(wrapHtmlForSandbox(code, theme, { progressive: true }));
      pendingTimerRef.current = null;
    };
    if (elapsed >= PROGRESSIVE_REFRESH_MS || lastFlushRef.current === 0) {
      doFlush();
      return;
    }
    if (pendingTimerRef.current != null) return;
    const delay = Math.max(0, PROGRESSIVE_REFRESH_MS - elapsed);
    pendingTimerRef.current = window.setTimeout(doFlush, delay);
  }, [code, theme, isComplete, isStreaming, canShowIframe]);

  // 卸载时清理待执行的节流任务
  useEffect(
    () => () => {
      if (pendingTimerRef.current != null) window.clearTimeout(pendingTimerRef.current);
    },
    []
  );

  const sizeText = formatBytes(code.length);
  /** 是否已经发起过本轮生成（用于区分"从未生成"与"流式刚启动还没出 body"两种空态） */
  const hasAnyCode = code.length > 0;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isBridgeMessage(event.data)) return;
      const { level, payload, ts } = event.data;
      setConsoleEntries((prev) => {
        const next = [...prev, { level, message: payload, ts }];
        return next.length > 200 ? next.slice(-200) : next;
      });
      if (level === 'error') setConsoleOpen(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 每次切换主题或重新挂载，清空控制台历史
  useEffect(() => {
    setConsoleEntries([]);
  }, [iframeKey, theme]);

  const errorCount = consoleEntries.filter((c) => c.level === 'error').length;

  const handleScreenshot = async () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      // iframe 跨域不能直接 html2canvas；MVP 阶段在浏览器无原生 API。
      // 改为下载 HTML 文件作为备选（用户已有「下载」按钮，这里复用提示）。
      const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `app-${Date.now()}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/40">
      {/* 妙搭预览工具栏 */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium',
                !showCode
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted'
              )}
              onClick={() => showCode && onToggleCode?.()}
            >
              <Eye className="h-3.5 w-3.5" />
              预览
            </button>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium',
                showCode
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted'
              )}
              onClick={() => !showCode && onToggleCode?.()}
            >
              <Code2 className="h-3.5 w-3.5" />
              代码
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            {(['desktop', 'tablet', 'mobile'] as AppGenDevice[]).map((d) => {
              const Icon = d === 'desktop' ? Monitor : d === 'tablet' ? Tablet : Smartphone;
              return (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'h-7 gap-1 px-2 text-xs',
                    device === d && 'bg-muted text-primary'
                  )}
                  onClick={() => onDeviceChange(d)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{APP_GEN_DEVICE_WIDTH[d]}px</span>
                </Button>
              );
            })}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}
              title="切换主题"
            >
              {theme === 'light' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setIframeKey((k) => k + 1)}
              title="刷新预览"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={handleScreenshot}
              disabled={!isComplete}
              title="下载 HTML"
            >
              <Camera className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => {
                if (wrapperRef.current?.requestFullscreen) {
                  void wrapperRef.current.requestFullscreen();
                }
              }}
              title="全屏"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border px-3 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <Link2 className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {isStreaming ? '生成中…' : isComplete ? '刚刚更新' : '等待生成'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
            <button type="button" className="rounded p-1 hover:bg-muted" aria-label="编辑">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="rounded p-1 hover:bg-muted" aria-label="链接">
              <Link2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="rounded p-1 hover:bg-muted" aria-label="删除">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={wrapperRef}
        className="relative flex flex-1 min-h-0 items-start justify-center overflow-auto p-5"
      >
        {!canShowIframe ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            {isStreaming ? (
              <>
                <div className="flex items-center gap-2 text-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="font-medium">
                    {hasAnyCode ? '正在构建 HTML 结构…' : 'Ark 已开始响应…'}
                  </span>
                </div>
                <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-1/3 animate-pulse bg-primary/70" />
                </div>
                {hasAnyCode ? (
                  <span className="font-mono text-[11px] text-muted-foreground/80">
                    已生成 {sizeText}
                  </span>
                ) : null}
              </>
            ) : (
              <span>在右下角输入一句话开始</span>
            )}
          </div>
        ) : (
          <div
            className="relative overflow-hidden rounded-xl bg-card shadow-md transition-all"
            style={{
              width: `${APP_GEN_DEVICE_WIDTH[device]}px`,
              maxWidth: '100%',
              height: '100%',
              minHeight: 'min(100%, 720px)',
            }}
          >
            <iframe
              key={iframeKey}
              ref={iframeRef}
              title="HAI 一句话生成应用预览"
              sandbox="allow-scripts"
              srcDoc={srcDoc ?? undefined}
              className="block h-full w-full border-0"
            />
            {isStreaming && !isComplete ? (
              <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-primary/30 bg-card/95 px-2.5 py-1 text-[11px] font-medium text-primary shadow-sm backdrop-blur">
                <Loader2 className="h-3 w-3 animate-spin" />
                补全中 · {sizeText}
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border bg-card">
        <button
          type="button"
          onClick={() => setConsoleOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className={cn('h-3.5 w-3.5', errorCount > 0 ? 'text-destructive' : 'text-muted-foreground')} />
            控制台 ({consoleEntries.length})
            {errorCount > 0 ? (
              <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
                {errorCount} 错误
              </span>
            ) : null}
          </span>
          <span>{consoleOpen ? '收起' : '展开'}</span>
        </button>
        {consoleOpen ? (
          <div className="max-h-40 overflow-y-auto border-t border-border bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-300">
            {consoleEntries.length === 0 ? (
              <div className="text-slate-500">（暂无日志）</div>
            ) : (
              consoleEntries.map((c, idx) => (
                <div key={`${c.ts}-${idx}`} className="whitespace-pre-wrap break-all">
                  <span className="text-slate-500">[{new Date(c.ts).toLocaleTimeString()}]</span>{' '}
                  <span className={LEVEL_TEXT_CLASS[c.level]}>{c.level.toUpperCase()}</span>{' '}
                  <span>{c.message}</span>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
