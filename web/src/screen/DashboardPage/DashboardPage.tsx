'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Activity, Coins, Gauge, LayoutDashboard, Filter, Plus, ChevronDown, Trophy } from 'lucide-react';
import { RdPageModuleHeading } from '@/components/rd-page-module-heading';
import { usePipelineTasksList, useRequirementsList } from '@/lib/rd-hooks';
import type { IRequirement } from '@/lib/rd-types';
import { buildDashboardEfficiencyMetrics } from '@/lib/dashboard-metrics';
import { getCurrentUser, updateStoredCurrentUser } from '@/lib/auth';
import { authApi } from '@/lib/auth-api';
import { toast } from 'sonner';
import { REQUIREMENT_KANBAN_COLUMNS } from '@/lib/requirement-status-present';

const LEADERBOARD_TOP = 10;
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

/** PM/TM 列：数据库 pm/tm 为 NULL 且无领受记录可识别用户时，不参与排行榜（避免聚合成「未知用户」） */
function pickRoleActorForRanking(
  r: IRequirement,
  role: 'pm' | 'tm',
): LeaderboardActor | null {
  const rec = (r.taskAcceptances ?? []).find((x) => x.role === role);
  const columnId = role === 'pm' ? r.pm : r.tm;
  const resolvedId = columnId?.trim() || rec?.userId?.trim();
  const resolvedName = rec?.userName?.trim();
  if (!resolvedId && !resolvedName) return null;
  return {
    id: resolvedId || undefined,
    name: rec?.userName,
  };
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
    .sort((a, b) => b.count - a.count || b.coins - a.coins)
    .slice(0, LEADERBOARD_TOP);
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
  if (rank === 2) return 'bg-slate-400/15 text-slate-600 dark:text-slate-300 border-slate-400/30';
  if (rank === 3) return 'bg-orange-700/15 text-orange-700 dark:text-orange-400 border-orange-600/25';
  return 'bg-muted/50 text-muted-foreground border-border';
}

