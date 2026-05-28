'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile';
import { capabilityClient } from '@/lib/capability-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Streamdown } from '@/components/ui/streamdown';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { FileSearch, CheckCircle, XCircle, RotateCcw, ExternalLink, MessageSquare, History, AlertCircle, Star, Send } from 'lucide-react';
import { ListRowActionsMenu } from '@/components/business-ui/list-row-actions-menu';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error';
import { getCurrentUser } from '@/lib/auth';
import { rdAuditUpdate } from '@/lib/rd-actor';
import type { IAcceptanceRecord as IStoreAcceptanceRecord } from '@/lib/mock-data-store';
import {
  useAcceptanceRecords,
  useAddAcceptanceRecord,
  useDeleteRequirement,
  usePrdsList,
  useRequirementsList,
  useUpsertRequirement,
} from '@/lib/rd-hooks';
import type { IPrd, IRequirement } from '@/lib/rd-types';
import { isBrownfieldChangeType } from '@/lib/rd-types';
import { rdApi } from '@/lib/rd-api';
import {
  BrownfieldAcceptancePanel,
  buildMergedBaselineCapabilities,
} from './BrownfieldAcceptancePanel';

type IAcceptanceRecord = IStoreAcceptanceRecord;

interface IAcceptancePageProps {}

const getStatusBadge = (status: string) => {
  const config: Record<string, { label: string; className: string }> = {
    pending_acceptance: { label: '待验收', className: 'bg-[#eaddff] text-[#21005d]' },
    released: { label: '已发布', className: 'bg-green-500/10 text-green-700' },
  };
  const { label, className } = config[status] || { label: status, className: 'bg-[#f5eff7] text-foreground' };
  return <Badge className={`border-0 shadow-none ${className}`}>{label}</Badge>;
};

const getPriorityBadge = (priority: string) => {
  const colors: Record<string, string> = {
    P0: 'bg-red-500/10 text-red-700',
    P1: 'bg-amber-500/10 text-amber-800',
    P2: 'bg-blue-500/10 text-blue-700',
    P3: 'bg-slate-500/10 text-slate-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[priority] || colors.P3}`}>
      {priority}
    </span>
  );
};

