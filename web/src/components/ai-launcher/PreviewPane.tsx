'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Maximize2,
  Monitor,
  Moon,
  RotateCw,
  Smartphone,
  Sun,
  Tablet,
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
  isBridgeMessage,
  isLikelyCompleteHtml,
  wrapHtmlForSandbox,
} from '@/lib/app-gen-sandbox';

interface PreviewPaneProps {
  code: string;
  status: AppGenStatus;
  device: AppGenDevice;
  theme: AppGenTheme;
  onDeviceChange: (d: AppGenDevice) => void;
  onThemeChange: (t: AppGenTheme) => void;
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
}: PreviewPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const isReady = isLikelyCompleteHtml(code);
  const srcDoc = useMemo(
    () => (isReady ? wrapHtmlForSandbox(code, theme) : null),
    [code, isReady, theme]
  );

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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-1">
          {(['desktop', 'tablet', 'mobile'] as AppGenDevice[]).map((d) => {
            const Icon = d === 'desktop' ? Monitor : d === 'tablet' ? Tablet : Smartphone;
            return (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={device === d ? 'secondary' : 'ghost'}
                className={cn(
                  'h-7 gap-1 px-2 text-xs',
                  device === d && 'border border-primary/30 bg-primary/10 text-primary'
                )}
                onClick={() => onDeviceChange(d)}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{APP_GEN_DEVICE_WIDTH[d]}px</span>
              </Button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}
            title="切换主题"
          >
            {theme === 'light' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{theme === 'light' ? '亮色' : '暗色'}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setIframeKey((k) => k + 1)}
            title="刷新预览"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleScreenshot}
            disabled={!isReady}
            title="下载 HTML 备份"
          >
            <Camera className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              if (wrapperRef.current?.requestFullscreen) {
                void wrapperRef.current.requestFullscreen();
              }
            }}
            title="全屏预览"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div
        ref={wrapperRef}
        className="relative flex flex-1 min-h-0 items-start justify-center overflow-auto bg-muted/30 p-4"
      >
        {!isReady ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            {status === 'streaming' ? (
              <>
                <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-1/3 animate-pulse bg-primary/60" />
                </div>
                <span>正在生成应用结构…</span>
              </>
            ) : (
              <span>在右下角输入一句话开始</span>
            )}
          </div>
        ) : (
          <div
            className="bg-card shadow-sm transition-all"
            style={{
              width: `${APP_GEN_DEVICE_WIDTH[device]}px`,
              maxWidth: '100%',
              height: '100%',
              minHeight: '100%',
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
          </div>
        )}
      </div>
      <div className="border-t border-border bg-card">
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