function LeaderboardTable({ rows, emptyLabel }: { rows: LeaderboardRow[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-xs font-medium text-muted-foreground">
        <span className="w-7 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">用户</span>
        <span className="w-12 shrink-0 text-right tabular-nums">需求数量</span>
        <span className="w-14 shrink-0 text-right tabular-nums">金币数量</span>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((row, i) => (
          <li key={row.actorKey} className="flex items-center gap-2 px-4 py-3 text-sm">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold tabular-nums ${rankBadgeClass(i + 1)}`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{row.actorLabel}</span>
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-foreground">
              {row.count}
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
              {row.coins}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

type FilterType = 'all' | 'mine' | 'submitted';

const DashboardPage: React.FC = () => {
  const router = useRouter();
  const currentProfile = useCurrentUserProfile();
  const { data: requirements = [], isLoading } = useRequirementsList();
  const { data: pipelineTasks = [] } = usePipelineTasksList();
  const [filter, setFilter] = useState<FilterType>('all');
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
      toast.error(e instanceof Error ? e.message : '角色保存失败，请重试');
    } finally {
      setRoleSaving(false);
    }
  };

  const filteredRequirements = useMemo(
    () =>
      requirements.filter((req) => {
        if (filter === 'mine') {
          return req.pm === currentProfile.user_id || req.tm === currentProfile.user_id;
        }
        if (filter === 'submitted') {
          return req.submitter === currentProfile.user_id;
        }
        return true;
      }),
    [currentProfile.user_id, filter, requirements],
  );
  const filteredRequirementIds = useMemo(
    () => new Set(filteredRequirements.map((requirement) => requirement.id)),
    [filteredRequirements],
  );
  const filteredPipelineTasks = useMemo(
    () => pipelineTasks.filter((task) => filteredRequirementIds.has(task.requirementId)),
    [filteredRequirementIds, pipelineTasks],
  );
  const efficiencyMetrics = useMemo(
    () => buildDashboardEfficiencyMetrics(filteredRequirements, filteredPipelineTasks),
    [filteredPipelineTasks, filteredRequirements],
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
  const rankingPm = useMemo(
    () =>
      buildRankingAgg(
        filteredRequirements,
        (r) => pickRoleActorForRanking(r, 'pm'),
        (r) => (r.status === 'released' ? Number(r.pmCoins ?? 0) || 0 : 0)
      ),
    [filteredRequirements]
  );
  const rankingTm = useMemo(
    () =>
      buildRankingAgg(
        filteredRequirements,
        (r) => pickRoleActorForRanking(r, 'tm'),
        (r) => (r.status === 'released' ? Number(r.tmCoins ?? 0) || 0 : 0)
      ),
    [filteredRequirements]
  );

  const filterLabels: Record<FilterType, string> = {
    all: '全部需求',
    mine: '我负责的',
    submitted: '我提交的',
  };

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
        <section className="mb-8 flex w-full flex-wrap items-center justify-between gap-4">
          <div className="rd-page-header-lead min-w-0">
            <RdPageModuleHeading
              icon={LayoutDashboard}
              title="智研看板"
              description="研发效能监控与分析"
            />
          </div>

          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-border bg-muted/30 text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <Filter className="w-4 h-4" />
                  {filterLabels[filter]}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-border bg-popover text-popover-foreground">
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
              size="sm"
              onClick={() => router.push('/requirements/new')}
              className="rounded-lg font-medium shadow-sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              新建需求
            </Button>
          </div>
        </section>

        <section className="w-full">
          <p className="text-sm text-muted-foreground mb-4">
            统计范围：共 <span className="font-medium text-foreground">{filteredRequirements.length}</span> 条需求
          </p>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">自动化覆盖率</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{efficiencyMetrics.automationCoverage}%</p>
                  </div>
                  <Gauge className="h-5 w-5 text-primary" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {filteredPipelineTasks.length} 条流水线覆盖 {efficiencyMetrics.totalRequirements} 条需求
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">平均质量分</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{efficiencyMetrics.averageQualityScore}</p>
                  </div>
                  <Activity className="h-5 w-5 text-indigo-500" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  综合规格一致性、API覆盖、代码质量与测试通过率
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">测试通过率</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{efficiencyMetrics.testPassRate}%</p>
                  </div>
                  <Trophy className="h-5 w-5 text-green-600" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  已入库流水线测试报告的通过用例占比
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">估算 AI 成本</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">¥{efficiencyMetrics.estimatedAiCost}</p>
                  </div>
                  <Coins className="h-5 w-5 text-amber-600" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  基于日志、质量评估和测试报告数量的粗略估算
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {REQUIREMENT_KANBAN_COLUMNS.map((column) => {
              const count = getColumnCount(column.status);
              const percentage =
                filteredRequirements.length > 0
                  ? Math.round((count / filteredRequirements.length) * 100)
                  : 0;

              return (
                <Card
                  key={column.id}
                  className="group overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm transition-colors duration-200 hover:border-primary/25 hover:shadow-md"
                >
                  <div className={`h-1.5 ${column.dotColor}`} />
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-3xl font-black tracking-tighter text-foreground transition-colors group-hover:text-primary">
                          {count}
                        </p>
                        <p className={`text-[10px] uppercase tracking-widest font-bold mt-1 ${column.color}`}>
                          {column.title}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-muted-foreground">{percentage}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mt-10 w-full">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-primary/10">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">需求排行榜</h2>
              <p className="text-sm text-muted-foreground">
                与上方统计共用当前筛选；按需求条数降序，金币列实时累加（提交人累计设定金币；PM/TM
                仅统计已发布需求的角色份额）。最多各展示 {LEADERBOARD_TOP} 名。
              </p>
            </div>
          </div>

          <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="rd-surface-card rd-surface-card-hover min-w-0 overflow-hidden border-border">
              <CardHeader className="border-b border-border/80 pb-3">
                <CardTitle className="text-base">金主（发起人）</CardTitle>
                <CardDescription>每条需求计 1；金币为 bounty 累计</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <LeaderboardTable rows={rankingSubmitters} emptyLabel="暂无数据" />
              </CardContent>
            </Card>

            <Card className="rd-surface-card rd-surface-card-hover min-w-0 overflow-hidden border-border">
              <CardHeader className="border-b border-border/80 pb-3">
                <CardTitle className="text-base">赏金猎人（产品经理）</CardTitle>
                <CardDescription>已发布需求累计 PM 份额金币</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <LeaderboardTable rows={rankingPm} emptyLabel="暂无已认领 PM 的需求" />
              </CardContent>
            </Card>

            <Card className="rd-surface-card rd-surface-card-hover min-w-0 overflow-hidden border-border">
              <CardHeader className="border-b border-border/80 pb-3">
                <CardTitle className="text-base">赏金猎人（技术经理）</CardTitle>
                <CardDescription>已发布需求累计 TM 份额金币</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <LeaderboardTable rows={rankingTm} emptyLabel="暂无已认领 TM 的需求" />
              </CardContent>
            </Card>
          </div>
        </section>
      </div>

      <Dialog
        open={roleDialogOpen}
        onOpenChange={(open) => {
          if (open) setRoleDialogOpen(true);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-xl border-border"
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
                  className={`w-full rounded-lg border p-4 text-left transition ${
                    active
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                      : 'border-border bg-card hover:bg-accent'
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
