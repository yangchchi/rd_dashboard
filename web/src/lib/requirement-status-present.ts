import type { RequirementStatus } from '@/lib/rd-types';

/** 六阶段研发状态：与 AGENTS.md / tailwind-theme --status-* 一致 */
export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  backlog: '需求池',
  prd_writing: 'PRD编写中',
  spec_defining: '规格定义',
  ai_developing: 'AI开发中',
  pending_acceptance: '待验收',
  released: '已发布',
};

export type RequirementStatusPresentation = {
  label: string;
  /** Badge 正文色（深浅主题可读） */
  textColor: string;
  badgeBg: string;
  /** 圆点 / 左侧色条（Tailwind bg-*） */
  dotColor: string;
  /** 泳道统计卡片上的小标题强调色 */
  columnAccentClass: string;
};

const STATUS_ORDER: RequirementStatus[] = [
  'backlog',
  'prd_writing',
  'spec_defining',
  'ai_developing',
  'pending_acceptance',
  'released',
];

const PRESENTATION: Record<RequirementStatus, RequirementStatusPresentation> = {
  backlog: {
    label: REQUIREMENT_STATUS_LABELS.backlog,
    textColor: 'text-slate-700 dark:text-slate-300',
    badgeBg: 'bg-slate-500/10',
    dotColor: 'bg-slate-500',
    columnAccentClass: 'text-slate-400',
  },
  prd_writing: {
    label: REQUIREMENT_STATUS_LABELS.prd_writing,
    textColor: 'text-blue-700 dark:text-blue-400',
    badgeBg: 'bg-blue-500/10',
    dotColor: 'bg-blue-500',
    columnAccentClass: 'text-blue-400',
  },
  spec_defining: {
    label: REQUIREMENT_STATUS_LABELS.spec_defining,
    textColor: 'text-indigo-700 dark:text-indigo-400',
    badgeBg: 'bg-indigo-500/10',
    dotColor: 'bg-indigo-500',
    columnAccentClass: 'text-indigo-400',
  },
  ai_developing: {
    label: REQUIREMENT_STATUS_LABELS.ai_developing,
    textColor: 'text-purple-700 dark:text-purple-400',
    badgeBg: 'bg-purple-500/10',
    dotColor: 'bg-purple-500',
    columnAccentClass: 'text-purple-400',
  },
  pending_acceptance: {
    label: REQUIREMENT_STATUS_LABELS.pending_acceptance,
    textColor: 'text-orange-700 dark:text-orange-400',
    badgeBg: 'bg-orange-500/10',
    dotColor: 'bg-orange-500',
    columnAccentClass: 'text-orange-400',
  },
  released: {
    label: REQUIREMENT_STATUS_LABELS.released,
    textColor: 'text-green-700 dark:text-green-400',
    badgeBg: 'bg-green-500/10',
    dotColor: 'bg-green-500',
    columnAccentClass: 'text-green-400',
  },
};

export function getRequirementStatusPresentation(status: string): RequirementStatusPresentation {
  const key = status as RequirementStatus;
  return PRESENTATION[key] ?? PRESENTATION.backlog;
}

export interface RequirementKanbanColumn {
  id: string;
  title: string;
  status: RequirementStatus;
  color: string;
  dotColor: string;
}

export const REQUIREMENT_KANBAN_COLUMNS: RequirementKanbanColumn[] = STATUS_ORDER.map((status) => {
  const p = PRESENTATION[status];
  return {
    id: status,
    title: p.label,
    status,
    color: p.columnAccentClass,
    dotColor: p.dotColor,
  };
});
