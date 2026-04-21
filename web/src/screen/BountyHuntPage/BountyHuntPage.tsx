'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Coins, Send, Swords, Timer, LockKeyhole, Sparkles, Package, ShieldCheck, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { getCurrentUser } from '@/lib/auth';
import { mayClaimPmSlot, mayClaimTmSlot } from '@/lib/requirement-claim';
import {
  useAcceptBountyTask,
  useAddAcceptanceRecord,
  useBountyTasksList,
  useBountyHuntTasksList,
  useCreateBountyTask,
  useDeliverBountyTask,
  useRejectBountyTask,
  useRequirementsList,
  useSettleBountyTask,
  usePipelineTasksList,
  useUpsertRequirement,
} from '@/lib/rd-hooks';
import type { IBountyTask, IRequirement } from '@/lib/rd-types';

/** 悬赏描述可能含富文本/HTML，卡片仅展示纯文本预览 */
function htmlToPlainText(raw: string): string {
  if (!raw) return '';
  const noTags = raw.replace(/<[^>]*>/g, ' ');
  return noTags.replace(/\s+/g, ' ').trim();
}

function bountyStatusBracket(task: Pick<IBountyTask, 'acceptStatus'>): string {
  switch (task.acceptStatus) {
    case 'developing':
      return '【开发中】';
    case 'delivered':
      return '【待验收】';
    case 'settled':
      return '【已结算】';
    case 'rework':
      return '【返工】';
    case 'open':
    default:
      return '【待领取】';
  }
}

function requirementStatusBracket(requirement?: IRequirement): string {
  switch (requirement?.status) {
    case 'prd_writing':
      return '【PRD编写中】';
    case 'spec_defining':
      return '【规格定义】';
    case 'ai_developing':
      return '【AI开发中】';
    case 'pending_acceptance':
      return '【待验收】';
    case 'released':
      return '【已发布】';
    case 'backlog':
    default:
      return '【需求池】';
  }
}

const formatCountdown = (deadlineAt: string) => {
  const diff = new Date(deadlineAt).getTime() - Date.now();
  if (diff <= 0) return '已截止';
  const totalSec = Math.floor(diff / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

/**
 * 接单截止时间规则：需求「期望上线时间」提前 2 小时
 * - 若期望上线时间是纯日期（yyyy-mm-dd），按当日 23:59:59 作为上线时刻再回推 2 小时
 * - 若解析失败，回退到悬赏任务自身 deadlineAt
 */
function resolvePickupDeadline(task: IBountyTask, requirement?: IRequirement): string {
  const raw = requirement?.expectedDate?.trim();
  if (!raw) return task.deadlineAt;

  let onlineAt: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    onlineAt = new Date(`${raw}T23:59:59`);
  } else {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      onlineAt = parsed;
    }
  }
  if (!onlineAt) return task.deadlineAt;

  return new Date(onlineAt.getTime() - 2 * 60 * 60 * 1000).toISOString();
}

function difficultyFromCoins(coins: number): 'normal' | 'hard' | 'epic' {
  if (coins >= 201) return 'epic';
  if (coins >= 81) return 'hard';
  return 'normal';
}

function playChaChing() {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'triangle';
  osc1.frequency.value = 880;
  gain1.gain.value = 0.12;
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.value = 1320;
  gain2.gain.value = 0.1;
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  const now = ctx.currentTime;
  osc1.start(now);
  osc1.stop(now + 0.12);
  osc2.start(now + 0.08);
  osc2.stop(now + 0.24);
}

