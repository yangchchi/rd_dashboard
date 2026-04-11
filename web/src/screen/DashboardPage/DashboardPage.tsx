'use client';
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserDisplay } from '@/components/business-ui/user-display';
import { LayoutDashboard, Filter, Plus, ChevronDown, Trophy } from 'lucide-react';
import { useRequirementsList } from '@/lib/rd-hooks';
import type { IRequirement } from '@/lib/rd-types';

const LEADERBOARD_TOP = 10;

function buildRanking(
  reqs: IRequirement[],
  pick: (r: IRequirement) => string | undefined | null
): { userId: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of reqs) {
    const k = pick(r);
    if (k == null || !String(k).trim()) continue;
    const id = String(k).trim();
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, LEADERBOARD_TOP);
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
  if (rank === 2) return 'bg-slate-400/15 text-slate-600 dark:text-slate-300 border-slate-400/30';
  if (rank === 3) return 'bg-orange-700/15 text-orange-700 dark:text-orange-400 border-orange-600/25';
  return 'bg-muted/50 text-muted-foreground border-border';
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
    () => buildRanking(filteredRequirements, (r) => r.submitter),
    [filteredRequirements]
  );
  const rankingPm = useMemo(
    () => buildRanking(filteredRequirements, (r) => r.pm),
    [filteredRequirements]
  );
  const rankingTm = useMemo(
    () => buildRanking(filteredRequirements, (r) => r.tm),
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

        <section className="w-full mt-10 max-w-[1400px]">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-primary/10">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">需求排行榜</h2>
              <p className="text-sm text-muted-foreground">
                与上方统计共用当前筛选；按各自关联的需求条数降序（最多各展示 {LEADERBOARD_TOP} 名）
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="rd-surface-card rd-surface-card-hover overflow-hidden border-border">
              <CardHeader className="border-b border-border/80 pb-3">
                <CardTitle className="text-base">提交人</CardTitle>
                <CardDescription>作为提交人的需求数量</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {rankingSubmitters.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">暂无数据</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {rankingSubmitters.map((row, i) => (
                      <li
                        key={row.userId}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold tabular-nums ${rankBadgeClass(i + 1)}`}
                          >
                            {i + 1}
                          </span>
                          <UserDisplay value={[row.userId]} size="small" />
                        </div>
                        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                          {row.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="rd-surface-card rd-surface-card-hover overflow-hidden border-border">
              <CardHeader className="border-b border-border/80 pb-3">
                <CardTitle className="text-base">产品经理</CardTitle>
                <CardDescription>担任 PM 的需求数量</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {rankingPm.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">暂无已认领 PM 的需求</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {rankingPm.map((row, i) => (
                      <li
                        key={row.userId}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold tabular-nums ${rankBadgeClass(i + 1)}`}
                          >
                            {i + 1}
                          </span>
                          <UserDisplay value={[row.userId]} size="small" />
                        </div>
                        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                          {row.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="rd-surface-card rd-surface-card-hover overflow-hidden border-border">
              <CardHeader className="border-b border-border/80 pb-3">
                <CardTitle className="text-base">技术经理</CardTitle>
                <CardDescription>担任 TM 的需求数量</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {rankingTm.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">暂无已认领 TM 的需求</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {rankingTm.map((row, i) => (
                      <li
                        key={row.userId}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold tabular-nums ${rankBadgeClass(i + 1)}`}
                          >
                            {i + 1}
                          </span>
                          <UserDisplay value={[row.userId]} size="small" />
                        </div>
                        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                          {row.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </>
  );
};

export default DashboardPage;
