'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * 与「赏金猎场」页头一致：主色线性图标与标题同一行（`flex items-center gap-2`），副标题在标题下方左对齐；副说明统一单行省略，与各模块一致。
 */
export type RdPageModuleHeadingProps = {
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
  /** 置于图标列左侧，如返回按钮 */
  leading?: ReactNode;
  /** 紧跟副标题后的补充行（小号字），仍在标题列内对齐 */
  footer?: ReactNode;
};

export function RdPageModuleHeading({
  icon: Icon,
  title,
  description,
  leading,
  footer,
}: RdPageModuleHeadingProps) {
  const body = (
    <div className="min-w-0 flex-1">
      <h1 className="rd-page-title flex items-center gap-2">
        <Icon className="h-6 w-6 shrink-0 stroke-[1.75] text-primary" aria-hidden />
        <span className="min-w-0">{title}</span>
      </h1>
      <p
        className="rd-page-desc mt-1"
        {...(typeof description === 'string' ? { title: description } : {})}
      >
        {description}
      </p>
      {footer}
    </div>
  );

  if (leading) {
    return (
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 shrink-0">{leading}</div>
        {body}
      </div>
    );
  }

  return <div className="flex min-w-0 flex-1 items-start">{body}</div>;
}
