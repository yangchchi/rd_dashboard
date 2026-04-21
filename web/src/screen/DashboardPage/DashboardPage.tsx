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
import { LayoutDashboard, Filter, Plus, ChevronDown, Trophy } from 'lucide-react';
import { useRequirementsList } from '@/lib/rd-hooks';
import type { IRequirement } from '@/lib/rd-types';
import { getCurrentUser, updateStoredCurrentUser } from '@/lib/auth';
import { authApi } from '@/lib/auth-api';
import { toast } from 'sonner';

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

interface IKanbanColumn {
  id: string;
  title: string;
  status: IRequirement['status'];
  color: string;
  dotColor: string;
}

const columns: IKanbanColumn[] = [
  { id: 'backlog', title: '需求池', status: 'backlog', color: 'text-zinc-400', dotColor: 'bg-zinc-500' },
  { id: 'prd_writing', title: 'PRD编写中', status: 'prd_writing', color: 'text-blue-400', dotColor: 'bg-blue-500' },
  { id: 'spec_defining', title: '规格说明书', status: 'spec_defining', color: 'text-indigo-400', dotColor: 'bg-indigo-500' },
  { id: 'ai_developing', title: 'AI开发中', status: 'ai_developing', color: 'text-purple-400', dotColor: 'bg-purple-500' },
  { id: 'pending_acceptance', title: '待验收', status: 'pending_acceptance', color: 'text-orange-400', dotColor: 'bg-orange-500' },
  { id: 'released', title: '已发布', status: 'released', color: 'text-green-400', dotColor: 'bg-green-500' },
];

type FilterType = 'all' | 'mine' | 'submitted';

const DashboardPage: React.FC = () => {
  const router = useRouter();
  const currentProfile = useCurrentUserProfile();
  const { data: requirements = [], isLoading } = useRequirementsList();
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

  const filteredRequirements = requirements.filter((req) => {
    if (filter === 'mine') {
      return req.pm === currentProfile.user_id || req.tm === currentProfile.user_id;
    }
    if (filter === 'submitted') {
      return req.submitter === currentProfile.user_id;
    }
    return true;
  });

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
      <style jsx>{`
        .kanban-container {
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .glow-orb {
          position: absolute;
          width: 256px;
          height: 256px;
          background: hsl(217 91% 60% / 0.12);
          filter: blur(100px);
          pointer-events: none;
        }
      `}</style>

      <div className="w-full kanban-container relative">
        <div className="glow-orb top-0 right-0 opacity-50" />

        <section className="w-full flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl border border-white/[0.08] bg-primary/10 backdrop-blur-sm">
              <LayoutDashboard className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">仪表板</h1>
              <p className="text-sm text-muted-foreground">
                需求阶段分布（看板已移至{' '}
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => router.push('/requirements')}
                >
                  需求列表
                </button>
                ）
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-white/[0.1] bg-white/[0.05] text-muted-foreground backdrop-blur-sm transition-all duration-300 hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-foreground"
                >
                  <Filter className="w-4 h-4" />
                  {filterLabels[filter]}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-white/[0.1] bg-[hsl(222_47%_11%_/_0.92)] text-foreground backdrop-blur-xl">
                <DropdownMenuItem
                  onClick={() => setFilter('all')}
                  className="focus:bg-white/[0.08] focus:text-foreground"
                >
                  全部需求
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setFilter('mine')}
                  className="focus:bg-white/[0.08] focus:text-foreground"
                >
                  我负责的
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setFilter('submitted')}
                  className="focus:bg-white/[0.08] focus:text-foreground"
                >
                  我提交的
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              onClick={() => router.push('/requirements/new')}
              className="rounded-xl font-medium shadow-sm"
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {columns.map((column) => {
              const count = getColumnCount(column.status);
              const percentage =
                filteredRequirements.length > 0
                  ? Math.round((count / filteredRequirements.length) * 100)
                  : 0;

              return (
                <Card
                  key={column.id}
                  className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-card/70 backdrop-blur-xl transition-all duration-300 hover:border-white/[0.14]"
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
