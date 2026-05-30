'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RdPageModuleHeading } from '@/components/rd-page-module-heading';
import {
  ArrowUpRight,
  Bot,
  ChevronDown,
  FileText,
  Filter,
  LayoutDashboard,
  Plus,
  Rocket,
  Search,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useRequirementsList } from '@/lib/rd-hooks';
import type { IRequirement } from '@/lib/rd-types';
import { getCurrentUser, updateStoredCurrentUser } from '@/lib/auth';
import { authApi } from '@/lib/auth-api';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error';
import { REQUIREMENT_KANBAN_COLUMNS } from '@/lib/requirement-status-present';

const ROLE_SELECTED_ONCE_PREFIX = '__rd_role_selected_once_';

const ROLE_OPTIONS = [
  {
    roleId: 'role_pm',
    title: '产品经理',
    description: '侧重需求分析、PRD与跨角色协同。',
  },
  {
    roleId: 'role_tm',
    title: '技术经理',
    description: '侧重技术规格、交付质量与工程治理。',
  },
  {
    roleId: 'role_stakeholder',
    title: '干系人',
    description: '侧重需求发起与验收反馈，参与闭环协作。',
  },
] as const;

type LeaderboardActor = { id?: string | null; name?: string | null };
type LeaderboardRow = { actorKey: string; actorLabel: string; count: number; coins: number };
type LeaderboardGroup = { title: string; subtitle: string; rows: LeaderboardRow[] };

function normalizeActorLabel(actor: LeaderboardActor): string {
  const n = actor.name?.trim();
  if (n) return n;
  const id = actor.id?.trim();
  if (!id) return '未知用户';
  return id;
}

function normalizeActorKey(actor: LeaderboardActor): string {
  const id = actor.id?.trim();
  const name = actor.name?.trim();
  return id ? `id:${id}` : `name:${name || '未知用户'}`;
}

function buildRankingAgg(
  reqs: IRequirement[],
  pickActor: (r: IRequirement) => LeaderboardActor | null,
  coinsFor: (r: IRequirement) => number
): LeaderboardRow[] {
  const map = new Map<string, { label: string; count: number; coins: number }>();
  for (const r of reqs) {
    const actor = pickActor(r);
    if (!actor) continue;
    const actorKey = normalizeActorKey(actor);
    const actorLabel = normalizeActorLabel(actor);
    const cur = map.get(actorKey) ?? { label: actorLabel, count: 0, coins: 0 };
    cur.count += 1;
    cur.coins += coinsFor(r);
    map.set(actorKey, cur);
  }
  return Array.from(map.entries())
    .map(([actorKey, v]) => ({ actorKey, actorLabel: v.label, count: v.count, coins: v.coins }))
    .sort((a, b) => b.count - a.count || b.coins - a.coins);
}

function pickAcceptedRoleActor(r: IRequirement, role: 'pm' | 'tm'): LeaderboardActor | null {
  const accepted = (r.taskAcceptances ?? []).find((x) => x.role === role);
  const fallbackId = role === 'pm' ? r.pm : r.tm;
  const id = accepted?.userId?.trim() || fallbackId?.trim();
  const name = accepted?.userName?.trim();
  if (!id && !name) return null;
  return { id, name };
}

type FilterType = 'all' | 'mine' | 'submitted';

const STATUS_TONES: Record<IRequirement['status'], { color: string; label: string }> = {
  backlog: { color: '#64748b', label: '需求池' },
  prd_writing: { color: '#0b57d0', label: 'PRD编写' },
  spec_defining: { color: '#5b5ce2', label: '规格定义' },
  ai_developing: { color: '#7c43bd', label: 'AI开发' },
  pending_acceptance: { color: '#b06000', label: '待验收' },
  released: { color: '#0b7d53', label: '已发布' },
};