const BountyHuntPage: React.FC = () => {
  const REDUCE_MOTION_STORAGE_KEY = '__rd_bounty_hunt_reduce_motion';
  const profile = useCurrentUserProfile();
  const { data: huntTasks = [], isLoading } = useBountyHuntTasksList();
  const { data: allTasks = [] } = useBountyTasksList();
  const { data: requirements = [] } = useRequirementsList();
  const { data: pipelineTasks = [] } = usePipelineTasksList();
  const createBounty = useCreateBountyTask();
  const acceptBounty = useAcceptBountyTask();
  const deliverBounty = useDeliverBountyTask();
  const addAcceptanceRecord = useAddAcceptanceRecord();
  const settleBounty = useSettleBountyTask();
  const rejectBounty = useRejectBountyTask();
  const upsertRequirement = useUpsertRequirement();

  const [rewardCoins, setRewardCoins] = useState<number[]>([88]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [selectedRequirementId, setSelectedRequirementId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptingSlot, setAcceptingSlot] = useState<string | null>(null);
  const [showCollectedText, setShowCollectedText] = useState(false);
  const [showPublishFlyIn, setShowPublishFlyIn] = useState(false);
  const [publishSkin, setPublishSkin] = useState<'parchment' | 'holo'>('parchment');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [flightEffects, setFlightEffects] = useState<
    Array<{ id: string; kind: 'package' | 'coin'; x: number; y: number; dx: number; dy: number; delay: number }>
  >([]);
  const deliverTargetRef = useRef<HTMLDivElement | null>(null);
  const settleTargetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY);
      if (raw === 'true') {
        setReduceMotion(true);
      }
    } catch {
      // localStorage may be unavailable in strict privacy modes
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, reduceMotion ? 'true' : 'false');
    } catch {
      // ignore persistence failures and keep runtime behavior
    }
  }, [reduceMotion]);

  const backlogRequirements = useMemo(
    () => requirements.filter((r) => r.status === 'backlog'),
    [requirements]
  );
  const requirementById = useMemo(
    () => new Map(requirements.map((r) => [r.id, r])),
    [requirements]
  );
  const requirementIdsWithPipeline = useMemo(
    () => new Set(pipelineTasks.map((t) => t.requirementId)),
    [pipelineTasks]
  );

  /** 截止未过的悬赏占用需求；截止后可再次发布 */
  const requirementsAvailableForPublish = useMemo(() => {
    const activeReqIds = new Set(
      allTasks.filter((t) => new Date(t.deadlineAt).getTime() > nowTick).map((t) => t.requirementId)
    );
    return backlogRequirements.filter((r) => !activeReqIds.has(r.id));
  }, [backlogRequirements, allTasks, nowTick]);

  const reward = rewardCoins[0] || 0;
  const difficulty = difficultyFromCoins(reward);
  const difficultyLabel =
    difficulty === 'epic' ? '史诗（推荐 201+）' : difficulty === 'hard' ? '困难（推荐 81-200）' : '普通（推荐 20-80）';
  const actor = profile.user_id?.trim() || '';
  const currentUser = getCurrentUser();
  const myAccessRoleId = currentUser?.accessRoleId ?? null;
  const myAccessRoleIds = currentUser?.accessRoleIds;

  const myDevelopingTasks = useMemo(
    () =>
      allTasks.filter(
        (t) =>
          (t.pmUserId === actor || t.tmUserId === actor || t.hunterUserId === actor) &&
          t.acceptStatus === 'developing'
      ),
    [allTasks, actor]
  );
  const myDeliveredTasks = useMemo(
    () =>
      allTasks.filter(
        (t) =>
          (t.pmUserId === actor || t.tmUserId === actor || t.hunterUserId === actor) &&
          t.acceptStatus === 'delivered'
      ),
    [allTasks, actor]
  );
  const publisherPendingTasks = useMemo(
    () => allTasks.filter((t) => t.publisherId === actor && t.acceptStatus === 'delivered'),
    [allTasks, actor]
  );
  const publisherReworkTasks = useMemo(
    () => allTasks.filter((t) => t.publisherId === actor && t.acceptStatus === 'rework'),
    [allTasks, actor]
  );
  const myPublishedTasks = useMemo(
    () =>
      allTasks.filter((t) => {
        if (t.publisherId !== actor) return false;
        const reqStatus = String(requirementById.get(t.requirementId)?.status || '');
        // 排除已关闭/已验收需求（released；兼容历史 closed）
        return reqStatus !== 'released' && reqStatus !== 'closed';
      }),
    [allTasks, actor, requirementById]
  );
  const myPublishedCoinsTotal = useMemo(
    () => myPublishedTasks.reduce((s, t) => s + t.rewardCoins, 0),
    [myPublishedTasks]
  );

  /** 狩猎场底部「我的任务 / 我的悬赏」：仅在有数据时展示对应一栏；全无则不展示整块 */
  const hasMyTasksPanel =
    myDevelopingTasks.length > 0 || myDeliveredTasks.length > 0;
  const hasMyBountiesPanel = myPublishedTasks.length > 0;
  const showPersonalBountySection = hasMyTasksPanel || hasMyBountiesPanel;
  const personalSectionTwoColumn = hasMyTasksPanel && hasMyBountiesPanel;

  useEffect(() => {
    if (
      publishOpen &&
      selectedRequirementId &&
      !requirementsAvailableForPublish.some((r) => r.id === selectedRequirementId)
    ) {
      setSelectedRequirementId('');
    }
  }, [publishOpen, selectedRequirementId, requirementsAvailableForPublish]);

  const createTask = async () => {
    if (!selectedRequirementId) {
      toast.error('请选择要发布悬赏的需求');
      return;
    }
    if (!requirementsAvailableForPublish.some((r) => r.id === selectedRequirementId)) {
      toast.error('该需求已有悬赏在有效期内，截止前不可重复发布');
      return;
    }
    if (!title.trim()) {
      toast.error('请填写通缉令标题');
      return;
    }
    if (!actor) {
      toast.error('未识别当前用户，无法发布悬赏');
      return;
    }
    try {
      await createBounty.mutateAsync({
        requirementId: selectedRequirementId,
        publisherId: actor,
        publisherName: profile.name || profile.userName || actor,
        title: title.trim(),
        description: description.trim(),
        rewardCoins: reward,
        difficultyTag: difficulty,
        deadlineAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      });
      const selectedReq = backlogRequirements.find((r) => r.id === selectedRequirementId);
      if (selectedReq) {
        await upsertRequirement.mutateAsync({
          ...selectedReq,
          bountyPoints: reward,
          updatedAt: new Date().toISOString(),
        });
      }
      toast.success('悬赏已发布，任务已飞入赏金猎场');
      if (!reduceMotion) {
        setShowPublishFlyIn(true);
        window.setTimeout(() => setShowPublishFlyIn(false), 900);
      }
      setPublishOpen(false);
      setSelectedRequirementId('');
      setTitle('');
      setDescription('');
      setRewardCoins([88]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发布失败');
    }
  };

  const handleAcceptSlot = async (taskId: string, role: 'pm' | 'tm') => {
    if (!actor) {
      toast.error('未识别当前用户，无法领取任务');
      return;
    }
    const slotKey = `${taskId}:${role}`;
    setAcceptingSlot(slotKey);
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const result = await acceptBounty.mutateAsync({
        id: taskId,
        role,
        hunterUserId: actor,
        hunterUserName: profile.name || profile.userName || actor,
      });
      if (result.ok) {
        if (result.bothFilled) {
          toast.success('双槽已满；需求进入「AI开发中」请在流水线页创建研发流水线');
        } else if (role === 'pm') {
          toast.success('已领取产品经理槽位，尚待技术经理领取');
        } else {
          toast.success('已领取技术经理槽位');
        }
      } else {
        toast.error(`慢了一步，下次手速快点！补偿 +${result.consolationCoins ?? 1} 勇气金币`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '领取失败');
    } finally {
      setAcceptingSlot(null);
    }
  };

  const handleDeliver = async (task: IBountyTask) => {
    if (!actor) {
      toast.error('未识别当前用户，无法交付');
      return;
    }
    if (!requirementIdsWithPipeline.has(task.requirementId)) {
      toast.error('请先为该需求创建研发流水线后再提测/交付');
      return;
    }
    try {
      await deliverBounty.mutateAsync({ id: task.id, actorUserId: actor });
      const now = new Date().toISOString();
      await addAcceptanceRecord.mutateAsync({
        id: `acc_bounty_deliver_${task.id}_${Date.now()}`,
        requirementId: task.requirementId,
        reviewer: actor,
        scores: { functionality: 3, valueMatch: 3, experience: 3 },
        feedback: '悬赏任务已提测/交付，待发起人验收。',
        result: 'pending',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
      });
      const req = requirementById.get(task.requirementId);
      if (req && req.status !== 'pending_acceptance' && req.status !== 'released') {
        await upsertRequirement.mutateAsync({
          ...req,
          status: 'pending_acceptance',
          updatedAt: now,
          updatedBy: actor,
        });
      }
      toast.success('提测/交付成功，包裹已送达发起人');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '交付失败');
    }
  };

  const spawnFlight = (
    fromRect: DOMRect,
    toRect: DOMRect,
    kind: 'package' | 'coin',
    count = 1
  ) => {
    const fromX = fromRect.left + fromRect.width / 2;
    const fromY = fromRect.top + fromRect.height / 2;
    const toX = toRect.left + toRect.width / 2;
    const toY = toRect.top + toRect.height / 2;
    const next = Array.from({ length: count }, (_, i) => ({
      id: `${kind}_${Date.now()}_${i}`,
      kind,
      x: fromX + (kind === 'coin' ? i * 6 : 0),
      y: fromY + (kind === 'coin' ? i * 4 : 0),
      dx: toX - fromX + (kind === 'coin' ? (i % 2 === 0 ? -18 : 18) : 0),
      dy: toY - fromY + (kind === 'coin' ? (i % 3) * -8 : 0),
      delay: kind === 'coin' ? i * 40 : 0,
    }));
    if (reduceMotion) return;
    setFlightEffects((prev) => [...prev, ...next]);
    window.setTimeout(() => {
      setFlightEffects((prev) => prev.filter((it) => !next.some((n) => n.id === it.id)));
    }, 1400);
  };

  const handleSettle = async (taskId: string, triggerEl: HTMLButtonElement) => {
    try {
      await settleBounty.mutateAsync(taskId);
      setShowCollectedText(true);
      if (!reduceMotion) {
        playChaChing();
      }
      if (settleTargetRef.current) {
        spawnFlight(triggerEl.getBoundingClientRect(), settleTargetRef.current.getBoundingClientRect(), 'coin', 8);
      }
      toast.success('Bounty Collected！赏金已结算');
      window.setTimeout(() => setShowCollectedText(false), 1500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '结算失败');
    }
  };

  const handleReject = async (taskId: string) => {
    try {
      await rejectBounty.mutateAsync(taskId);
      toast.error('任务未达标，退回返工');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '打回失败');
    }
  };

  return (
    <div className="relative flex w-full flex-col gap-6 overflow-hidden">
      <style jsx>{`
        .publish-fly {
          animation: publishFly 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes publishFly {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-220px) translateX(380px) scale(0.6); opacity: 0; }
        }
        .flight-item {
          position: fixed;
          z-index: 50;
          pointer-events: none;
          animation: preciseFlight 0.95s ease-in-out forwards;
          animation-delay: var(--delay);
        }
        @keyframes preciseFlight {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0.45); opacity: 0; }
        }
      `}</style>
      {flightEffects.map((fx) => (
        <div
          key={fx.id}
          className="flight-item"
          style={
            {
              insetInlineStart: `${fx.x}px`,
              insetBlockStart: `${fx.y}px`,
              '--dx': `${fx.dx}px`,
              '--dy': `${fx.dy}px`,
              '--delay': `${fx.delay}ms`,
            } as React.CSSProperties
          }
        >
          {fx.kind === 'package' ? (
            <Package className="h-5 w-5 text-primary" />
          ) : (
            <Coins className="h-4 w-4 text-amber-500" />
          )}
        </div>
      ))}
      {showCollectedText ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
          <div className="rounded-2xl border border-amber-300/60 bg-amber-50/95 px-6 py-4 text-2xl font-black text-amber-700 shadow-xl">
            Bounty Collected!
          </div>
        </div>
      ) : null}
      {showPublishFlyIn ? (
        <div
          className={`pointer-events-none fixed left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 publish-fly rounded-lg border px-5 py-3 text-sm font-semibold shadow-lg ${
            publishSkin === 'parchment'
              ? 'border-amber-400/40 bg-amber-100/95 text-amber-800'
              : 'border-cyan-300/50 bg-cyan-100/85 text-cyan-800'
          }`}
        >
          {publishSkin === 'parchment' ? '羊皮纸悬赏令已投掷' : '全息悬赏令已投掷'}
        </div>
      ) : null}
      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="rd-page-title flex items-center gap-2">
            <Swords className="h-6 w-6 text-primary" />
            赏金猎场
          </h1>
          <p className="rd-page-desc mt-1">
            悬赏需产品经理与技术经理分别接槽；领取不改变需求流转状态。「AI开发中」请在流水线页创建研发流水线后生效。工序上请先接 PM，再接 TM。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={reduceMotion}
              onChange={(e) => setReduceMotion(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            减少动画
          </label>
          <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full px-5 shadow-md">
                <Sparkles className="mr-2 h-4 w-4" />
                发布悬赏
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>撰写通缉令</DialogTitle>
                <DialogDescription>描述你要消灭的Bug/实现的功能</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={publishSkin === 'parchment' ? 'default' : 'outline'}
                  onClick={() => setPublishSkin('parchment')}
                >
                  羊皮纸
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={publishSkin === 'holo' ? 'default' : 'outline'}
                  onClick={() => setPublishSkin('holo')}
                >
                  全息投影
                </Button>
              </div>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedRequirementId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedRequirementId(nextId);
                  const selectedReq = requirements.find((r) => r.id === nextId);
                  if (!selectedReq) return;
                  setTitle(selectedReq.title || '');
                  setDescription(selectedReq.description || '');
                }}
              >
                <option value="">选择关联需求</option>
                {requirementsAvailableForPublish.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} - {r.title}
                  </option>
                ))}
              </select>
              {requirementsAvailableForPublish.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  暂无可用需求：须为需求池状态，且同一需求在悬赏截止前仅能发布一次。
                </p>
              ) : null}
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="通缉令标题" />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述你要消灭的Bug/实现的功能"
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <Coins className="h-4 w-4 text-amber-500" />
                    金币奖励
                  </span>
                  <span className="font-mono tabular-nums">{reward}</span>
                </div>
                <Slider min={20} max={300} step={1} value={rewardCoins} onValueChange={setRewardCoins} />
                <p className="text-xs text-muted-foreground">难度等级：{difficultyLabel}</p>
              </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPublishOpen(false)}>
                  取消
                </Button>
                <Button
                  onClick={createTask}
                  disabled={createBounty.isPending || requirementsAvailableForPublish.length === 0}
                >
                  <Send className="mr-2 h-4 w-4" />
                  确认发布
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">加载赏金猎场任务中...</div>
        ) : null}
        {!isLoading && huntTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            当前暂无待领取悬赏
          </div>
        ) : null}
        {huntTasks.map((task) => {
          const linkedReq = requirementById.get(task.requirementId);
          const canTakePmThis = mayClaimPmSlot(
            linkedReq,
            actor || undefined,
            myAccessRoleId,
            myAccessRoleIds,
          );
          const canTakeTmThis = mayClaimTmSlot(
            linkedReq,
            actor || undefined,
            myAccessRoleId,
            myAccessRoleIds,
          );
          const pickupDeadline = resolvePickupDeadline(task, linkedReq);
          const countdown = formatCountdown(pickupDeadline);
          const isUrgent = countdown !== '已截止' && Number(countdown.slice(0, 2)) === 0;
          const pmTaken = Boolean(task.pmUserId || task.hunterUserId);
          const tmTaken = Boolean(task.tmUserId);
          const lockingPm = acceptingSlot === `${task.id}:pm`;
          const lockingTm = acceptingSlot === `${task.id}:tm`;
          const deadlinePassed = countdown === '已截止';
          const tmNeedsPm = !pmTaken;
          const plainDesc = htmlToPlainText(task.description || '');
          const statusBracket = requirementStatusBracket(requirementById.get(task.requirementId));
          return (
            <article key={task.id} className="rd-surface-card flex flex-col gap-4 p-4">
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-tight text-foreground">
                    <Link
                      href={`/requirements/${encodeURIComponent(task.requirementId)}`}
                      className="block truncate hover:text-primary hover:underline"
                      title={task.title}
                    >
                      {task.title}
                    </Link>
                  </h3>
                </div>
                <div className="flex min-w-[5.5rem] shrink-0 flex-col items-end gap-1 text-right">
                  <span className="text-[11px] font-medium tracking-tight text-muted-foreground">{statusBracket}</span>
                </div>
              </div>
                <p className="min-h-[2.75rem] line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground">
                  {plainDesc || '—'}
                </p>
              </div>

              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <span>PM</span>
                  <span className="font-medium text-foreground">
                    {pmTaken ? task.pmUserName || task.hunterUserName || task.pmUserId || task.hunterUserId : '待领取'}
                  </span>
                </div>
                <div className="mt-1 flex justify-between gap-2 border-t border-border/60 pt-1">
                  <span>TM</span>
                  <span className="font-medium text-foreground">
                    {tmTaken ? task.tmUserName || task.tmUserId : '待领取'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-background/60 p-3">
                  <p className="text-xs text-muted-foreground">悬赏金额</p>
                  <p className="mt-1 flex items-center gap-2 text-xl font-bold text-amber-600">
                    <Coins className="h-6 w-6" />
                    <span className="font-mono tabular-nums">{task.rewardCoins}</span>
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background/60 p-3">
                  <p className="text-xs text-muted-foreground">剩余接单时间</p>
                  <p
                    className={`mt-1 flex items-center gap-2 text-lg font-bold ${isUrgent ? 'text-orange-600' : 'text-foreground'}`}
                  >
                    <Timer className="h-5 w-5" />
                    <span className="font-mono tabular-nums">{countdown}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1"
                  variant="default"
                  disabled={
                    lockingPm ||
                    lockingTm ||
                    deadlinePassed ||
                    pmTaken ||
                    !canTakePmThis
                  }
                  onClick={() => void handleAcceptSlot(task.id, 'pm')}
                >
                  {lockingPm ? (
                    <span className="flex items-center gap-2">
                      <LockKeyhole className="h-4 w-4 animate-spin" />
                      PM 领取中…
                    </span>
                  ) : (
                    '领取 PM'
                  )}
                </Button>
                <Button
                  className="flex-1"
                  variant="secondary"
                  disabled={
                    lockingPm ||
                    lockingTm ||
                    deadlinePassed ||
                    tmTaken ||
                    tmNeedsPm ||
                    !canTakeTmThis
                  }
                  onClick={() => void handleAcceptSlot(task.id, 'tm')}
                >
                  {lockingTm ? (
                    <span className="flex items-center gap-2">
                      <LockKeyhole className="h-4 w-4 animate-spin" />
                      TM 领取中…
                    </span>
                  ) : (
                    '领取 TM'
                  )}
                </Button>
              </div>
              {!canTakePmThis && !canTakeTmThis ? (
                <p className="text-center text-xs text-muted-foreground">
                  当前账号无权领取该需求的 PM/TM（需为指定领取人，或未指定时须为产品经理/技术经理角色）
                </p>
              ) : null}
            </article>
          );
        })}
      </section>

      {showPersonalBountySection ? (
        <section
          className={`grid gap-4 ${personalSectionTwoColumn ? 'lg:grid-cols-2' : 'grid-cols-1'}`}
        >
          {hasMyTasksPanel ? (
            <div className="rd-surface-card min-w-0 space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">我的任务</h2>
                <div
                  ref={deliverTargetRef}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                    {(profile.name || profile.userName || 'U').slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-xs text-muted-foreground">发起人头像锚点</span>
                </div>
              </div>
              {myDevelopingTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无开发中任务</p>
              ) : (
                myDevelopingTasks.map((task) => {
                  const hasPipeline = requirementIdsWithPipeline.has(task.requirementId);
                  return (
                  <div key={task.id} className="rounded-md border border-border bg-background/60 p-3">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-tight text-foreground">{task.title}</p>
                        <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                          {htmlToPlainText(task.description || '') || '—'}
                        </p>
                        <Link
                          href={`/requirements/${encodeURIComponent(task.requirementId)}`}
                          className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                        >
                          查看需求详情
                        </Link>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <span className="text-[11px] font-medium text-muted-foreground">{bountyStatusBracket(task)}</span>
                      </div>
                    </div>
                    <div className="relative space-y-1.5">
                      <Button
                        size="sm"
                        variant={hasPipeline ? 'default' : 'secondary'}
                        onClick={(e) => {
                          if (deliverTargetRef.current) {
                            spawnFlight(
                              (e.currentTarget as HTMLButtonElement).getBoundingClientRect(),
                              deliverTargetRef.current.getBoundingClientRect(),
                              'package',
                              1
                            );
                          }
                          void handleDeliver(task);
                        }}
                        disabled={
                          deliverBounty.isPending ||
                          addAcceptanceRecord.isPending ||
                          upsertRequirement.isPending ||
                          !hasPipeline
                        }
                      >
                        提测/交付
                      </Button>
                      {!hasPipeline ? (
                        <p className="text-xs text-muted-foreground">须先在「交付引擎」为该需求创建流水线后方可提测/交付</p>
                      ) : null}
                    </div>
                  </div>
                );
                })
              )}
              {myDeliveredTasks.length > 0 ? (
                <p className="text-xs text-muted-foreground">已交付待验收：{myDeliveredTasks.length} 条</p>
              ) : null}
            </div>
          ) : null}

          {hasMyBountiesPanel ? (
            <div className="rd-surface-card min-w-0 space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">我的悬赏</h2>
                <div
                  ref={settleTargetRef}
                  className="shrink-0 rounded-full border border-amber-300/40 bg-amber-100/60 px-3 py-1 text-xs font-semibold text-amber-700"
                >
                  待结算金币 +{myPublishedCoinsTotal}
                </div>
              </div>
              {myPublishedTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无我发起的悬赏任务</p>
              ) : (
                myPublishedTasks.map((task) => (
                  <div key={task.id} className="relative rounded-md border border-border bg-background/60 p-3">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-semibold leading-tight text-foreground">
                          <span className="truncate">{task.title}</span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-amber-600">
                            <Coins className="h-4 w-4" />
                            <span className="font-mono tabular-nums text-sm">{task.rewardCoins}</span>
                          </span>
                        </p>
                        <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                          {htmlToPlainText(task.description || '') || '—'}
                        </p>
                        <Link
                          href={`/requirements/${encodeURIComponent(task.requirementId)}`}
                          className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                        >
                          查看需求详情
                        </Link>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <span className="text-[11px] font-medium text-muted-foreground">{bountyStatusBracket(task)}</span>
                      </div>
                    </div>
                    {/* <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={(e) => handleSettle(task.id, e.currentTarget as HTMLButtonElement)}
                    disabled={settleBounty.isPending}
                  >
                    <ShieldCheck className="mr-1 h-4 w-4" />
                    验收通过
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReject(task.id)} disabled={rejectBounty.isPending}>
                    <RotateCcw className="mr-1 h-4 w-4" />
                    打回返工
                  </Button>
                </div> */}
                  </div>
                ))
              )}
              {publisherReworkTasks.length > 0 ? (
                <p className="text-xs text-rose-600">待修改任务：{publisherReworkTasks.length}（任务未达标，退回返工）</p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};

export default BountyHuntPage;
