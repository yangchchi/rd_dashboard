'use client';

import type { AppGenShowcasePreview } from '@/lib/app-gen-types';
import { cn } from '@/lib/utils';

interface ShowcasePreviewProps {
  variant: AppGenShowcasePreview;
  className?: string;
}

/** 固定高度预览区（纯 CSS mock） */
export function ShowcasePreview({ variant, className }: ShowcasePreviewProps) {
  return (
    <div
      className={cn(
        'h-[100px] w-full shrink-0 overflow-hidden rounded-t-xl border-b border-border/60 bg-muted/30',
        className
      )}
    >
      {variant === 'todo' && (
        <div className="flex h-full flex-col gap-1.5 bg-slate-900 p-2.5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div className="h-3 w-3 rounded border border-slate-500" />
              <div className="h-2 flex-1 rounded bg-slate-700" />
            </div>
          ))}
        </div>
      )}

      {variant === 'calendar' && (
        <div className="flex h-full gap-1.5 bg-slate-50 p-2">
          <div className="w-1/3 space-y-1">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-2 rounded bg-blue-100" />
            ))}
          </div>
          <div className="grid flex-1 grid-cols-3 grid-rows-2 gap-0.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-sm',
                  i === 2 ? 'bg-[hsl(217_91%_60%/0.35)]' : 'bg-white border border-slate-200'
                )}
              />
            ))}
          </div>
        </div>
      )}

      {variant === 'table' && (
        <div className="flex h-full flex-col gap-1 bg-white p-2">
          <div className="h-4 rounded bg-slate-100" />
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex gap-1">
              <div className="h-2 w-1/4 rounded bg-slate-50" />
              <div className="h-2 flex-1 rounded bg-slate-50" />
            </div>
          ))}
        </div>
      )}

      {variant === 'wizard' && (
        <div className="flex h-full flex-col gap-2 bg-slate-50 p-2.5">
          <div className="flex justify-center gap-1">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={cn(
                  'h-1.5 w-6 rounded-full',
                  n === 2 ? 'bg-[hsl(270_60%_55%)]' : 'bg-slate-200'
                )}
              />
            ))}
          </div>
          <div className="flex-1 rounded-md border border-slate-200 bg-white" />
        </div>
      )}

      {variant === 'dashboard' && (
        <div className="flex h-full flex-col gap-1.5 bg-slate-50 p-2">
          <div className="grid grid-cols-3 gap-1">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-6 rounded bg-white border border-slate-200" />
            ))}
          </div>
          <div className="flex flex-1 items-end gap-0.5 rounded-md border border-slate-200 bg-white p-1.5">
            {[35, 55, 40, 70, 50].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-orange-400/60"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {variant === 'login' && (
        <div className="flex h-full bg-white">
          <div className="w-2/5 bg-gradient-to-b from-green-100 to-emerald-50" />
          <div className="flex flex-1 flex-col gap-1 p-2">
            <div className="flex gap-1">
              <div className="h-2 w-8 rounded bg-green-500/30" />
              <div className="h-2 w-8 rounded bg-slate-100" />
            </div>
            <div className="mt-1 h-2 rounded bg-slate-100" />
            <div className="h-2 rounded bg-slate-50" />
            <div className="mt-auto h-4 rounded bg-[hsl(142_71%_45%/0.35)]" />
          </div>
        </div>
      )}
    </div>
  );
}
