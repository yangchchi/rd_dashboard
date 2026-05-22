'use client';

import { cn } from '@/lib/utils';

/** 规格阶段进度条：无进度时整条灰色，有进度时蓝色填充 */
export function SpecPhaseProgress({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  const active = pct > 0;

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'relative h-1.5 w-full overflow-hidden rounded-full',
        active ? 'bg-primary/20' : 'bg-muted',
        className
      )}
    >
      <div
        className={cn('h-full transition-all duration-300', active ? 'bg-primary' : 'w-0 bg-transparent')}
        style={active ? { width: `${pct}%` } : undefined}
      />
    </div>
  );
}