function DashboardSurface({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[24px] bg-card/95 shadow-[0_18px_46px_rgba(29,27,32,0.085)] ring-1 ring-[#e8def8]/30 dark:bg-card/95 dark:shadow-[0_24px_64px_rgba(0,0,0,0.34)] dark:ring-[#263454]/28 ${className}`}
    >
      {children}
    </section>
  );
}

function DashboardCardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-5 px-6 pb-3.5 pt-5">
      <div>
        <h2 className="text-lg font-semibold leading-tight tracking-normal text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function LeaderboardGroupCard({ group }: { group: LeaderboardGroup }) {
  const rows = group.rows;
  const rankTones = [
    'bg-amber-300 text-amber-950 dark:bg-amber-400/85 dark:text-amber-950',
    'bg-slate-300 text-slate-900 dark:bg-slate-300/80 dark:text-slate-950',
    'bg-orange-300 text-orange-950 dark:bg-orange-400/80 dark:text-orange-950',
  ];
  return (
    <div className="flex min-h-[360px] flex-col rounded-[20px] bg-[#f5eff7]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:bg-[#11192b]/90 dark:shadow-[inset_0_1px_0_rgba(116,139,190,0.10)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">{group.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{group.subtitle}</p>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-extrabold text-[#21005d] dark:text-foreground">
          {rows.length} 人
        </span>
      </div>
      {rows.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {rows.map((row, index) => (
            <div
              key={row.actorKey}
              className="grid min-h-[58px] grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] bg-[#fffbff]/92 px-3.5 py-2.5 shadow-[0_7px_18px_rgba(29,27,32,0.055)] dark:bg-[#182238]/90 dark:shadow-[0_10px_24px_rgba(0,0,0,0.22)]"
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-[12px] text-xs font-extrabold ${rankTones[index] ?? 'bg-secondary text-secondary-foreground'}`}>
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{row.actorLabel}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{row.count} 条需求</p>
              </div>
              <div className="text-right">
                <p className="text-base font-extrabold tabular-nums text-foreground">{row.coins}</p>
                <p className="text-[10px] text-muted-foreground">金币</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-[14px] bg-[#fffbff]/92 px-3 py-3 text-sm text-muted-foreground shadow-[0_7px_18px_rgba(29,27,32,0.055)] dark:bg-[#182238]/90 dark:shadow-[0_10px_24px_rgba(0,0,0,0.22)]">暂无排行数据</p>
      )}
    </div>
  );
}

const DashboardPage: React.FC = () => {
  const router = useRouter();
  const currentProfile = useCurrentUserProfile();
  const { data: requirements = [], isLoading } = useRequirementsList();
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<(typeof ROLE_OPTIONS)[number]['roleId'] | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user?.id) return;
    const selectedOnceKey = `${ROLE_SELECTED_ONCE_PREFIX}${user.id}`;
    const selectedOnce = localStorage.getItem(selectedOnceKey) === '1';
    if (selectedOnce) return;
    if ((user.accessRoleIds?.length ?? 0) > 0 || user.accessRoleId?.trim()) {
      localStorage.setItem(selectedOnceKey, '1');
      return;
    }
    setRoleDialogOpen(true);
  }, []);

  const confirmRoleSelection = async () => {
    const user = getCurrentUser();
    if (!user?.id || !selectedRole) return;
    setRoleSaving(true);
    try {
      const updatedUser = await authApi.updateUserAccessRoles(user.id, [selectedRole]);
      const ids = updatedUser.accessRoleIds?.length ? updatedUser.accessRoleIds : [selectedRole];
      updateStoredCurrentUser({
        accessRoleIds: ids,
        accessRoleId: updatedUser.accessRoleId ?? selectedRole,
      });
      sessionStorage.setItem('__global_rd_userRoles', JSON.stringify(ids));
      sessionStorage.setItem('__global_rd_userRole', updatedUser.accessRoleId ?? selectedRole);
      localStorage.setItem(`${ROLE_SELECTED_ONCE_PREFIX}${user.id}`, '1');
      setRoleDialogOpen(false);
      toast.success('角色已确认');
    } catch (e) {
      toastApiError(e, '角色保存失败，请重试');
    } finally {
      setRoleSaving(false);
    }
  };

  const filteredRequirements = useMemo(
    () => {
      const query = searchQuery.trim().toLowerCase();
      return requirements.filter((req) => {
        if (filter === 'mine') {
          if (req.pm !== currentProfile.user_id && req.tm !== currentProfile.user_id) return false;
        }
        if (filter === 'submitted') {
          if (req.submitter !== currentProfile.user_id) return false;
        }
        if (!query) return true;
        const searchable = [
          req.title,
          req.description,
          req.product,
          req.submitterName,
          req.id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchable.includes(query);
      });
    },
    [currentProfile.user_id, filter, requirements, searchQuery],
  );
  const getColumnCount = (status: IRequirement['status']) => {
    return filteredRequirements.filter((r) => r.status === status).length;
  };

  const rankingSubmitters = useMemo(
    () =>
      buildRankingAgg(
        filteredRequirements,
        (r) => {
          const sid = r.submitter?.trim();
          const sname = r.submitterName?.trim();
          if (!sid && !sname) return null;
          return { id: r.submitter, name: r.submitterName };
        },
        (r) => Number(r.bountyPoints ?? 0) || 0
      ),
    [filteredRequirements]
  );
  const rankingPmHunters = useMemo(
    () =>
      buildRankingAgg(
        filteredRequirements,
        (r) => pickAcceptedRoleActor(r, 'pm'),
        (r) => Number(r.pmCoins ?? 0) || 0
      ),
    [filteredRequirements]
  );
  const rankingTmHunters = useMemo(
    () =>
      buildRankingAgg(
        filteredRequirements,
        (r) => pickAcceptedRoleActor(r, 'tm'),
        (r) => Number(r.tmCoins ?? 0) || 0
      ),
    [filteredRequirements]
  );
  const leaderboardGroups = useMemo<LeaderboardGroup[]>(
    () => [
      { title: '金主', subtitle: '发起人', rows: rankingSubmitters },
      { title: '赏金猎人', subtitle: '产品经理', rows: rankingPmHunters },
      { title: '赏金猎人', subtitle: '技术经理', rows: rankingTmHunters },
    ],
    [rankingPmHunters, rankingSubmitters, rankingTmHunters]
  );
  const filterLabels: Record<FilterType, string> = {
    all: '全部需求',
    mine: '我负责的',
    submitted: '我提交的',
  };

  const statusCounts = REQUIREMENT_KANBAN_COLUMNS.reduce(
    (acc, column) => {
      acc[column.status] = getColumnCount(column.status);
      return acc;
    },
    {} as Record<IRequirement['status'], number>,
  );
  const activeTotal = filteredRequirements.length;
  const prdTotal = statusCounts.prd_writing + statusCounts.spec_defining;
  const aiTotal = statusCounts.ai_developing + statusCounts.pending_acceptance;
  const releasedTotal = statusCounts.released;
  const totalForRatio = Math.max(activeTotal, 1);
  const bountyOpenTotal = filteredRequirements.filter(
    (r) => Number(r.bountyPoints ?? 0) > 0 && (!r.pm || !r.tm),
  ).length;

  const summaryItems = [
    { value: activeTotal, label: '活跃需求', note: '当前筛选范围' },
    { value: prdTotal, label: 'PRD与规格', note: '文档沉淀阶段' },
    { value: aiTotal, label: 'AI交付中', note: '开发与验收阶段' },
    { value: releasedTotal, label: '已发布', note: '已完成交付' },
  ];

  const stageDistribution = [
    { label: 'PRD编写', count: prdTotal, color: '#0b57d0' },
    { label: 'AI开发', count: aiTotal, color: '#7c43bd' },
    { label: '需求池', count: statusCounts.backlog, color: '#b06000' },
    { label: '已发布', count: releasedTotal, color: '#0b7d53' },
  ];

  const flowLanes: Array<{
    title: string;
    statuses: IRequirement['status'][];
    empty: string;
  }> = [
    { title: '待澄清', statuses: ['backlog'], empty: '暂无待澄清需求' },
    { title: '文档与规格', statuses: ['prd_writing', 'spec_defining'], empty: '暂无文档任务' },
    { title: 'AI交付', statuses: ['ai_developing', 'pending_acceptance', 'released'], empty: '暂无交付任务' },
  ];

  const focusItems = [
    {
      icon: FileText,
      marker: 'P',
      color: '#0b57d0',
      title: `${prdTotal} 个 PRD/规格等待推进`,
      copy: '优先处理文档、规格和跨角色评审，减少后续 AI 交付返工。',
      action: '进入',
      href: '/prd',
    },
    {
      icon: Bot,
      marker: 'A',
      color: '#7c43bd',
      title: `${statusCounts.ai_developing} 条 AI 流水线生成中`,
      copy: '关注生成、下载和验收状态，把异常任务集中处理。',
      action: '查看',
      href: '/ai-pipeline',
    },
    {
      icon: Trophy,
      marker: 'B',
      color: '#b06000',
      title: `${bountyOpenTotal} 条赏金需求待领取`,
      copy: '把可领取任务前置，帮助 PM/TM 快速进入协同流程。',
      action: '处理',
      href: '/bounty-hunt',
    },
  ];

  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center min-h-[320px] text-muted-foreground text-sm">
        加载需求数据…
      </div>
    );
  }

  return (
    <>
      <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
        <header className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="rd-page-header-lead">
            <RdPageModuleHeading
              icon={LayoutDashboard}
              title="智研看板"
              description="六阶段泳道全局视图，拖拽变更状态；按角色快速筛选我提交的、我负责或全部需求。"
            />
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <label className="hidden h-12 w-[360px] items-center gap-3 rounded-[28px] bg-muted px-[18px] text-sm text-muted-foreground transition-colors focus-within:bg-secondary/70 focus-within:text-foreground xl:flex">
              <Search className="h-5 w-5 shrink-0" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索需求、PRD、流水线"
                aria-label="搜索需求、PRD、流水线"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 rounded-[20px] bg-secondary px-[18px] text-sm font-bold text-secondary-foreground shadow-none"
                >
                  <Filter className="w-4 h-4" />
                  {filterLabels[filter]}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-0 bg-popover text-popover-foreground shadow-sm">
                <DropdownMenuItem
                  onClick={() => setFilter('all')}
                  className="focus:bg-accent focus:text-accent-foreground"
                >
                  全部需求
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setFilter('mine')}
                  className="focus:bg-accent focus:text-accent-foreground"
                >
                  我负责的
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setFilter('submitted')}
                  className="focus:bg-accent focus:text-accent-foreground"
                >
                  我提交的
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              onClick={() => router.push('/requirements/new')}
              className="h-10 rounded-[20px] px-[18px] text-sm font-bold shadow-none"
            >
              <Plus className="w-4 h-4 mr-1" />
              新建需求
            </Button>
          </div>
        </header>

        <DashboardSurface className="mb-6 min-h-[98px] bg-[linear-gradient(135deg,rgba(234,221,255,0.96),rgba(159,242,230,0.72))] p-4 text-[#21005d] shadow-[0_10px_28px_rgba(103,80,164,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[560px]">
              {summaryItems.map((item) => (
                <div key={item.label} className="min-h-16 rounded-2xl bg-white/60 p-3">
                  <div className="text-[20px] font-semibold leading-none">{item.value}</div>
                  <div className="mt-1.5 text-[12px] font-bold text-[#21005d]/75">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="flex min-w-[220px] flex-1 flex-col items-start gap-2 lg:items-end lg:text-right">
              <h2 className="max-w-[420px] text-[16px] font-semibold leading-snug tracking-normal">
                研发效能监控与 AI 交付协同
              </h2>
              <div className="inline-flex h-7 items-center gap-1.5 rounded-2xl bg-white/55 px-3 text-[11px] font-bold">
                <Sparkles className="h-3.5 w-3.5" />
                AI 摘要已更新
              </div>
            </div>
          </div>
        </DashboardSurface>

        <DashboardSurface className="mb-6">
          <DashboardCardHeader title="需求排行榜" description="金主 / 产品经理 / 技术经理" />
          <div className="grid grid-cols-1 gap-3.5 px-6 pb-6 lg:grid-cols-3">
            {leaderboardGroups.map((group) => (
              <LeaderboardGroupCard key={`${group.title}-${group.subtitle}`} group={group} />
            ))}
          </div>
        </DashboardSurface>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <div className="min-w-0">
            <DashboardSurface>
              <DashboardCardHeader
                title="需求流程看板"
                description="从原始多列看板收敛为三个主要阶段，保留代表性需求。"
                action={
                  <button
                    type="button"
                    onClick={() => router.push('/requirements')}
                    className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-bold text-primary"
                  >
                    查看全部
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                }
              />

              <div className="grid grid-cols-1 gap-3.5 px-6 pb-6 lg:grid-cols-3">
                {flowLanes.map((lane) => {
                  const laneCount = lane.statuses.reduce((sum, status) => sum + statusCounts[status], 0);
                  const laneItems = filteredRequirements
                    .filter((r) => lane.statuses.includes(r.status))
                    .slice(0, 2);
                  return (
                    <div key={lane.title} className="min-h-[416px] rounded-2xl bg-muted p-[18px]">
                      <div className="mb-4 flex items-center justify-between text-[13px] font-extrabold uppercase tracking-[0.03em] text-muted-foreground">
                        <span>{lane.title}</span>
                        <span className="grid h-6 min-w-7 place-items-center rounded-xl bg-secondary px-2 text-xs text-[#21005d]">
                          {laneCount}
                        </span>
                      </div>

                      {laneItems.length > 0 ? (
                        laneItems.map((req) => {
                          const tone = STATUS_TONES[req.status];
                          return (
                            <article key={req.id} className="mb-3 rounded-xl bg-white p-4 shadow-none">
                              <div className="text-sm font-bold leading-snug text-foreground">{req.title}</div>
                              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                {req.description}
                              </p>
                              <div className="mt-3.5 flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
                                <span>{req.expectedDate || tone.label}</span>
                                <span style={{ color: Number(req.bountyPoints ?? 0) > 0 ? '#8b5000' : tone.color }}>
                                  {Number(req.bountyPoints ?? 0) > 0
                                    ? `${req.bountyPoints} 金币`
                                    : tone.label}
                                </span>
                              </div>
                            </article>
                          );
                        })
                      ) : (
                        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-border/45 text-sm text-muted-foreground">
                          {lane.empty}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </DashboardSurface>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <DashboardSurface>
              <DashboardCardHeader title="阶段分布" />
              <div>
                {stageDistribution.map((item) => {
                  const fill = Math.round((item.count / totalForRatio) * 100);
                  return (
                    <div
                      key={item.label}
                      className="grid grid-cols-[136px_minmax(0,1fr)_40px] items-center gap-4 border-t border-border/25 px-6 py-4"
                    >
                      <div className="flex items-center gap-2.5 text-sm font-bold text-foreground">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.label}
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[#e6e0e9] dark:bg-slate-700/45">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${fill}%`, backgroundColor: item.color }}
                        />
                      </div>
                      <div className="text-right text-sm font-bold text-muted-foreground">{item.count}</div>
                    </div>
                  );
                })}
              </div>
            </DashboardSurface>

            <DashboardSurface>
              <DashboardCardHeader title="待处理" description="把最可能点击的下一步集中展示。" />
              <div className="px-6 pb-6">
                {focusItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.marker}
                      type="button"
                      onClick={() => router.push(item.href)}
                      className="grid w-full grid-cols-[36px_minmax(0,1fr)_auto] gap-3.5 border-t border-border/25 py-4 text-left"
                    >
                      <span
                        className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-extrabold text-white"
                        style={{ backgroundColor: item.color }}
                      >
                        {item.marker}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-bold leading-snug text-foreground">
                          <Icon className="h-4 w-4 shrink-0" style={{ color: item.color }} />
                          {item.title}
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.copy}</span>
                      </span>
                      <span className="text-xs font-bold text-primary">{item.action}</span>
                    </button>
                  );
                })}
              </div>
            </DashboardSurface>

            <DashboardSurface>
              <DashboardCardHeader title="AI交付引擎" description="流水线作为持续状态，而不是抢占主看板。" />
              <div className="px-6 pb-6">
                {filteredRequirements.filter((r) => r.status === 'ai_developing').slice(0, 2).length > 0 ? (
                  filteredRequirements
                    .filter((r) => r.status === 'ai_developing')
                    .slice(0, 2)
                    .map((req) => (
                      <div key={req.id} className="border-t border-border/25 py-[18px]">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-bold text-foreground">{req.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">代码生成中</div>
                          </div>
                          <div className="text-[13px] font-extrabold text-foreground">12%</div>
                        </div>
                        <div className="mt-3.5 h-2.5 overflow-hidden rounded-full bg-[#e6e0e9] dark:bg-slate-700/45">
                          <span className="block h-full w-[12%] rounded-full bg-[#7c43bd]" />
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="border-t border-border/25 py-6 text-sm text-muted-foreground">暂无运行中的 AI 流水线</p>
                )}
              </div>
            </DashboardSurface>

          </div>
        </section>

        <button
          type="button"
          aria-label="新建需求"
          onClick={() => router.push('/requirements/new')}
          className="fixed bottom-8 right-8 z-20 grid h-16 w-16 place-items-center rounded-2xl bg-secondary text-[#21005d] shadow-[0_8px_18px_rgba(29,27,32,0.10)]"
        >
          <Rocket className="h-6 w-6" />
        </button>
      </div>

      <Dialog
        open={roleDialogOpen}
        onOpenChange={(open) => {
          if (open) setRoleDialogOpen(true);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-xl border-0"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>请选择你的角色</DialogTitle>
            <DialogDescription>
              首次登录需要确认一次角色身份。该选择仅可提交一次，提交后下次登录将不再提示。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {ROLE_OPTIONS.map((item) => {
              const active = selectedRole === item.roleId;
              return (
                <button
                  key={item.roleId}
                  type="button"
                  onClick={() => setSelectedRole(item.roleId)}
                  disabled={roleSaving}
                  className={`w-full rounded-2xl border-0 p-4 text-left transition ${
                    active
                      ? 'bg-secondary ring-1 ring-primary/35'
                      : 'bg-card hover:bg-accent'
                  }`}
                  aria-pressed={active}
                >
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                </button>
              );
            })}
          </div>

          <DialogFooter>
            <Button type="button" onClick={confirmRoleSelection} disabled={!selectedRole || roleSaving}>
              {roleSaving ? '保存中...' : '确认角色'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DashboardPage;
