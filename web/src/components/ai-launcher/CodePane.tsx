'use client';

import { useMemo } from 'react';
import { Copy, Download, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { scanCodeWarnings } from '@/lib/app-gen-sandbox';

interface CodePaneProps {
  code: string;
  versionSeq?: number;
  bytes?: number;
}

const LEVEL_CLASS = {
  info: 'text-blue-500',
  warn: 'text-orange-500',
  danger: 'text-destructive',
} as const;

export function CodePane({ code, versionSeq, bytes }: CodePaneProps) {
  const warnings = useMemo(() => scanCodeWarnings(code), [code]);

  const handleCopy = async () => {
    if (!code) {
      toast.error('暂无可复制的代码');
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast.success('已复制 HTML 到剪贴板');
    } catch {
      toast.error('复制失败，请手动选中代码');
    }
  };

  const handleDownload = () => {
    if (!code) {
      toast.error('暂无可下载的代码');
      return;
    }
    try {
      const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `app-v${versionSeq ?? 1}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('已下载 HTML');
    } catch {
      toast.error('下载失败');
    }
  };

  const bytesText = bytes != null ? `${(bytes / 1024).toFixed(1)} KB` : '—';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono">
            v{versionSeq ?? '-'}
          </span>
          <span>{bytesText}</span>
          {warnings.length > 0 ? (
            <span className="flex items-center gap-1 text-orange-500">
              <ShieldAlert className="h-3.5 w-3.5" />
              {warnings.length} 提示
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!code}
            onClick={handleCopy}
          >
            <Copy className="h-3.5 w-3.5" />
            复制
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!code}
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
            下载
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-slate-950 text-slate-100">
        {code ? (
          <pre className="m-0 px-3 py-3 text-[12px] leading-5 font-mono">
            <code>{code}</code>
          </pre>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">
            等待 AI 生成…
          </div>
        )}
      </div>
      {warnings.length > 0 ? (
        <div className="border-t border-border bg-card px-3 py-2 text-[11px]">
          {warnings.map((w, idx) => (
            <div key={idx} className={cn('flex items-start gap-1', LEVEL_CLASS[w.level])}>
              <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