const AcceptancePage: React.FC<IAcceptancePageProps> = () => {
  const router = useRouter();
  const currentProfile = useCurrentUserProfile();
  const { data: allRequirements = [] } = useRequirementsList();
  const { data: allPrds = [] } = usePrdsList();
  const { data: acceptanceHistory = [] } = useAcceptanceRecords();
  const addAcceptanceRecord = useAddAcceptanceRecord();
  const deleteRequirement = useDeleteRequirement();
  const upsertRequirement = useUpsertRequirement();
  const requirements = React.useMemo(
    () =>
      allRequirements.filter(
        (r) => r.status === 'pending_acceptance' || r.status === 'released'
      ),
    [allRequirements]
  );
  const [selectedRequirement, setSelectedRequirement] = useState<IRequirement | null>(null);
  const [isAcceptDialogOpen, setIsAcceptDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isRFCDialogOpen, setIsRFCDialogOpen] = useState(false);
  const [scores, setScores] = useState({ functionality: 3, valueMatch: 3, experience: 3 });
  const [feedback, setFeedback] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [mergeBaselineOnApprove, setMergeBaselineOnApprove] = useState(false);

  const findPrdForRequirement = React.useCallback(
    (reqId: string): IPrd | null => {
      const hit =
        allPrds.find((p) => p.requirementId === reqId) ??
        allPrds.find((p) => p.linkedRequirementIds?.includes(reqId));
      return hit ?? null;
    },
    [allPrds],
  );

  const handleAcceptClick = (req: IRequirement) => {
    setSelectedRequirement(req);
    setScores({ functionality: 3, valueMatch: 3, experience: 3 });
    setFeedback('');
    setIsAcceptDialogOpen(true);
  };

  const handleRejectClick = (req: IRequirement) => {
    setSelectedRequirement(req);
    setScores({ functionality: 3, valueMatch: 3, experience: 3 });
    setFeedback('');
    setIsRejectDialogOpen(true);
  };

  const handleRFCClick = () => {
    setIsRejectDialogOpen(false);
    setIsRFCDialogOpen(true);
  };

  const runAIAnalysis = async () => {
    if (!feedback.trim()) {
      toast.error('请先输入验收反馈');
      return;
    }
    setIsAnalyzing(true);
    setAiAnalysis('');
    try {
      const stream = await capabilityClient
        .load('acceptance_feedback_analyzer_1')
        .callStream('textSummary', { acceptance_feedback: feedback });
      for await (const chunk of stream) {
        const typedChunk = chunk as { summary?: string };
        if (typedChunk.summary) {
          setAiAnalysis(prev => prev + typedChunk.summary);
        }
      }
    } catch (error) {
      toast.error('AI分析失败，请稍后重试');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const submitAcceptance = async (approved: boolean) => {
    if (!selectedRequirement) return;
    const existingRecord = acceptanceHistory.find((r) => r.requirementId === selectedRequirement.id);
    if (existingRecord && existingRecord.result !== 'pending') {
      toast.error('该需求已存在验收单，不允许重复创建');
      setIsAcceptDialogOpen(false);
      setIsRejectDialogOpen(false);
      return;
    }

    const now = new Date().toISOString();
    const actorId = getCurrentUser()?.id?.trim() || currentProfile.user_id?.trim();
    const reviewerId = actorId || currentProfile.name || 'unknown';
    const newRecord: IAcceptanceRecord = {
      id: existingRecord?.result === 'pending' ? existingRecord.id : `acc-${Date.now()}`,
      requirementId: selectedRequirement.id,
      reviewer: reviewerId,
      scores,
      feedback,
      result: approved ? 'approved' : 'rejected',
      status: approved ? 'approved' : 'rejected',
      createdAt: existingRecord?.createdAt ?? now,
      updatedAt: now,
      createdBy: existingRecord?.createdBy ?? reviewerId,
      updatedBy: reviewerId,
    };

    try {
      await addAcceptanceRecord.mutateAsync(newRecord);
      await upsertRequirement.mutateAsync({
        ...selectedRequirement,
        status: approved ? 'released' : 'pending_acceptance',
        updatedAt: now,
        ...rdAuditUpdate(),
      });

      if (
        approved &&
        mergeBaselineOnApprove &&
        isBrownfieldChangeType(selectedRequirement.changeType ?? 'greenfield') &&
        selectedRequirement.productId &&
        selectedRequirement.baselineId
      ) {
        const bl = await rdApi.getProductBaseline(
          selectedRequirement.productId,
          selectedRequirement.baselineId,
        );
        const prd = findPrdForRequirement(selectedRequirement.id);
        const caps = buildMergedBaselineCapabilities(bl, prd);
        const user = getCurrentUser();
        const nextVersion = bl?.version ? `${bl.version}-post-${new Date().toISOString().slice(0, 10)}` : `v-${Date.now()}`;
        await rdApi.createProductBaseline(selectedRequirement.productId, {
          version: nextVersion,
          gitRef: bl?.gitRef ?? 'main',
          gitUrl: bl?.gitUrl ?? null,
          asBuiltMarkdown: `验收通过合并自需求 ${selectedRequirement.title}（${selectedRequirement.id}）`,
          frozenBy: user?.id ?? user?.name ?? null,
          capabilities: caps,
        });
        toast.success('已合并能力至新产品基线', { description: `版本 ${nextVersion}` });
      } else {
        toast.success(approved ? '验收已通过' : '验收已驳回');
      }
    } catch (e) {
      toastApiError(e, '验收提交失败');
    }
    setIsAcceptDialogOpen(false);
    setIsRejectDialogOpen(false);
    setMergeBaselineOnApprove(false);
    setFeedback('');
    setAiAnalysis('');
  };

  const submitRFC = async () => {
    if (!selectedRequirement) return;
    const prd = findPrdForRequirement(selectedRequirement.id);
    const baselineRef = selectedRequirement.baselineId?.trim();
    try {
      await upsertRequirement.mutateAsync({
        ...selectedRequirement,
        status: 'prd_writing',
        baselineId: baselineRef || selectedRequirement.baselineId,
        updatedAt: new Date().toISOString(),
        ...rdAuditUpdate(),
      });
      toast.success('RFC 已发起，需求已回退至 PRD 阶段', {
        description: baselineRef ? `基线引用已保留，可在 PRD 中继续基于原基线修订` : undefined,
      });
      if (prd?.id) {
        router.push(`/prd/${prd.id}/edit`);
      }
    } catch (e) {
      toastApiError(e, 'RFC 发起失败');
    }
    setIsRFCDialogOpen(false);
    setFeedback('');
  };

  const goToSandbox = (reqId: string) => {
    window.open(`https://sandbox.example.com/${reqId}`, '_blank');
  };

  const handleViewDetail = (reqId: string) => {
    router.push(`/requirements/${reqId}`);
  };

  const handleEditRequirement = (reqId: string) => {
    router.push(`/requirements/${reqId}/edit`);
  };

  const handleDeleteRequirement = (reqId: string) => {
    if (!window.confirm('确认删除该需求吗？')) return;
    void deleteRequirement.mutateAsync(reqId).then(() => toast.success('需求已删除'));
  };

  /** 提测/交付创建的占位单 result 为 pending，应出现在「待验收」；仅已通过/已驳回的验收进入「验收历史」 */
  const completedAcceptanceHistory = acceptanceHistory.filter(
    (r) => r.result === 'approved' || r.result === 'rejected'
  );
  const pendingRequirements = requirements.filter((r) => r.status === 'pending_acceptance');
  const approvedHistoryCount = completedAcceptanceHistory.filter((r) => r.result === 'approved').length;
  const rejectedHistoryCount = completedAcceptanceHistory.filter((r) => r.result === 'rejected').length;

  const renderRequirementCard = (req: IRequirement) => {
    const linkedPrd = findPrdForRequirement(req.id);
    const showBrownfield =
      isBrownfieldChangeType(req.changeType ?? 'greenfield') &&
      Boolean(req.productId && req.baselineId);

    return (
    <Card key={req.id} className="overflow-hidden rounded-[24px] border-0 bg-[#fffbff] shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
      <CardHeader className="border-b border-[#e8def8]/70 px-5 py-4 dark:border-border/25">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {getStatusBadge(req.status)}
              {getPriorityBadge(req.priority)}
              <span className="text-xs text-muted-foreground">期望上线: {req.expectedDate || '未设置'}</span>
            </div>
            <CardTitle className="text-xl font-semibold tracking-normal">
              <button
                type="button"
                className="text-left hover:text-primary"
                onClick={() => handleViewDetail(req.id)}
              >
                {req.title}
              </button>
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-1">需求编号: {req.id}</CardDescription>
          </div>
          {req.status === 'pending_acceptance' && (
            <ListRowActionsMenu
              stopPropagation
              triggerClassName="text-muted-foreground hover:bg-[#f5eff7] hover:text-foreground dark:hover:bg-muted"
              onView={() => handleViewDetail(req.id)}
              onEdit={() => handleEditRequirement(req.id)}
              onDelete={() => handleDeleteRequirement(req.id)}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-[22px] bg-[#f5eff7] p-4 dark:bg-muted">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileSearch className="h-4 w-4 text-primary" />
              原始需求
            </h4>
            <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">{req.description || '暂无需求描述'}</p>
          </div>
          <div className="rounded-[22px] bg-green-500/10 p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-800">
              <CheckCircle className="h-4 w-4" />
              实际实现
            </h4>
            <p className="text-sm leading-relaxed text-green-900/75">
              功能已开发完成，部署至沙箱环境。可进入沙箱核对实际交付效果。
            </p>
            <button
              className="mt-3 inline-flex items-center rounded-[16px] bg-[#fffbff] px-3 py-1.5 text-sm font-medium text-green-800 shadow-none hover:bg-white"
              onClick={() => goToSandbox(req.id)}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              访问沙箱环境
            </button>
          </div>
        </div>
        {showBrownfield ? (
          <BrownfieldAcceptancePanel requirement={req} prd={linkedPrd} />
        ) : null}
        {req.status === 'pending_acceptance' && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[#e8def8]/70 pt-4 dark:border-border/25">
            <Button
              size="sm"
              className="h-9 rounded-[18px] px-4 text-xs font-bold shadow-none"
              onClick={() => handleAcceptClick(req)}
            >
              <Send className="mr-1 h-4 w-4" />
              验收
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-9 rounded-[18px] px-4 text-xs font-bold shadow-none"
              onClick={() => handleRejectClick(req)}
            >
              <XCircle className="mr-1 h-4 w-4" />
              驳回
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
    );
  };

  return (
    <>
      <div className="flex w-full animate-in fade-in slide-in-from-bottom-2 flex-col gap-6 duration-300">
        <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.09em] text-muted-foreground">
              Acceptance Center
            </p>
            <h1 className="mt-1 text-[34px] font-medium leading-tight tracking-normal text-foreground">
              验收中心
            </h1>
          </div>
        </header>

        <section className="overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,rgba(234,221,255,0.94),rgba(159,242,230,0.62))] p-6 text-[#21005d] shadow-[0_10px_28px_rgba(103,80,164,0.07)]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: '待验收', value: pendingRequirements.length, note: '等待确认' },
              { label: '已通过', value: approvedHistoryCount, note: '完成发布' },
              { label: '已驳回', value: rejectedHistoryCount, note: '退回处理' },
            ].map((item) => (
              <div
                key={item.label}
                className="min-h-24 rounded-2xl bg-white/60 p-4"
              >
                <div className="text-[30px] font-semibold leading-none tabular-nums">{item.value}</div>
                <div className="mt-2 text-[13px] font-bold text-[#21005d]/75">{item.label}</div>
                <div className="mt-1 text-xs leading-snug text-[#21005d]/55">{item.note}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="overflow-x-auto rounded-[24px] bg-[#f5eff7] p-1.5 shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
              <TabsList className="inline-flex h-auto min-w-max gap-1.5 bg-transparent p-0">
                <TabsTrigger
                  value="pending"
                  className="h-10 rounded-[20px] px-4 text-muted-foreground transition-colors hover:bg-[#fffbff] hover:text-foreground data-[state=active]:bg-[#6750a4] data-[state=active]:text-white data-[state=active]:shadow-[0_6px_14px_rgba(103,80,164,0.22)]"
                >
                  待验收
                  {pendingRequirements.length > 0 && (
                    <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">
                      {pendingRequirements.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="h-10 rounded-[20px] px-4 text-muted-foreground transition-colors hover:bg-[#fffbff] hover:text-foreground data-[state=active]:bg-[#6750a4] data-[state=active]:text-white data-[state=active]:shadow-[0_6px_14px_rgba(103,80,164,0.22)]"
                >
                  验收历史
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="pending" className="mt-6">
              {pendingRequirements.length === 0 ? (
                <Empty className="rounded-[24px] bg-[#fffbff] py-16 shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CheckCircle className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>暂无待验收需求</EmptyTitle>
                    <EmptyDescription>当前没有需要您验收的需求，请稍后再来查看</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-4">
                  {pendingRequirements.map(renderRequirementCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              {completedAcceptanceHistory.length === 0 ? (
                <Empty className="rounded-[24px] bg-[#fffbff] py-16 shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <History className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>暂无验收记录</EmptyTitle>
                    <EmptyDescription>您还没有进行过任何验收操作</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-4">
                  {completedAcceptanceHistory.map(record => {
                    const req = requirements.find(r => r.id === record.requirementId) || allRequirements.find(r => r.id === record.requirementId);
                    return (
                      <Card key={record.id} className="overflow-hidden rounded-[24px] border-0 bg-[#fffbff] shadow-[0_8px_22px_rgba(29,27,32,0.045)] dark:bg-card/90">
                        <CardHeader className="border-b border-[#e8def8]/70 px-5 py-4 dark:border-border/25">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <CardTitle className="mt-1 text-xl font-semibold tracking-normal">{req?.title ?? '未知需求'}</CardTitle>
                              <CardDescription className="mt-1">验收单: {record.id}</CardDescription>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge
                                variant={
                                  record.result === 'approved'
                                    ? 'default'
                                    : record.result === 'rejected'
                                      ? 'destructive'
                                      : 'outline'
                                }
                              >
                                {record.result === 'approved'
                                  ? '已通过'
                                  : record.result === 'rejected'
                                    ? '已驳回'
                                    : '待验收'}
                              </Badge>
                              {req && (
                                <ListRowActionsMenu
                                  stopPropagation
                                  triggerClassName="text-muted-foreground hover:bg-[#f5eff7] hover:text-foreground dark:hover:bg-muted"
                                  onView={() => handleViewDetail(req.id)}
                                  onEdit={() => handleEditRequirement(req.id)}
                                  onDelete={() => handleDeleteRequirement(req.id)}
                                />
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-5">
                          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="rounded-[20px] bg-[#f5eff7] p-4 text-center dark:bg-muted">
                              <div className="text-2xl font-semibold tabular-nums text-[#21005d] dark:text-foreground">{record.scores.functionality}</div>
                              <div className="text-xs text-muted-foreground">功能完整性</div>
                            </div>
                            <div className="rounded-[20px] bg-[#f5eff7] p-4 text-center dark:bg-muted">
                              <div className="text-2xl font-semibold tabular-nums text-[#21005d] dark:text-foreground">{record.scores.valueMatch}</div>
                              <div className="text-xs text-muted-foreground">业务价值匹配</div>
                            </div>
                            <div className="rounded-[20px] bg-[#f5eff7] p-4 text-center dark:bg-muted">
                              <div className="text-2xl font-semibold tabular-nums text-[#21005d] dark:text-foreground">{record.scores.experience}</div>
                              <div className="text-xs text-muted-foreground">体验满意度</div>
                            </div>
                          </div>
                          {record.feedback && (
                            <div className="flex items-start gap-2 rounded-[20px] bg-[#f5eff7] p-4 text-sm text-muted-foreground dark:bg-muted">
                              <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                              <span>{record.feedback}</span>
                            </div>
                          )}
                          <div className="mt-3 text-xs text-muted-foreground">
                            验收人: {record.reviewer} · {new Date(record.createdAt).toLocaleString()}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>

        <Dialog open={isAcceptDialogOpen} onOpenChange={setIsAcceptDialogOpen}>
          <DialogContent className="max-w-lg overflow-hidden rounded-[24px] border-0 bg-[#fffbff] p-0 shadow-[0_18px_48px_rgba(29,27,32,0.14)] dark:bg-card">
            <DialogHeader className="border-b border-[#e8def8]/70 px-6 py-5 text-left dark:border-border/25">
              <DialogTitle>验收通过</DialogTitle>
              <DialogDescription>
                请对需求实现进行评分，确认验收通过
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 px-6 py-5">
              <div className="space-y-4 rounded-[22px] bg-[#f5eff7] p-4 dark:bg-muted">
                <div className="space-y-2">
                  <Label className="flex justify-between">
                    <span>功能完整性</span>
                    <span className="text-muted-foreground">{scores.functionality}/5</span>
                  </Label>
                  <Slider
                    value={[scores.functionality]}
                    onValueChange={([v]) => setScores(s => ({ ...s, functionality: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex justify-between">
                    <span>业务价值匹配度</span>
                    <span className="text-muted-foreground">{scores.valueMatch}/5</span>
                  </Label>
                  <Slider
                    value={[scores.valueMatch]}
                    onValueChange={([v]) => setScores(s => ({ ...s, valueMatch: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex justify-between">
                    <span>体验满意度</span>
                    <span className="text-muted-foreground">{scores.experience}/5</span>
                  </Label>
                  <Slider
                    value={[scores.experience]}
                    onValueChange={([v]) => setScores(s => ({ ...s, experience: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>验收反馈（可选）</Label>
                <Textarea
                  className="min-h-[88px] rounded-[20px] border-0 bg-[#f5eff7] shadow-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-muted"
                  placeholder="请输入验收反馈或建议..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                />
              </div>
              {selectedRequirement &&
              isBrownfieldChangeType(selectedRequirement.changeType ?? 'greenfield') &&
              selectedRequirement.productId ? (
                <div className="flex items-start gap-2 rounded-[20px] bg-[#f5eff7] p-4 dark:bg-muted">
                  <Checkbox
                    id="merge-baseline"
                    checked={mergeBaselineOnApprove}
                    onCheckedChange={(v) => setMergeBaselineOnApprove(Boolean(v))}
                  />
                  <Label htmlFor="merge-baseline" className="text-sm font-normal leading-snug">
                    验收通过后，将本次 PRD 功能合并为新产品基线草案（供下一需求引用）
                  </Label>
                </div>
              ) : null}
            </div>
            
            <DialogFooter className="border-t border-[#e8def8]/70 bg-[#fffbff] px-6 py-4 dark:border-border/25 dark:bg-card">
              <Button
                variant="outline"
                className="rounded-[20px] border-0 bg-[#f5eff7] shadow-none hover:bg-[#f1eaf4] dark:bg-muted"
                onClick={() => setIsAcceptDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                onClick={() => void submitAcceptance(true)}
                className="rounded-[20px] bg-success px-4 font-bold text-success-foreground shadow-none hover:bg-success/90"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                确认通过
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
          <DialogContent className="max-w-2xl overflow-hidden rounded-[24px] border-0 bg-[#fffbff] p-0 shadow-[0_18px_48px_rgba(29,27,32,0.14)] dark:bg-card">
            <DialogHeader className="border-b border-[#e8def8]/70 px-6 py-5 text-left dark:border-border/25">
              <DialogTitle>验收驳回</DialogTitle>
              <DialogDescription>
                请说明驳回原因，系统将提供AI改进建议
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 px-6 py-5">
              <div className="grid grid-cols-1 gap-4 rounded-[22px] bg-[#f5eff7] p-4 dark:bg-muted sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="flex justify-between text-xs">
                    <span>功能完整性</span>
                    <span>{scores.functionality}/5</span>
                  </Label>
                  <Slider
                    value={[scores.functionality]}
                    onValueChange={([v]) => setScores(s => ({ ...s, functionality: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex justify-between text-xs">
                    <span>业务价值匹配</span>
                    <span>{scores.valueMatch}/5</span>
                  </Label>
                  <Slider
                    value={[scores.valueMatch]}
                    onValueChange={([v]) => setScores(s => ({ ...s, valueMatch: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex justify-between text-xs">
                    <span>体验满意度</span>
                    <span>{scores.experience}/5</span>
                  </Label>
                  <Slider
                    value={[scores.experience]}
                    onValueChange={([v]) => setScores(s => ({ ...s, experience: v }))}
                    max={5}
                    min={1}
                    step={1}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>驳回原因</Label>
                <Textarea
                  className="min-h-[112px] rounded-[20px] border-0 bg-[#f5eff7] shadow-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-muted"
                  placeholder="请详细描述存在的问题和不符合需求的地方..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                />
              </div>
              
              {aiAnalysis && (
                <div className="rounded-[22px] bg-[#f5eff7] p-4 dark:bg-muted">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Star className="w-4 h-4" />
                    AI改进建议
                  </h4>
                  <div className="text-sm text-muted-foreground">
                    <Streamdown>{aiAnalysis}</Streamdown>
                  </div>
                </div>
              )}
            </div>
            
            <DialogFooter className="flex justify-between border-t border-[#e8def8]/70 bg-[#fffbff] px-6 py-4 dark:border-border/25 dark:bg-card">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="rounded-[20px] border-0 bg-[#f5eff7] shadow-none hover:bg-[#f1eaf4] dark:bg-muted"
                  onClick={runAIAnalysis}
                  disabled={isAnalyzing || !feedback.trim()}
                >
                  {isAnalyzing ? '分析中...' : 'AI分析'}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="rounded-[20px] border-0 bg-[#f5eff7] shadow-none hover:bg-[#f1eaf4] dark:bg-muted"
                  onClick={() => setIsRejectDialogOpen(false)}
                >
                  取消
                </Button>
                <Button 
                  variant="destructive"
                  className="rounded-[20px] px-4 font-bold shadow-none"
                  onClick={() => void submitAcceptance(false)}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  确认驳回
                </Button>
                <Button 
                  variant="default"
                  onClick={handleRFCClick}
                  className="rounded-[20px] bg-amber-600 px-4 font-bold shadow-none hover:bg-amber-700"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  发起RFC
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isRFCDialogOpen} onOpenChange={setIsRFCDialogOpen}>
          <DialogContent className="max-w-md overflow-hidden rounded-[24px] border-0 bg-[#fffbff] p-0 shadow-[0_18px_48px_rgba(29,27,32,0.14)] dark:bg-card">
            <DialogHeader className="border-b border-[#e8def8]/70 px-6 py-5 text-left dark:border-border/25">
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                发起RFC变更申请
              </DialogTitle>
              <DialogDescription>
                此操作将创建变更申请(RFC)，并自动回退需求至PRD阶段
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-3 px-6 py-5">
              <div className="rounded-[22px] bg-amber-500/10 p-4">
                <h4 className="mb-2 text-sm font-medium text-amber-900">变更影响说明</h4>
                <ul className="list-inside list-disc space-y-1 text-sm text-amber-950/75">
                  <li>需求状态将回退至「PRD编写中」</li>
                  <li>产品经理将收到变更通知</li>
                  <li>技术规格需要重新评审</li>
                  <li>AI开发任务将自动终止</li>
                </ul>
              </div>
              {selectedRequirement?.baselineId ? (
                <p className="text-xs text-muted-foreground">
                  将保留产品基线引用（baselineId={selectedRequirement.baselineId.slice(0, 12)}…），PRD 修订时仍可对照原基线。
                </p>
              ) : null}
            </div>
            
            <DialogFooter className="border-t border-[#e8def8]/70 bg-[#fffbff] px-6 py-4 dark:border-border/25 dark:bg-card">
              <Button
                variant="outline"
                className="rounded-[20px] border-0 bg-[#f5eff7] shadow-none hover:bg-[#f1eaf4] dark:bg-muted"
                onClick={() => setIsRFCDialogOpen(false)}
              >
                取消
              </Button>
              <Button 
                onClick={() => void submitRFC()}
                className="rounded-[20px] bg-amber-600 px-4 font-bold shadow-none hover:bg-amber-700"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                确认发起RFC
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default AcceptancePage;
