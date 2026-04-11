import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const menuContentClass =
  'bg-black/90 border border-white/10 backdrop-blur-xl rounded-2xl min-w-[10rem] p-1 shadow-lg';

const itemDefaultClass =
  'text-white/70 hover:text-white hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer rounded-lg';

const itemDestructiveClass =
  'text-red-400 hover:text-red-300 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-300 cursor-pointer rounded-lg';

export type ListRowExtraAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
};

export interface ListRowActionsMenuProps {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** 插在「编辑」与分隔线之间，例如：提交审核、通过/驳回等 */
  extraActions?: ListRowExtraAction[];
  /** 用于看板卡片等整块可点击区域，避免点「⋯」时触发行/卡片点击 */
  stopPropagation?: boolean;
  align?: 'start' | 'center' | 'end';
  triggerClassName?: string;
}

export function ListRowActionsMenu({
  onView,
  onEdit,
  onDelete,
  extraActions = [],
  stopPropagation = false,
  align = 'end',
  triggerClassName,
}: ListRowActionsMenuProps) {
  const stop = (e: React.SyntheticEvent) => {
    if (stopPropagation) e.stopPropagation();
  };

  const run =
    (fn: () => void) =>
    (e: React.MouseEvent) => {
      e.stopPropagation();
      fn();
    };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="操作"
          className={cn(
            'h-8 w-8 shrink-0 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent data-[state=open]:bg-accent',
            triggerClassName
          )}
          onClick={stop}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={menuContentClass} onClick={stop}>
        <DropdownMenuItem onClick={run(onView)} className={itemDefaultClass}>
          <Eye className="mr-2 h-4 w-4" />
          查看详情
        </DropdownMenuItem>
        <DropdownMenuItem onClick={run(onEdit)} className={itemDefaultClass}>
          <Edit className="mr-2 h-4 w-4" />
          编辑
        </DropdownMenuItem>
        {extraActions.map((action) => (
          <DropdownMenuItem
            key={action.key}
            disabled={action.disabled}
            onClick={run(action.onClick)}
            className={action.variant === 'destructive' ? itemDestructiveClass : itemDefaultClass}
          >
            <span className="mr-2 inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
              {action.icon}
            </span>
            {action.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem onClick={run(onDelete)} className={itemDestructiveClass}>
          <Trash2 className="mr-2 h-4 w-4" />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
